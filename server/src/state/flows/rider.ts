import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '../../supabase/client';
import { recordEvent } from '../../lib/events';
import { estimateRoadKm } from '../../lib/geo';
import { resolveAddress } from '../../lib/geocode';
import { send } from '../../lib/send';
import { dispatchLeads, noCoverExpire, placeLabel, sendRiderQuoteList } from '../../lib/matching';
import { openHelpRequest } from '../../lib/help';
import { handleHelpRequest, isHelpRequest } from '../../lib/help-command';
import { langOf, t, type Lang } from '../../whatsapp/i18n';
import * as tpl from '../../whatsapp/templates';
import {
  ensureRider,
  getActiveTripForRider,
  getDriverById,
  getSettings,
  getTrip,
  updateTrip,
  type Trip,
} from '../queries';
import { resetSession, upsertSession, type Session } from '../store';

export interface RiderInput {
  text?: string;
  location?: { lat: number; lng: number; name?: string; address?: string };
}

const ACTIVE = ['open', 'assigned', 'arrived', 'in_progress', 'disputed'];

async function sendR(
  phone: string,
  msg: Parameters<typeof send>[2],
  state: string,
  tripId?: string | null,
): Promise<void> {
  await send(phone, 'rider', msg, { sessionState: state, tripId: tripId ?? null });
}

/** After a completed ride: the fare check if enabled, then the rating. Reached
 *  either straight from the confirmation or after the optional location ask. */
async function afterCompletion(phone: string, tripId: string, lang: Lang): Promise<void> {
  const trip = await getTrip(tripId);
  const settings = await getSettings();
  const driver = trip?.driver_id ? await getDriverById(trip.driver_id) : null;
  if (settings.fare_check_enabled && trip) {
    await upsertSession(phone, { state: 'awaiting_fare_confirm' });
    return sendR(
      phone,
      tpl.fareCheck(lang, driver?.name ?? 'Driver', trip.quoted_amount_paise ?? 0),
      'awaiting_fare_confirm',
      tripId,
    );
  }
  await upsertSession(phone, { state: 'awaiting_rating' });
  return sendR(phone, tpl.rateList(lang, driver?.name ?? 'Driver'), 'awaiting_rating', tripId);
}

async function recordRating(
  tripId: string,
  byRole: 'rider' | 'driver',
  targetId: string,
  stars: number,
): Promise<void> {
  await supabaseAdmin.from('ratings').upsert(
    { id: uuid(), trip_id: tripId, by_role: byRole, target_id: targetId, stars },
    { onConflict: 'trip_id,by_role' },
  );
  const table = byRole === 'rider' ? 'drivers' : 'riders';
  const { data: target } = await supabaseAdmin
    .from(table)
    .select('rating_avg, rating_count')
    .eq('id', targetId)
    .single();
  const row = target as { rating_avg: number; rating_count: number } | null;
  const count = (row?.rating_count ?? 0) + 1;
  const avg = ((row?.rating_avg ?? 0) * (row?.rating_count ?? 0) + stars) / count;
  await supabaseAdmin.from(table).update({ rating_avg: avg, rating_count: count }).eq('id', targetId);
  recordEvent('rated', { actorRole: byRole, actorId: targetId, tripId, properties: { stars } });
}

function hoursList(): number[] {
  const out: number[] = [];
  for (let h = 6; h <= 22; h++) out.push(h);
  return out;
}




const RIDER_CANCEL_REASONS: Record<string, string> = {
  creason_got_another_auto: 'Got another auto',
  creason_changed_mind: 'Changed my mind',
  creason_long_wait: 'Waiting too long',
  creason_mistake: 'Booked by mistake',
};

/** Cancellation is only final once a reason is given - it is cheap to ask. */
async function finalizeRiderCancel(
  phone: string,
  riderId: string,
  tripId: string,
  reasonLabel: string,
  reasonId: string,
  lang: Lang,
): Promise<void> {
  await updateTrip(tripId, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancelled_by: 'rider',
    cancel_reason: reasonLabel,
  });
  recordEvent('cancelled', {
    actorRole: 'rider',
    actorId: riderId,
    tripId,
    properties: { reason_id: reasonId, reason: reasonLabel, stage: 'rider_cancelled' },
  });
  const trip = await getTrip(tripId);
  if (trip?.driver_id) {
    const driver = await getDriverById(trip.driver_id);
    if (driver) {
      await send(driver.phone, 'driver', tpl.text(t('rider_cancelled', lang)), { tripId });
    }
  }
  await resetSession(phone, { state: 'idle', role: 'rider' });
  await sendR(phone, tpl.tripCancelled(lang), 'idle');
}

