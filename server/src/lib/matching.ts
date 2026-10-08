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
import { istInstant, istYmd } from './schedule';
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
    .select('id, amount_paise, driver_id, created_at')
    .eq('trip_id', tripId)
    .eq('status', 'pending')
    .order('amount_paise', { ascending: true })
    .order('created_at', { ascending: true });
  const list = (quotes ?? []) as Array<{
    id: string;
    amount_paise: number;
    driver_id: string;
    created_at: string;
  }>;
  const items: Array<{ item: QuoteListItem; created: number }> = [];
  for (const q of list) {
    const d = await getDriverById(q.driver_id);
    items.push({
      created: new Date(q.created_at).getTime(),
      item: {
        id: q.id,
        name: d?.name ?? 'Driver',
        vehicle: d?.vehicle_no ?? '-',
        amountPaise: q.amount_paise,
        rating: d?.rating_avg ?? 0,
      },
    });
  }
  // Deterministic and fair: cheapest first, then whoever replied first, then
  // the better-rated driver. Equal quotes are no longer ordered by luck.
  items.sort(
    (a, b) =>
      a.item.amountPaise - b.item.amountPaise ||
      a.created - b.created ||
      b.item.rating - a.item.rating,
  );
  return items.map((x) => x.item);
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

export interface DispatchResult {
  /** Drivers the lead actually reached. */
  notified: number;
  /** Drivers whose send failed. */
  failed: number;
}

interface LeadCandidate {
  id: string;
  phone: string;
  name: string | null;
  vehicle_no: string | null;
  rating_avg: number;
  rating_count: number;
  distance_km: number;
}

/** Fisher-Yates, in place, on a copy. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Fair usage: how many platform-initiated *template* leads this driver has had
 * today (IST). Warm drivers are never limited - only paid sends are capped, so
 * a dormant driver cannot cost more than the cap allows and an active driver is
 * never throttled.
 */
async function underTemplateCap(driverId: string, cap: number): Promise<boolean> {
  if (cap <= 0) return true;
  const startOfDayIst = istInstant(istYmd(new Date()), 0).toISOString();
  const { count } = await supabaseAdmin
    .from('lead_dispatches')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driverId)
    .eq('channel', 'template')
    .gte('sent_at', startOfDayIst);
  return (count ?? 0) < cap;
}

function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Offer an open trip to the next batch of nearby drivers.
 *
 * Staged: the first call sends the nearest batch (with the nearest pool
 * shuffled so the same few drivers are not always offered first); the scheduler
 * widens only while the trip still needs quotes. `lead_dispatches` records every
 * driver already offered, so nobody is offered twice and the total cap is exact.
 *
 * Returns both counts so callers can tell "nobody is in range" (failed 0) from
 * "every send broke" (failed > 0); the latter stays retryable and is never
 * reported to the rider as no coverage.
 */
