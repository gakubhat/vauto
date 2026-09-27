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
import { getSession, upsertSession } from '../state/store';
import { formatDistance } from './geo';
import { sendTemplate, wamidOf } from '../whatsapp/api';
import type { QuoteListItem } from '../whatsapp/templates';

/**
 * WhatsApp only delivers free-form messages within 24h of the recipient's
 * last message. 22h leaves a buffer so no lead is caught mid-expiry.
 */
const WHATSAPP_WINDOW_MS = 22 * 3600_000;

/**
 * True when a driver messaged us recently enough to receive free-form
 * messages. Otherwise the lead must go out as an approved template.
 */
export function inWhatsAppWindow(lastReplyAt: string | null | undefined): boolean {
  if (!lastReplyAt) return false;
  return Date.now() - new Date(lastReplyAt).getTime() < WHATSAPP_WINDOW_MS;
}

/** ISO 639-1 code used when sending a template. */
function langCode(lang: Lang): string {
  return lang === 'kannada' ? 'kn' : 'en';
}

export function quoteWindowClosed(trip: Trip): boolean {
  if (!trip.quote_window_closes_at) return false;
  return new Date(trip.quote_window_closes_at).getTime() <= Date.now();
}

async function pendingQuoteItems(tripId: string): Promise<QuoteListItem[]> {
  const { data: quotes } = await supabaseAdmin
    .from('quotes')
    .select('id, amount_paise, driver_id')
    .eq('trip_id', tripId)
    .eq('status', 'pending')
    .order('amount_paise', { ascending: true });
  const list = (quotes ?? []) as Array<{ id: string; amount_paise: number; driver_id: string }>;
  const items: QuoteListItem[] = [];
  for (const q of list) {
    const d = await getDriverById(q.driver_id);
    items.push({
      id: q.id,
      name: d?.name ?? 'Driver',
      vehicle: d?.vehicle_no ?? '-',
      amountPaise: q.amount_paise,
      rating: d?.rating_avg ?? 0,
    });
  }
  return items;
}

/** Re-sends the full quote list so the rider always picks from one place. */
export async function sendRiderQuoteList(
  trip: Trip,
  opts: { windowClosed?: boolean } = {},
): Promise<boolean> {
  const rider = await getRiderById(trip.rider_id);
  if (!rider) return false;
  const quotes = await pendingQuoteItems(trip.id);
  if (quotes.length === 0) return false;
  const lang = langOf(rider.preferred_language);
  await send(rider.phone, 'rider', tpl.quoteList(lang, trip.id, quotes, opts.windowClosed === true), {
    sessionState: 'collecting_quotes',
    tripId: trip.id,
  });
  return true;
}

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

  const when = trip.pickup_at
    ? new Date(trip.pickup_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  const fromLabel = placeLabel(trip.pickup_lat, trip.pickup_lng, trip.pickup_text);
  const toLabel = placeLabel(trip.drop_lat, trip.drop_lng, trip.drop_text);
  const tripDistance = trip.distance_km != null ? formatDistance(trip.distance_km) : '';

  let reached = 0;
  let failed = 0;

  for (const d of list) {
    const driverRow = await getDriverById(d.id);
    const lang = langOf(driverRow?.preferred_language);
    const whenText = when || t('lead_when_now', lang);
    const nearText = formatDistance(d.distance_km);

    try {
      if (inWhatsAppWindow(driverRow?.last_reply_at)) {
        // Inside the window: the interactive lead with its Quote button.
        await send(d.phone, 'driver', tpl.leadMessage(
          lang,
          trip.id,
          fromLabel,
          nearText,
          toLabel,
          tripDistance,
          whenText,
        ), { sessionState: 'idle', tripId: trip.id });
      } else {
        // Outside: only an approved template can reach them. Body copy must
        // carry the "reply with your price" instruction, because a template
        // has no id-bearing Quote button to tap.
        const res = await sendTemplate(d.phone, settings.lead_template, langCode(lang), [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: fromLabel },
              { type: 'text', text: toLabel },
              { type: 'text', text: nearText },
              { type: 'text', text: whenText },
            ],
          },
        ]);
        const wamid = await wamidOf(res);
        await supabaseAdmin
          .from('lead_dispatches')
          .update({ channel: 'template', template_name: settings.lead_template, wamid })
          .eq('trip_id', trip.id)
          .eq('driver_id', d.id);
      }

      reached += 1;
      recordEvent('lead_sent', {
        actorRole: 'system',
        actorId: d.id,
        tripId: trip.id,
        properties: {
          distance_km: d.distance_km,
          rider_id: rider?.id ?? null,
          channel: inWhatsAppWindow(driverRow?.last_reply_at) ? 'interactive' : 'template',
        },
      });
    } catch (e) {
      // One bad number must not abort the rest of the batch.
      failed += 1;
      console.error('[LEAD SEND FAILED]', trip.id, d.id, e);
    }
  }

  // Only claim dispatch once we know how many actually went out, so the rider
  // is never told "we told N autos" when some silently failed.
  await updateTrip(trip.id, { leads_dispatched: true });

  // Nobody was reachable because every send failed, which is not the same as
  // nobody being in range - do not tell the rider the area is uncovered.
  if (reached === 0 && failed > 0) {
    recordEvent('lead_dispatch_failed', {
      actorRole: 'system',
      tripId: trip.id,
      properties: { attempted: list.length, failed },
    });
    return 0;
  }

  return reached;
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