async function createTrip(
  riderId: string,
  session: Session,
  pickupAt: Date | null,
): Promise<Trip> {
  const settings = await getSettings();
  const d = session.data;
  const pickupLat = (d.pickup_lat as number | null) ?? null;
  const pickupLng = (d.pickup_lng as number | null) ?? null;
  const dropLat = (d.drop_lat as number | null) ?? null;
  const dropLng = (d.drop_lng as number | null) ?? null;

  let distance: number | null = null;
  if (
    typeof pickupLat === 'number' &&
    typeof pickupLng === 'number' &&
    typeof dropLat === 'number' &&
    typeof dropLng === 'number'
  ) {
    distance = estimateRoadKm({ lat: pickupLat, lng: pickupLng }, { lat: dropLat, lng: dropLng });
  }

  const closesAt = pickupAt
    ? pickupAt.toISOString()
    : new Date(Date.now() + settings.quote_window_minutes * 60_000).toISOString();

  const row = {
    id: uuid(),
    rider_id: riderId,
    status: 'open',
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    pickup_text: (d.pickup_text as string | null) ?? null,
    drop_lat: dropLat,
    drop_lng: dropLng,
    drop_text: (d.drop_text as string | null) ?? null,
    distance_km: distance,
    pickup_at: pickupAt ? pickupAt.toISOString() : null,
    quote_window_closes_at: closesAt,
  };
  const { error } = await supabaseAdmin.from('trips').insert(row);
  if (error) console.error('[TRIP INSERT ERROR]', error.message);
  const trip = (await getTrip(row.id)) as Trip;
  return trip;
}