export async function dispatchLeads(trip: Trip): Promise<DispatchResult> {
  const settings = await getSettings();
  const rider = await getRiderById(trip.rider_id);

  const { data: existing } = await supabaseAdmin
    .from('lead_dispatches')
    .select('driver_id')
    .eq('trip_id', trip.id);
  const already = new Set(
    ((existing ?? []) as Array<{ driver_id: string }>).map((r) => r.driver_id),
  );

  const remainingCap = settings.max_drivers_per_lead - already.size;
  if (remainingCap <= 0) {
    await updateTrip(trip.id, { next_lead_batch_at: null });
    return { notified: 0, failed: 0 };
  }

  const { data: drivers } = await supabaseAdmin.rpc('find_nearby_drivers', {
    p_lat: trip.pickup_lat,
    p_lng: trip.pickup_lng,
    p_limit: settings.max_drivers_per_lead,
  });
  let candidates = ((drivers ?? []) as LeadCandidate[]).filter((d) => !already.has(d.id));

  if (candidates.length === 0) {
    await updateTrip(trip.id, { next_lead_batch_at: null });
    return { notified: 0, failed: 0 };
  }

  // Warm = inside the 24h WhatsApp window: free to reach and demonstrably at
  // their phone. One batched lookup for the whole candidate set.
  const { data: infoRows } = await supabaseAdmin
    .from('drivers')
    .select('id, last_reply_at, preferred_language')
    .in('id', candidates.map((d) => d.id));
  const info = new Map<
    string,
    { last_reply_at: string | null; preferred_language: string | null }
  >(
    (infoRows ?? []).map((r) => {
      const row = r as {
        id: string;
        last_reply_at: string | null;
        preferred_language: string | null;
      };
      return [row.id, row] as const;
    }),
  );
  const warmOf = (id: string): boolean => inWhatsAppWindow(info.get(id)?.last_reply_at);

  // First stage only: shuffle the nearest pool for fair exposure. Later stages
  // stay nearest-first, so the trip still prefers closer autos as it widens.
  if (already.size === 0 && settings.lead_stage_size > 0) {
    const pool = Math.min(candidates.length, settings.lead_stage_size * 2);
    candidates = [...shuffle(candidates.slice(0, pool)), ...candidates.slice(pool)];
  }

  // Warm-first, but only inside lead_warm_band_km of the pickup: a free, alert
  // driver fills stage 1 first, while a warm driver further out never jumps a
  // cold one who is closer to the rider. A stable partition keeps the shuffle's
  // rotation within each group.
  const band = settings.lead_warm_band_km;
  if (band > 0) {
    const preferred = (d: LeadCandidate): boolean => warmOf(d.id) && d.distance_km <= band;
    candidates = [...candidates.filter(preferred), ...candidates.filter((d) => !preferred(d))];
  }

  const batchSize = Math.min(settings.lead_stage_size, remainingCap, candidates.length);

  // Choose the batch up front, skipping dormant drivers who have hit their
  // template cap, so the offer rows exist before we send (a driver who replies
  // instantly must find the trip).
  const batch: Array<{ d: LeadCandidate; warm: boolean }> = [];
  for (const d of candidates) {
    if (batch.length >= batchSize) break;
    const warm = warmOf(d.id);
    if (!warm && !(await underTemplateCap(d.id, settings.template_leads_per_driver_per_day))) {
      continue;
    }
    batch.push({ d, warm });
  }

  if (batch.length === 0) {
    // Every candidate was a capped dormant driver: nothing more to send.
    await updateTrip(trip.id, { leads_dispatched: true, next_lead_batch_at: null });
    return { notified: 0, failed: 0 };
  }

  const { error: dispatchErr } = await supabaseAdmin
    .from('lead_dispatches')
    .upsert(
      batch.map(({ d }) => ({
        id: uuid(),
        trip_id: trip.id,
        driver_id: d.id,
        distance_km: d.distance_km,
      })),
      { onConflict: 'trip_id,driver_id', ignoreDuplicates: true },
    );
  if (dispatchErr) console.error('[LEAD DISPATCH INSERT ERROR]', trip.id, dispatchErr.message);

  const when = trip.pickup_at ? istTime(trip.pickup_at) : '';
  const fromLabel = placeLabel(trip.pickup_lat, trip.pickup_lng, trip.pickup_text);
  const toLabel = placeLabel(trip.drop_lat, trip.drop_lng, trip.drop_text);
  const tripDistance = trip.distance_km != null ? formatDistance(trip.distance_km) : '';

  let reached = 0;
  let failed = 0;
  const failedIds: string[] = [];

  for (const { d, warm } of batch) {
    const lang = langOf(info.get(d.id)?.preferred_language);
    const whenText = when || t('lead_when_now', lang);
    const nearText = formatDistance(d.distance_km);

    try {
      if (warm) {
        // Inside the window: the interactive lead with its Quote button.
        const ok = await send(d.phone, 'driver', tpl.leadMessage(
          lang,
          trip.id,
          fromLabel,
          nearText,
          toLabel,
          tripDistance,
          whenText,
        ), { sessionState: 'idle', tripId: trip.id });
        if (!ok) throw new Error('lead send failed');
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
          channel: warm ? 'interactive' : 'template',
        },
      });
    } catch (e) {
      // One bad number must not abort the rest of the batch.
      failed += 1;
      failedIds.push(d.id);
      console.error('[LEAD SEND FAILED]', trip.id, d.id, e);
    }
  }

  // A failed send did not actually reach the driver: drop the offer row so he
  // can be retried on the next stage instead of being silently excluded.
  if (failedIds.length > 0) {
    await supabaseAdmin
      .from('lead_dispatches')
      .delete()
      .eq('trip_id', trip.id)
      .in('driver_id', failedIds);
  }

  // Claim dispatch and schedule the next stage. A failed batch stays retryable.
  const sentSoFar = already.size + (batch.length - failedIds.length);
  const more =
    failed > 0 || (sentSoFar < settings.max_drivers_per_lead && candidates.length > batch.length);
  const patch: Record<string, unknown> = {
    leads_dispatched: true,
    next_lead_batch_at: more
      ? new Date(Date.now() + settings.lead_stage_interval_minutes * 60_000).toISOString()
      : null,
  };
  // A scheduled trip is created with quote_window_closes_at = pickup_at, but
  // leads go out earlier. Give the trip a real quote window from now to pickup.
  if (trip.pickup_at) {
    patch.quote_window_closes_at = new Date(
      Math.max(new Date(trip.pickup_at).getTime(), Date.now() + settings.quote_window_minutes * 60_000),
    ).toISOString();
  }
  await updateTrip(trip.id, patch);

  recordEvent('lead_stage_sent', {
    actorRole: 'system',
    tripId: trip.id,
    properties: { stage_size: batch.length, reached, failed, more },
  });

  // Nobody was reachable because every send failed, which is not the same as
  // nobody being in range - do not tell the rider the area is uncovered.
  if (reached === 0 && failed > 0) {
    recordEvent('lead_dispatch_failed', {
      actorRole: 'system',
      tripId: trip.id,
      properties: { attempted: batch.length, failed },
    });
  }

  return { notified: reached, failed };
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

    // Tell him his other quotes were withdrawn, so the vanished rides are not
    // a mystery (he can only be on one ride at a time).
    if ((others ?? []).length > 0) {
      await send(driver.phone, 'driver', tpl.otherQuotesWithdrawn(lang), {
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
    // The pick deadline starts now, when the rider is actually shown the list -
    // not from window close, so an outage cannot prompt and expire in one tick.
    await updateTrip(trip.id, {
      pick_deadline_at: new Date(
        Date.now() + settings.pick_deadline_minutes * 60_000,
      ).toISOString(),
    });
    await sendRiderQuoteList(trip, { windowClosed: true });
    await upsertSession(rider.phone, {
      state: 'collecting_quotes',
      role: 'rider',
      data: { pending_trip_id: trip.id, choice_prompted: true },
    });
    return;
  }

  // Nobody was ever told: a dispatch that failed outright, or a scheduled lead
  // window the server missed. Telling the rider "no autos responded" would be a
  // lie, so report that nobody could be reached instead.
  if (!trip.leads_dispatched) {
    await noCoverExpire(trip);
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
  const { notified, failed } = await dispatchLeads(trip);
  if (notified === 0) {
    // Distinguish "nobody covers this pickup" from "every send failed". A
    // failed batch stays undispatched and is retried on the next pass; the
    // rider must not be told the area is dead when the problem is ours.
    if (failed > 0) return;
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

/**
 * Put a closed trip back on the road: reset it to a clean bookable state,
 * dispatch leads and tell the rider. Shared by the rider's "Try again" and by
 * the office reopening a trip, so an office reopen can never resurrect a
 * finished trip with `leads_dispatched` still set and nobody to dispatch it.
 * Returns false when the reset write failed.
 */
export async function reopenTrip(trip: Trip): Promise<boolean> {
  const settings = await getSettings();
  const window = new Date(Date.now() + settings.quote_window_minutes * 60_000).toISOString();
  const ok = await updateTrip(trip.id, {
    status: 'open',
    leads_dispatched: false,
    quote_window_closes_at: window,
    driver_id: null,
    assigned_at: null,
    quoted_amount_paise: null,
    done_at: null,
    completed_at: null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
  });
  if (!ok) return false;

  // A reopened trip starts a fresh dispatch: forget who was offered before, or
  // staged dispatch would think everyone is already notified and expire it as
  // no-cover (the original offers are void - the trip is being re-run).
  await supabaseAdmin.from('lead_dispatches').delete().eq('trip_id', trip.id);

  const rider = await getRiderById(trip.rider_id);
  if (rider) {
    await upsertSession(rider.phone, {
      state: 'collecting_quotes',
      role: 'rider',
      current_trip_id: trip.id,
      data: { pending_trip_id: trip.id },
    });
  }

  const reopened: Trip = { ...trip, status: 'open', leads_dispatched: false };
  const { notified, failed } = await dispatchLeads(reopened);
  if (notified === 0) {
    if (failed === 0) await noCoverExpire(reopened);
    return true;
  }
  if (rider) {
    const lang = langOf(rider.preferred_language);
    await send(rider.phone, 'rider', tpl.findingAuto(lang, trip.id, notified), {
      sessionState: 'collecting_quotes',
      tripId: trip.id,
    });
  }
  return true;
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

/**
 * A scheduled trip is close to pickup and still has no quote. Expire it and
 * warn the rider now, so they can arrange a backup - rather than discovering it
 * at the pickup time, when they are already leaving for the bus or train.
 */
export async function atRiskExpire(trip: Trip): Promise<void> {
  if (trip.status !== 'open') return;
  await updateTrip(trip.id, { status: 'expired' });

  const rider = await getRiderById(trip.rider_id);
  if (rider) {
    const lang = langOf(rider.preferred_language);
    const time = trip.pickup_at
      ? new Date(trip.pickup_at).toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : '';
    await send(rider.phone, 'rider', tpl.scheduleAtRisk(lang, time, (await getSettings()).helpline ?? '-'), {
      sessionState: 'idle',
      tripId: trip.id,
    });
    const { resetSession } = await import('../state/store');
    await resetSession(rider.phone, { state: 'idle', role: 'rider' });
  }

  recordEvent('expired', {
    actorRole: 'system',
    tripId: trip.id,
    properties: { no_quotes_before_pickup: true },
  });
}

/**
 * The rider was shown quotes and given a deadline to pick one, and did not.
 * Expire the trip so it cannot block them from booking again forever, lapse the
 * quotes, and tell them.
 */
export async function pickDeadlineExpire(trip: Trip): Promise<void> {
  if (trip.status !== 'open') return;
  await supabaseAdmin
    .from('quotes')
    .update({ status: 'lapsed' })
    .eq('trip_id', trip.id)
    .eq('status', 'pending');
  await updateTrip(trip.id, { status: 'expired' });

  const rider = await getRiderById(trip.rider_id);
  if (rider) {
    const lang = langOf(rider.preferred_language);
    await send(rider.phone, 'rider', tpl.pickTimeout(lang, trip.id), {
      sessionState: 'awaiting_retry_choice',
      tripId: trip.id,
    });
    const { resetSession } = await import('../state/store');
    await resetSession(rider.phone, { state: 'awaiting_retry_choice', role: 'rider' });
  }

  recordEvent('expired', {
    actorRole: 'system',
    tripId: trip.id,
    properties: { pick_timeout: true },
  });
}