/** Window closed: expire if nobody quoted; otherwise the rider must pick
 *  (unless auto_pick_cheapest is on). Idempotent so the scheduler can retry. */
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

  if (pending.length > 0) {
    const rider = await getRiderById(trip.rider_id);
    if (!rider) return;
    const session = await getSession(rider.phone);
    if (session?.data?.choice_prompted) return;
    await sendRiderQuoteList(trip, { windowClosed: true });
    await upsertSession(rider.phone, {
      state: 'collecting_quotes',
      role: 'rider',
      data: { pending_trip_id: trip.id, choice_prompted: true },
    });
    return;
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

/**
 * Scheduled trip: the lead window just opened. Tell the rider what actually
 * happened - how many autos were notified, or that nobody covers the area -
 * so a scheduled trip is never silently dead.
 */
export async function dispatchScheduledLeads(trip: Trip): Promise<void> {
  const notified = await dispatchLeads(trip);
  if (notified === 0) {
    // Distinguish "nobody covers this pickup" from "every send failed" - the
    // rider must not be told the area is dead when the problem is ours. A
    // failed batch is logged as lead_dispatch_failed and left for the retry.
    if (await hadDispatchFailure(trip.id)) return;
    await noCoverExpire(trip);
    return;
  }
  const rider = await getRiderById(trip.rider_id);
  if (!rider) return;
  const lang = langOf(rider.preferred_language);
  await send(rider.phone, 'rider', tpl.findingAuto(lang, trip.id, notified), {
    sessionState: 'collecting_quotes',
    tripId: trip.id,
  });
}

/** True when the trip's dispatch recorded an outright send failure. */
async function hadDispatchFailure(tripId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('events')
    .select('id')
    .eq('trip_id', tripId)
    .eq('type', 'lead_dispatch_failed')
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * No driver's coverage reaches this pickup, so nobody was notified at all.
 * Expire immediately rather than leaving the rider to wait out a quote window
 * that cannot produce a single quote.
 */
export async function noCoverExpire(trip: Trip): Promise<void> {
  // Guarded by status: the scheduler can retry, and a trip already expired
  // must not send a second "no autos cover this area" to the rider.
  if (trip.status !== 'open') return;
  await updateTrip(trip.id, { status: 'expired' });
  const rider = await getRiderById(trip.rider_id);
  if (rider) {
    const lang = langOf(rider.preferred_language);
    await send(rider.phone, 'rider', tpl.noCover(lang, trip.id), {
      sessionState: 'awaiting_retry_choice',
      tripId: trip.id,
    });
    const { resetSession } = await import('../state/store');
    await resetSession(rider.phone, { state: 'awaiting_retry_choice', role: 'rider' });
  }
  recordEvent('expired', {
    actorRole: 'system',
    tripId: trip.id,
    properties: { no_cover: true },
  });
}