export async function handleRiderMessage(phone: string, input: RiderInput): Promise<void> {
  const rider = await ensureRider(phone);
  const session = await (async () => {
    const { getSession } = await import('../store');
    return (await getSession(phone)) as Session;
  })();
  const lang: Lang = langOf(rider.preferred_language);
  const text = (input.text ?? '').trim();
  const state = session?.state ?? 'idle';
  const data = session?.data ?? {};

  // ── Help, from anywhere ─────────────────────────────────────────────
  // Before every state branch on purpose: a rider stuck mid-trip with an auto
  // that never arrived is exactly who needs the office, and every active state
  // below has its own handler that would otherwise swallow this.
  if (isHelpRequest(text)) {
    const reply = await handleHelpRequest(
      phone,
      'rider',
      lang,
      (data.pending_trip_id as string | undefined) ?? null,
      rider.name,
    );
    return sendR(phone, reply, state, (data.pending_trip_id as string | undefined) ?? null);
  }

  // ── Signup ──────────────────────────────────────────────────────────
  if (state === 'awaiting_name') {
    if (!text) return sendR(phone, tpl.askName(lang), 'awaiting_name');
    await supabaseAdmin.from('riders').update({ name: text }).eq('id', rider.id);
    // No home-location step: the location picker opens on the rider's current
    // position, so asking for pickup each time costs them nothing extra.
    await resetSession(phone, { state: 'idle', role: 'rider' });
    return sendR(phone, tpl.riderReady(lang), 'idle');
  }

  // ── Booking: pickup and drop ────────────────────────────────────────
  if (state === 'awaiting_pickup_location') {
    // Pickup must be a real location: matching runs on coordinates, so a typed
    // name would leave the rider invisible to every driver in range.
    if (!input.location) {
      return sendR(phone, tpl.needLocation(lang), 'awaiting_pickup_location');
    }
    const address = await resolveAddress(input.location.lat, input.location.lng, input.location);
    await upsertSession(phone, {
      state: 'awaiting_drop_location',
      data: {
        pickup_lat: input.location.lat,
        pickup_lng: input.location.lng,
        ...(address ? { pickup_text: address } : {}),
      },
    });
    return sendR(phone, tpl.askDrop(lang), 'awaiting_drop_location');
  }

  if (state === 'awaiting_drop_location') {
    let patch: Record<string, unknown>;
    if (input.location) {
      const address = await resolveAddress(input.location.lat, input.location.lng, input.location);
      patch = {
        drop_lat: input.location.lat,
        drop_lng: input.location.lng,
        ...(address ? { drop_text: address } : {}),
      };
    } else {
      patch = { drop_text: text };
    }
    if (!input.location && !text) return sendR(phone, tpl.askDrop(lang), 'awaiting_drop_location');
    const next = { ...data, ...patch };
    await upsertSession(phone, { state: 'awaiting_trip_confirm', data: next });
    const distance = confirmDistance(next);
    return sendR(
      phone,
      tpl.tripConfirm(
        lang,
        placeLabel(
          (next.pickup_lat as number) ?? null,
          (next.pickup_lng as number) ?? null,
          (next.pickup_text as string) ?? null,
        ),
        placeLabel(
          (next.drop_lat as number) ?? null,
          (next.drop_lng as number) ?? null,
          (next.drop_text as string) ?? null,
        ),
        distance,
      ),
      'awaiting_trip_confirm',
    );
  }

  // ── Confirm card ────────────────────────────────────────────────────
  if (state === 'awaiting_trip_confirm') {
    if (text === 'book_now') return createAndOpen(phone, rider.id, session, null);
    if (text === 'schedule') {
      await upsertSession(phone, { state: 'awaiting_schedule_day' });
      return sendR(phone, tpl.scheduleDay(lang), 'awaiting_schedule_day');
    }
    if (text === 'change_pickup') {
      await upsertSession(phone, { state: 'awaiting_pickup_location' });
      return sendR(phone, tpl.askPickup(lang), 'awaiting_pickup_location');
    }
    if (text === 'change_drop') {
      await upsertSession(phone, { state: 'awaiting_drop_location' });
      return sendR(phone, tpl.askDrop(lang), 'awaiting_drop_location');
    }
    const distance = confirmDistance(data);
    return sendR(
      phone,
      tpl.tripConfirm(
        lang,
        placeLabel(
          (data.pickup_lat as number) ?? null,
          (data.pickup_lng as number) ?? null,
          (data.pickup_text as string) ?? null,
        ),
        placeLabel(
          (data.drop_lat as number) ?? null,
          (data.drop_lng as number) ?? null,
          (data.drop_text as string) ?? null,
        ),
        distance,
      ),
      'awaiting_trip_confirm',
    );
  }

  if (state === 'awaiting_schedule_day') {
    if (text !== 'day_today' && text !== 'day_tomorrow') {
      return sendR(phone, tpl.scheduleDay(lang), 'awaiting_schedule_day');
    }
    await upsertSession(phone, { state: 'awaiting_schedule_hour', data: { schedule_day: text } });
    return sendR(phone, tpl.scheduleHour(lang, hoursList()), 'awaiting_schedule_hour');
  }

  if (state === 'awaiting_schedule_hour') {
    const m = /^hour_(\d{1,2})$/.exec(text);
    if (!m) return sendR(phone, tpl.scheduleHour(lang, hoursList()), 'awaiting_schedule_hour');
    const hour = Number(m[1]);
    const when = new Date();
    when.setMinutes(0, 0, 0);
    when.setHours(hour);
    if (data.schedule_day === 'day_tomorrow') when.setDate(when.getDate() + 1);
    if (when.getTime() < Date.now()) when.setDate(when.getDate() + 1);
    await upsertSession(phone, { data: { schedule_hour: hour, pickup_at: when.toISOString() } });
    return createAndOpen(phone, rider.id, session, when);
  }

  // ── Active trip states ──────────────────────────────────────────────
  if (state === 'collecting_quotes') {
    if (text.startsWith('accept_quote_')) {
      const quoteId = text.slice('accept_quote_'.length);
      const { acceptQuote } = await import('../../lib/matching');
      const res = await acceptQuote(quoteId);
      if (res.ok) {
        // pending_trip_id must survive the reset - status and cancel both
        // read it, and losing it silently breaks cancel after assignment.
        await resetSession(phone, {
          state: 'trip_assigned',
          role: 'rider',
          current_trip_id: res.tripId ?? null,
          data: { pending_trip_id: res.tripId ?? null },
        });
        return;
      }
      return sendR(phone, tpl.text(t('trip_taken', lang)), 'collecting_quotes');
    }
    if (text === 'cancel' || text.startsWith('cancel_trip_')) {
      await upsertSession(phone, { state: 'awaiting_cancel_confirm' });
      return sendR(phone, tpl.cancelConfirm(lang), 'awaiting_cancel_confirm');
    }
    const tripId = data.pending_trip_id as string | undefined;
    if (tripId) {
      const trip = await getTrip(tripId);
      if (trip) {
        const sent = await sendRiderQuoteList(trip);
        if (sent) return;
        return sendR(phone, tpl.findingAuto(lang, tripId), 'collecting_quotes', tripId);
      }
    }
    return sendR(phone, tpl.riderHelp(lang), 'idle');
  }

  if (state === 'trip_assigned' || state === 'ride_in_progress') {
    if (text === 'cancel' || text.startsWith('cancel_trip_')) {
      if (state === 'ride_in_progress') {
        return sendR(phone, tpl.text(t('cannot_cancel', lang)), state, data.pending_trip_id as string);
      }
      await upsertSession(phone, { state: 'awaiting_cancel_confirm' });
      return sendR(phone, tpl.cancelConfirm(lang), 'awaiting_cancel_confirm');
    }
    const tripId = data.pending_trip_id as string | undefined;
    const trip = tripId ? await getTrip(tripId) : null;
    if (trip) {
      const driver = trip.driver_id ? await getDriverById(trip.driver_id) : null;
      return sendR(
        phone,
        tpl.text(
          t('trip_status', lang, {
            status: trip.status,
            name: driver?.name ?? '-',
            vehicle: driver?.vehicle_no ?? '-',
            phone: driver?.phone ?? '-',
          }),
        ),
        state,
        trip.id,
      );
    }
    return sendR(phone, tpl.riderHelp(lang), 'idle');
  }

  if (state === 'awaiting_completion_confirm') {
    const tripId = data.pending_trip_id as string;
    const trip = await getTrip(tripId);
    // A typed destination leaves no coordinates - offer to fill them in.
    const dropMissing = trip ? trip.drop_lat == null || trip.drop_lng == null : false;
    if (text === 'confirm_yes') {
      await updateTrip(tripId, { status: 'completed', completed_at: new Date().toISOString() });
      recordEvent('completed', { actorRole: 'rider', actorId: rider.id, tripId });
      if (trip && trip.driver_id) {
        // Ask the driver to rate the rider.
        const driver = await getDriverById(trip.driver_id);
        if (driver) {
          await send(driver.phone, 'driver', tpl.rateRider(lang, rider.name ?? 'Rider'), {
            sessionState: 'awaiting_rider_rating',
            tripId,
          });
          await upsertSession(driver.phone, {
            state: 'awaiting_rider_rating',
            role: 'driver',
            data: { pending_rate_trip_id: tripId },
          });
        }
      }
      if (dropMissing) {
        await upsertSession(phone, {
          state: 'awaiting_drop_proof',
          data: { pending_trip_id: tripId, proof_next: 'completed' },
        });
        return sendR(phone, tpl.dropProof(lang, 'completed'), 'awaiting_drop_proof', tripId);
      }
      return afterCompletion(phone, tripId, lang);
    }
    if (text === 'confirm_no') {
      await updateTrip(tripId, { status: 'disputed' });
      recordEvent('disputed', { actorRole: 'rider', actorId: rider.id, tripId });
      // A dispute is a person needing a human - put it in front of the office.
      await openHelpRequest({ phone, role: 'rider', source: 'dispute', tripId, name: rider.name });
      const help = (await getSettings()).helpline ?? '-';
      if (dropMissing) {
        // Still worth capturing: where the rider is now is evidence for the office.
        await upsertSession(phone, {
          state: 'awaiting_drop_proof',
          data: { pending_trip_id: tripId, proof_next: 'disputed' },
        });
        await sendR(phone, tpl.disputed(lang, help), 'awaiting_drop_proof', tripId);
        return sendR(phone, tpl.dropProof(lang, 'disputed'), 'awaiting_drop_proof', tripId);
      }
      await resetSession(phone, { state: 'idle', role: 'rider' });
      return sendR(phone, tpl.disputed(lang, help), 'idle');
    }
    return sendR(phone, tpl.completionConfirm(lang, 'Driver'), 'awaiting_completion_confirm', tripId);
  }

  if (state === 'awaiting_drop_proof') {
    const tripId = data.pending_trip_id as string;
    const proofNext = data.proof_next === 'disputed' ? 'disputed' : 'completed';
    if (text === 'drop_proof_share') {
      return sendR(phone, tpl.dropProofShare(lang), 'awaiting_drop_proof', tripId);
    }
    if (input.location) {
      const trip = await getTrip(tripId);
      const address = await resolveAddress(input.location.lat, input.location.lng, input.location);
      const patch: Record<string, unknown> = {};
      if (proofNext === 'disputed') {
        // Evidence, not the destination: a disputed trip's drop pin must stand,
        // and `drop_text` keeps whatever the rider originally typed.
        patch.dispute_lat = input.location.lat;
        patch.dispute_lng = input.location.lng;
        if (address) patch.dispute_text = address;
      } else {
        // The pin the typed destination never had. `drop_text` is left alone so
        // the rider's own words survive alongside the coordinates.
        patch.drop_lat = input.location.lat;
        patch.drop_lng = input.location.lng;
        if (trip && typeof trip.pickup_lat === 'number' && typeof trip.pickup_lng === 'number') {
          patch.distance_km = estimateRoadKm(
            { lat: trip.pickup_lat, lng: trip.pickup_lng },
            { lat: input.location.lat, lng: input.location.lng },
          );
        }
      }
      await updateTrip(tripId, patch);
      recordEvent('drop_location_captured', {
        actorRole: 'rider',
        actorId: rider.id,
        tripId,
        properties: { after: proofNext, ...(address ? { address } : {}) },
      });
    }
    // Anything else - including Skip - just continues. This optional ask must
    // never hold up the rating or the end of the trip.
    if (proofNext === 'disputed') {
      await resetSession(phone, { state: 'idle', role: 'rider' });
      return;
    }
    return afterCompletion(phone, tripId, lang);
  }

  if (state === 'awaiting_fare_confirm') {
    const tripId = data.pending_trip_id as string;
    if (['fare_yes', 'fare_more', 'fare_less'].includes(text)) {
      const trip = await getTrip(tripId);
      const quoted = trip?.quoted_amount_paise ?? 0;
      const reported =
        text === 'fare_more' ? Math.round(quoted * 1.2) : text === 'fare_less' ? Math.round(quoted * 0.8) : quoted;
      await updateTrip(tripId, { reported_fare_paise: reported, fare_check_sent: true });
      recordEvent('fare_reported', {
        actorRole: 'rider',
        actorId: rider.id,
        tripId,
        properties: { quoted_paise: quoted, reported_paise: reported, answer: text },
      });
      await upsertSession(phone, { state: 'awaiting_rating' });
      const driver = trip?.driver_id ? await getDriverById(trip.driver_id) : null;
      return sendR(phone, tpl.rateList(lang, driver?.name ?? 'Driver'), 'awaiting_rating', tripId);
    }
    const trip = await getTrip(tripId);
    const driver = trip?.driver_id ? await getDriverById(trip.driver_id) : null;
    return sendR(
      phone,
      tpl.fareCheck(lang, driver?.name ?? 'Driver', trip?.quoted_amount_paise ?? 0),
      'awaiting_fare_confirm',
      tripId,
    );
  }

  if (state === 'awaiting_rating') {
    const m = /^rate_([1-5])$/.exec(text);
    const tripId = data.pending_trip_id as string;
    if (!m) {
      const trip = await getTrip(tripId);
      const driver = trip?.driver_id ? await getDriverById(trip.driver_id) : null;
      return sendR(phone, tpl.rateList(lang, driver?.name ?? 'Driver'), 'awaiting_rating', tripId);
    }
    const trip = await getTrip(tripId);
    if (trip?.driver_id) await recordRating(tripId, 'rider', trip.driver_id, Number(m[1]));
    await resetSession(phone, { state: 'idle', role: 'rider' });
    await sendR(phone, tpl.thanksForRating(lang), 'idle');
    return sendR(phone, tpl.riderPostComplete(lang), 'idle');
  }

  if (state === 'awaiting_cancel_confirm') {
    const tripId = data.pending_trip_id as string;
    if (text === 'cancel_yes') {
      await upsertSession(phone, { state: 'awaiting_cancel_reason' });
      return sendR(phone, tpl.cancelReasonList(lang, 'rider'), 'awaiting_cancel_reason', tripId);
    }
    if (text === 'cancel_no') {
      await upsertSession(phone, { state: 'collecting_quotes' });
      return sendR(phone, tpl.text(t('finding_auto', lang)), 'collecting_quotes', tripId);
    }
    return sendR(phone, tpl.cancelConfirm(lang), 'awaiting_cancel_confirm', tripId);
  }

  if (state === 'awaiting_cancel_reason') {
    const tripId = data.pending_trip_id as string;
    if (text === 'creason_other') {
      await upsertSession(phone, { state: 'awaiting_cancel_reason_text' });
      return sendR(phone, tpl.cancelReasonTyped(lang), 'awaiting_cancel_reason_text', tripId);
    }
    const label = RIDER_CANCEL_REASONS[text];
    if (!label) {
      return sendR(phone, tpl.cancelReasonList(lang, 'rider'), 'awaiting_cancel_reason', tripId);
    }
    return finalizeRiderCancel(phone, rider.id, tripId, label, text, lang);
  }

  if (state === 'awaiting_cancel_reason_text') {
    const tripId = data.pending_trip_id as string;
    if (!text) {
      return sendR(phone, tpl.cancelReasonTyped(lang), 'awaiting_cancel_reason_text', tripId);
    }
    return finalizeRiderCancel(phone, rider.id, tripId, text.slice(0, 200), 'creason_other_text', lang);
  }

  if (state === 'awaiting_retry_choice') {
    const tripId = text.startsWith('retry_')
      ? text.slice('retry_'.length)
      : text.startsWith('change_trip_')
        ? text.slice('change_trip_'.length)
        : null;
    if (tripId && text.startsWith('change_trip_')) {
      await upsertSession(phone, { state: 'awaiting_pickup_location', data: {} });
      return sendR(phone, tpl.askPickup(lang), 'awaiting_pickup_location');
    }
    if (tripId && text.startsWith('retry_')) {
      const trip = await getTrip(tripId);
      if (trip) {
        const window = new Date(Date.now() + (await getSettings()).quote_window_minutes * 60_000);
        await updateTrip(tripId, {
          status: 'open',
          leads_dispatched: false,
          quote_window_closes_at: window.toISOString(),
        });
        await upsertSession(phone, {
          state: 'collecting_quotes',
          role: 'rider',
          current_trip_id: tripId,
          data: { pending_trip_id: tripId },
        });
        const reopened: Trip = { ...trip, status: 'open', leads_dispatched: false };
        const notified = await dispatchLeads(reopened);
        if (notified === 0) {
          await noCoverExpire(reopened);
          return;
        }
        await sendR(phone, tpl.findingAuto(lang, tripId, notified), 'collecting_quotes', tripId);
        return;
      }
    }
    return sendR(phone, tpl.riderHelp(lang), 'idle');
  }

  if (state === 'awaiting_language') {
    if (text === 'lang_kannada' || text === 'lang_english') {
      await supabaseAdmin
        .from('riders')
        .update({ preferred_language: text === 'lang_kannada' ? 'kannada' : 'english' })
        .eq('id', rider.id);
      await resetSession(phone, { state: 'idle', role: 'rider' });
      return sendR(phone, tpl.text(t('language_set', lang)), 'idle');
    }
    return sendR(phone, tpl.languageMenu(lang), 'awaiting_language');
  }

  // ── Idle: priority order ────────────────────────────────────────────
  const activeTrip = await getActiveTripForRider(rider.id);
  if (activeTrip) {
    // Never start a second booking while a trip is live.
    return showActiveTrip(phone, rider.id, activeTrip, lang, session);
  }

  if (text.startsWith('accept_quote_')) {
    const { acceptQuote } = await import('../../lib/matching');
    const res = await acceptQuote(text.slice('accept_quote_'.length));
    if (res.ok) {
      await resetSession(phone, {
        state: 'trip_assigned',
        role: 'rider',
        current_trip_id: res.tripId ?? null,
        data: { pending_trip_id: res.tripId ?? null },
      });
      return;
    }
    return sendR(phone, tpl.text(t('trip_taken', lang)), 'idle');
  }

  const lower = text.toLowerCase();
  if (input.location) {
    const address = await resolveAddress(input.location.lat, input.location.lng, input.location);
    await upsertSession(phone, {
      state: 'awaiting_drop_location',
      role: 'rider',
      data: {
        pickup_lat: input.location.lat,
        pickup_lng: input.location.lng,
        ...(address ? { pickup_text: address } : {}),
      },
    });
    return sendR(phone, tpl.askDrop(lang), 'awaiting_drop_location');
  }

  if (
    text === 'book_auto' ||
    lower === 'auto' ||
    lower === 'book' ||
    lower === 'hi' ||
    lower === 'hello' ||
    text === 'ಆಟೋ' ||
    text === 'ಬುಕ್'
  ) {
    await upsertSession(phone, { state: 'awaiting_pickup_location', role: 'rider', data: {} });
    return sendR(phone, tpl.askPickup(lang), 'awaiting_pickup_location');
  }

  if (lower === 'status' || lower === 'my trip' || text === 'ಸ್ಥಿತಿ') {
    return sendR(phone, tpl.text(t('no_active_trip', lang)), 'idle');
  }

  if (lower === 'language' || lower === 'kannada' || lower === 'english' || text === 'ಭಾಷೆ') {
    if (lower === 'kannada' || lower === 'english') {
      await supabaseAdmin.from('riders').update({ preferred_language: lower }).eq('id', rider.id);
      return sendR(phone, tpl.text(t('language_set', lang)), 'idle');
    }
    await upsertSession(phone, { state: 'awaiting_language', role: 'rider' });
    return sendR(phone, tpl.languageMenu(lang), 'awaiting_language');
  }

  return sendR(phone, tpl.riderHelp(lang), 'idle');
}

