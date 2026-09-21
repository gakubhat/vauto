import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '../supabase/client';
import { recordEvent } from '../lib/events';
import { send } from '../lib/send';
import { langOf, t, type Lang } from '../whatsapp/i18n';
import * as tpl from '../whatsapp/templates';
import {
  getDriverById,
  getRiderById,
  getSettings,
  getTrip,
  updateTrip,
  type Trip,
} from '../state/queries';
import { formatRupees } from './money';
import { formatDistance } from './geo';

export function placeLabel(
  lat: number | null,
  lng: number | null,
  text: string | null,
): string {
  if (text) return text;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  }
  return '?';
}

function randomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Offer an open trip to nearby drivers. Idempotent - guarded by
 * trip.leads_dispatched so a retry never double-notifies.
 */
export async function dispatchLeads(trip: Trip): Promise<number> {
  if (trip.leads_dispatched) return 0;

  const settings = await getSettings();
  const rider = await getRiderById(trip.rider_id);

  const { data: drivers } = await supabaseAdmin.rpc('find_nearby_drivers', {
    p_lat: trip.pickup_lat,
    p_lng: trip.pickup_lng,
    p_limit: settings.max_drivers_per_lead,
  });

  const list = (drivers ?? []) as Array<{
    id: string;
    phone: string;
    name: string | null;
    vehicle_no: string | null;
    rating_avg: number;
    rating_count: number;
    distance_km: number;
  }>;

  if (list.length === 0) return 0;

  await supabaseAdmin.from('lead_dispatches').insert(
    list.map((d) => ({
      id: uuid(),
      trip_id: trip.id,
      driver_id: d.id,
      distance_km: d.distance_km,
    })),
  );

  await updateTrip(trip.id, { leads_dispatched: true });

  const when = trip.pickup_at
    ? new Date(trip.pickup_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  for (const d of list) {
    const driverRow = await getDriverById(d.id);
    const lang = langOf(driverRow?.preferred_language);
    const whenText = when || t('lead_when_now', lang);
    await send(d.phone, 'driver', tpl.leadMessage(
      lang,
      trip.id,
      placeLabel(trip.pickup_lat, trip.pickup_lng, trip.pickup_text),
      formatDistance(d.distance_km),
      placeLabel(trip.drop_lat, trip.drop_lng, trip.drop_text),
      formatDistance(trip.distance_km ?? 0),
      whenText,
    ), { sessionState: 'idle', tripId: trip.id });
    recordEvent('lead_sent', {
      actorRole: 'system',
      actorId: d.id,
      tripId: trip.id,
      properties: { distance_km: d.distance_km, rider_id: rider?.id ?? null },
    });
  }

  return list.length;
}

export interface AssignResult {
  ok: boolean;
  reason?: 'taken' | 'expired' | 'conflict';
  tripId?: string;
}

/**
 * Assign a driver to an open trip.
 *
 * The conditional UPDATE plus one_active_trip_per_driver is what prevents
 * double-booking: if two riders accept the same driver concurrently, one
 * UPDATE succeeds and the other violates the partial unique index and rolls
 * back. Postgres decides; there is no application-level lock.
 */
export async function acceptQuote(quoteId: string): Promise<AssignResult> {
  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .maybeSingle();
  if (!quote) return { ok: false, reason: 'taken' };

  const trip = await getTrip(quote.trip_id as string);
  if (!trip) return { ok: false, reason: 'taken' };
  if (trip.status !== 'open') return { ok: false, reason: 'expired' };

  const { data: updated, error } = await supabaseAdmin
    .from('trips')
    .update({
      driver_id: quote.driver_id,
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      quoted_amount_paise: quote.amount_paise,
    })
    .eq('id', trip.id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();

  if (error || !updated) return { ok: false, reason: 'conflict' };

  // This driver's other pending quotes are withdrawn.
  const { data: others } = await supabaseAdmin
    .from('quotes')
    .select('id, trip_id')
    .eq('driver_id', quote.driver_id)
    .eq('status', 'pending')
    .neq('id', quoteId);

  for (const o of others ?? []) {
    await supabaseAdmin.from('quotes').update({ status: 'withdrawn' }).eq('id', o.id);
    recordEvent('quote_withdrawn', {
      actorRole: 'system',
      actorId: quote.driver_id as string,
      tripId: o.trip_id as string,
      properties: { quote_id: o.id },
    });
  }

  await supabaseAdmin.from('quotes').update({ status: 'accepted' }).eq('id', quoteId);
  await supabaseAdmin
    .from('quotes')
    .update({ status: 'lapsed' })
    .eq('trip_id', trip.id)
    .eq('status', 'pending');

  const code = randomCode();
  await supabaseAdmin.from('trip_otps').upsert({
    trip_id: trip.id,
    code,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  await updateTrip(trip.id, { code_4digit: code });

  const rider = await getRiderById(trip.rider_id);
  const driver = await getDriverById(quote.driver_id as string);

  if (rider) {
    const lang = langOf(rider.preferred_language);
    await send(
      rider.phone,
      'rider',
      tpl.assignedRider(
        lang,
        driver?.name ?? 'Driver',
        driver?.vehicle_no ?? '-',
        driver?.phone ?? '-',
        code,
        trip.id,
      ),
      { sessionState: 'trip_assigned', tripId: trip.id },
    );
  }
  if (driver) {
    const lang: Lang = langOf(driver.preferred_language);
    await send(
      driver.phone,
      'driver',
      tpl.youGotTrip(
        lang,
        quote.amount_paise as number,
        rider?.name ?? 'Rider',
        rider?.phone ?? '-',
        placeLabel(trip.pickup_lat, trip.pickup_lng, trip.pickup_text),
        trip.id,
      ),
      { sessionState: 'trip_assigned', tripId: trip.id },
    );

    // Reply buttons and a URL button cannot share a message, so navigation
    // is sent separately.
    if (typeof trip.pickup_lat === 'number' && typeof trip.pickup_lng === 'number') {
      await send(driver.phone, 'driver', tpl.navigateTo(lang, 'pickup', trip.pickup_lat, trip.pickup_lng), {
        sessionState: 'trip_assigned',
        tripId: trip.id,
      });
    }
  }

  recordEvent('trip_assigned', {
    actorRole: 'rider',
    actorId: trip.rider_id,
    tripId: trip.id,
    properties: { driver_id: quote.driver_id, amount_paise: quote.amount_paise },
  });

  return { ok: true, tripId: trip.id };
}

/** Window closed: auto-accept the cheapest quote, or expire the trip. */
export async function closeQuoteWindow(trip: Trip): Promise<void> {
  const settings = await getSettings();

  const { data: quotes } = await supabaseAdmin
    .from('quotes')
    .select('*')
    .eq('trip_id', trip.id)
    .eq('status', 'pending')
    .order('amount_paise', { ascending: true });

  const pending = (quotes ?? []) as Array<{ id: string; amount_paise: number }>;

  if (pending.length > 0 && settings.auto_pick_cheapest) {
    for (const q of pending) {
      const res = await acceptQuote(q.id);
      if (res.ok) return;
    }
  }

  await updateTrip(trip.id, { status: 'expired' });
  const rider = await getRiderById(trip.rider_id);
  if (rider) {
    const lang = langOf(rider.preferred_language);
    await send(rider.phone, 'rider', tpl.noQuotes(lang, trip.id), {
      sessionState: 'awaiting_retry_choice',
      tripId: trip.id,
    });
    const { resetSession } = await import('../state/store');
    await resetSession(rider.phone, { state: 'awaiting_retry_choice', role: 'rider' });
  }
  recordEvent('expired', { actorRole: 'system', tripId: trip.id });
}