// ── helpers ─────────────────────────────────────────────────────────────

function confirmDistance(d: Record<string, unknown>): number | null {
  const a = d.pickup_lat as number | undefined;
  const b = d.pickup_lng as number | undefined;
  const c = d.drop_lat as number | undefined;
  const e = d.drop_lng as number | undefined;
  if ([a, b, c, e].every((v) => typeof v === 'number')) {
    return estimateRoadKm({ lat: a as number, lng: b as number }, { lat: c as number, lng: e as number });
  }
  return null;
}

async function createAndOpen(
  phone: string,
  riderId: string,
  session: Session,
  pickupAt: Date | null,
): Promise<void> {
  const rider = await ensureRider(phone);
  const lang: Lang = langOf(rider.preferred_language);
  const trip = await createTrip(riderId, session, pickupAt);
  await upsertSession(phone, {
    state: 'collecting_quotes',
    role: 'rider',
    current_trip_id: trip.id,
    data: { pending_trip_id: trip.id },
  });
  recordEvent('trip_created', {
    actorRole: 'rider',
    actorId: riderId,
    tripId: trip.id,
    properties: { pickup_at: trip.pickup_at, distance_km: trip.distance_km },
  });
  if (!pickupAt) {
    const notified = await dispatchLeads(trip);
    if (notified === 0) {
      await noCoverExpire(trip);
      return;
    }
    await sendR(phone, tpl.findingAuto(lang, trip.id, notified), 'collecting_quotes', trip.id);
    return;
  }
  await sendR(phone, tpl.findingAuto(lang, trip.id), 'collecting_quotes', trip.id);
}

async function showActiveTrip(
  phone: string,
  riderId: string,
  trip: Trip,
  lang: Lang,
  session: Session | null,
): Promise<void> {
  const driver = trip.driver_id ? await getDriverById(trip.driver_id) : null;
  const stateFor =
    trip.status === 'open'
      ? 'collecting_quotes'
      : trip.status === 'in_progress'
        ? 'ride_in_progress'
        : 'trip_assigned';
  await upsertSession(phone, {
    state: stateFor,
    role: 'rider',
    current_trip_id: trip.id,
    data: { pending_trip_id: trip.id },
  });
  const body = ACTIVE.includes(trip.status)
    ? tpl.text(
        t('trip_status', lang, {
          status: trip.status,
          name: driver?.name ?? '-',
          vehicle: driver?.vehicle_no ?? '-',
          phone: driver?.phone ?? '-',
        }),
      )
    : tpl.riderHelp(lang);
  await sendR(phone, body, stateFor, trip.id);
  void session;
}
