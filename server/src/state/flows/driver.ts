import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '../../supabase/client';
import { recordEvent } from '../../lib/events';
import { send } from '../../lib/send';
import { parseAmount } from '../../lib/money';
import { resolveAddress } from '../../lib/geocode';
import {
  dispatchLeads,
  noCoverExpire,
  quoteWindowClosed,
  sendRiderQuoteList,
} from '../../lib/matching';
import { handleHelpRequest, isHelpRequest } from '../../lib/help-command';
import { langOf, t, type Lang } from '../../whatsapp/i18n';
import type { OutMessage } from '../../whatsapp/spec';
import * as tpl from '../../whatsapp/templates';
import {
  ensureDriver,
  getActiveTripForDriver,
  getRiderById,
  getSettings,
  getTrip,
  updateTrip,
  type Trip,
} from '../queries';
import { resetSession, upsertSession, type Session } from '../store';

export interface DriverInput {
  text?: string;
  location?: { lat: number; lng: number; name?: string; address?: string };
  imageUrl?: string;
}

const OTP_RE = /^(?:CODE\s+)?(\d{4})$/i;

async function sendD(
  phone: string,
  msg: Parameters<typeof send>[2],
  state: string,
  tripId?: string | null,
): Promise<void> {
  await send(phone, 'driver', msg, { sessionState: state, tripId: tripId ?? null });
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

export async function handleDriverMessage(phone: string, input: DriverInput): Promise<void> {
  const driver = await ensureDriver(phone);
  const { getSession } = await import('../store');
  const session = (await getSession(phone)) as Session | null;
  const lang: Lang = langOf(driver.preferred_language);
  const text = (input.text ?? '').trim();
  const state = session?.state ?? 'idle';
  const data = session?.data ?? {};

  await supabaseAdmin.from('drivers').update({ last_reply_at: new Date().toISOString() }).eq('id', driver.id);

  // ── Help, from anywhere ─────────────────────────────────────────────
  // Above the signup, gate and active-trip branches. A driver stuck in an OTP
  // loop, or blocked pending approval, is exactly who needs the office - those
  // branches would otherwise swallow this.
  if (isHelpRequest(text)) {
    const reply = await handleHelpRequest(
      phone,
      'driver',
      lang,
      (data.pending_trip_id as string | undefined) ?? null,
      driver.name,
    );
    return sendD(phone, reply, state, (data.pending_trip_id as string | undefined) ?? null);
  }

  // ── Signup ──────────────────────────────────────────────────────────
  if (state === 'awaiting_driver_name') {
    if (!text) return sendD(phone, tpl.askDriverName(lang), state);
    await supabaseAdmin.from('drivers').update({ name: text }).eq('id', driver.id);
    await upsertSession(phone, { state: 'awaiting_vehicle_number', data: { name: text } });
    return sendD(phone, tpl.askVehicle(lang), 'awaiting_vehicle_number');
  }

  if (state === 'awaiting_vehicle_number') {
    if (!text) return sendD(phone, tpl.askVehicle(lang), state);
    await supabaseAdmin.from('drivers').update({ vehicle_no: text.toUpperCase() }).eq('id', driver.id);
    await upsertSession(phone, { state: 'awaiting_base_location', data: { vehicle_no: text } });
    return sendD(phone, tpl.askBaseLocation(lang), 'awaiting_base_location');
  }

  if (state === 'awaiting_base_location') {
    // A base must be a real location: matching runs on coordinates, so a typed
    // area name would leave the driver silently out of every lead.
    if (!input.location) {
      return sendD(phone, tpl.needBaseLocation(lang), state);
    }
    const address = await resolveAddress(input.location.lat, input.location.lng, input.location);
    await supabaseAdmin
      .from('drivers')
      .update({
        base_lat: input.location.lat,
        base_lng: input.location.lng,
        base_text: address,
      })
      .eq('id', driver.id);
    const settings = await getSettings();
    await upsertSession(phone, { state: 'awaiting_radius' });
    return sendD(phone, tpl.askRadius(lang, settings.radius_options), 'awaiting_radius');
  }

  if (state === 'awaiting_radius') {
    const m = /^radius_(\d+)$/.exec(text);
    if (!m) {
      const settings = await getSettings();
      return sendD(phone, tpl.askRadius(lang, settings.radius_options), state);
    }
    await supabaseAdmin.from('drivers').update({ radius_km: Number(m[1]) }).eq('id', driver.id);
    await upsertSession(phone, { state: 'awaiting_kyc_aadhaar_front' });
    return sendD(phone, tpl.kycPrompt(lang, 'front'), 'awaiting_kyc_aadhaar_front');
  }

  const kycOrder = ['awaiting_kyc_aadhaar_front', 'awaiting_kyc_aadhaar_back', 'awaiting_kyc_selfie'];
  if (kycOrder.includes(state)) {
    const step = state === 'awaiting_kyc_aadhaar_front' ? 'front' : state === 'awaiting_kyc_aadhaar_back' ? 'back' : 'selfie';
    if (input.imageUrl) {
      if (step === 'front') await upsertSession(phone, { data: { kyc_aadhaar_front_url: input.imageUrl } });
      if (step === 'back') await upsertSession(phone, { data: { kyc_aadhaar_back_url: input.imageUrl } });
      await sendD(phone, tpl.kycReceived(lang), state);
    } else if (text !== 'skip_kyc') {
      return sendD(phone, tpl.needImage(lang), state);
    }

    if (step === 'front') {
      await upsertSession(phone, { state: 'awaiting_kyc_aadhaar_back' });
      return sendD(phone, tpl.kycPrompt(lang, 'back'), 'awaiting_kyc_aadhaar_back');
    }
    if (step === 'back') {
      await upsertSession(phone, { state: 'awaiting_kyc_selfie' });
      return sendD(phone, tpl.kycPrompt(lang, 'selfie'), 'awaiting_kyc_selfie');
    }
    // selfie step finished - persist everything collected
    const fresh = await (async () => {
      const { getSession: gs } = await import('../store');
      return (await gs(phone)) as Session;
    })();
    const d = fresh?.data ?? {};
    await supabaseAdmin
      .from('drivers')
      .update({
        kyc_aadhaar_url: (d.kyc_aadhaar_front_url as string) ?? null,
        kyc_aadhaar_back_url: (d.kyc_aadhaar_back_url as string) ?? null,
        kyc_selfie_url: input.imageUrl ?? null,
        approval_status: 'pending',
      })
      .eq('id', driver.id);
    await resetSession(phone, { state: 'idle', role: 'driver' });
    await sendD(phone, tpl.kycSubmitted(lang), 'idle');
    return sendD(phone, tpl.pendingApproval(lang), 'idle');
  }

  // ── Gate: approval and subscription ─────────────────────────────────
  const lapsed = driver.subscription_until ? new Date(driver.subscription_until) < new Date() : false;
  const gated = driver.approval_status !== 'approved' || lapsed;

  if (gated && !['awaiting_language', 'awaiting_base_confirm'].includes(state)) {
    if (driver.approval_status !== 'approved') {
      return sendD(phone, tpl.pendingApproval(lang), 'idle');
    }
    const settings = await getSettings();
    return sendD(
      phone,
      tpl.subscriptionLapsed(lang, settings.subscription_price_paise, settings.renewal_contact ?? '-'),
      'idle',
    );
  }

  // ── Active trip states ──────────────────────────────────────────────
  if (state === 'awaiting_quote_amount') {
    const amount = parseAmount(text);
    if (amount === null) return sendD(phone, tpl.quoteInvalid(lang), state);
    const tripId = data.pending_trip_id as string;
    const trip = await getTrip(tripId);
    if (!trip || trip.status !== 'open' || quoteWindowClosed(trip)) {
      await resetSession(phone, { state: 'idle', role: 'driver' });
      return sendD(phone, tripUnavailable(trip, lang), 'idle');
    }
    return submitQuote(phone, driver.id, trip, amount, lang);
  }

  if (state === 'awaiting_ride_otp') {
    const trip = await getActiveTripForDriver(driver.id);
    if (!trip) return sendD(phone, tpl.driverHelp(lang), 'idle');
    const m = OTP_RE.exec(text);
    if (!m) return sendD(phone, tpl.askOtp(lang), state, trip.id);
    const { data: otp } = await supabaseAdmin
      .from('trip_otps')
      .select('code')
      .eq('trip_id', trip.id)
      .maybeSingle();
    const attempts = ((data.otp_attempts as number) ?? 0) + 1;
    if ((otp as { code: string } | null)?.code !== m[1]) {
      if (attempts >= 10) {
        await resetSession(phone, { state: 'idle', role: 'driver' });
        return sendD(phone, tpl.otpBlocked(lang, (await getSettings()).helpline ?? '-'), 'idle');
      }
      await upsertSession(phone, { data: { otp_attempts: attempts } });
      return sendD(phone, tpl.otpWrong(lang), state, trip.id);
    }
    await updateTrip(trip.id, { status: 'in_progress', started_at: new Date().toISOString() });
    recordEvent('otp_verified', { actorRole: 'driver', actorId: driver.id, tripId: trip.id });
    await upsertSession(phone, { state: 'ride_in_progress', data: { otp_attempts: 0 } });
    // Onward to the drop once the rider is aboard.
    await sendNavigation(phone, lang, 'drop', trip);
    const rider = await getRiderById(trip.rider_id);
    if (rider) {
      await send(rider.phone, 'rider', tpl.tripStarted(langOf(rider.preferred_language)), {
        tripId: trip.id,
      });
      await upsertSession(rider.phone, { state: 'ride_in_progress' });
    }
    return sendD(phone, tpl.otpOk(lang), 'ride_in_progress', trip.id);
  }

  if (state === 'ride_in_progress') {
    const trip = await getActiveTripForDriver(driver.id);
    if (!trip) return sendD(phone, tpl.driverHelp(lang), 'idle');
    if (text.toUpperCase() === 'DONE' || text === 'ಆಯಿತು' || text === 'trip_done') {
      await updateTrip(trip.id, { done_at: new Date().toISOString() });
      recordEvent('done_marked', { actorRole: 'driver', actorId: driver.id, tripId: trip.id });
      await sendD(phone, tpl.doneRecorded(lang), 'ride_in_progress', trip.id);
      const rider = await getRiderById(trip.rider_id);
      if (rider) {
        const rLang = langOf(rider.preferred_language);
        await send(rider.phone, 'rider', tpl.completionConfirm(rLang, driver.name ?? 'Driver'), {
          sessionState: 'awaiting_completion_confirm',
          tripId: trip.id,
        });
        await upsertSession(rider.phone, {
          state: 'awaiting_completion_confirm',
          role: 'rider',
          current_trip_id: trip.id,
          data: { pending_trip_id: trip.id },
        });
      }
      return;
    }
    return sendD(phone, tpl.askDone(lang), state, trip.id);
  }

  if (state === 'awaiting_rider_rating') {
    const m = /^rate_([1-5])$/.exec(text);
    const tripId = data.pending_rate_trip_id as string;
    if (!m) {
      const trip = await getTrip(tripId);
      const rider = trip ? await getRiderById(trip.rider_id) : null;
      return sendD(phone, tpl.rateRider(lang, rider?.name ?? 'Rider'), state, tripId);
    }
    const trip = await getTrip(tripId);
    if (trip) await recordRating(tripId, 'driver', trip.rider_id, Number(m[1]));
    await resetSession(phone, { state: 'idle', role: 'driver' });
    await sendD(phone, tpl.thanksForRating(lang), 'idle');
    return sendD(phone, tpl.postComplete(lang), 'idle');
  }

  if (state === 'awaiting_cancel_confirm') {
    const trip = await getActiveTripForDriver(driver.id);
    if (text === 'cancel_yes' && trip) {
      await upsertSession(phone, { state: 'awaiting_cancel_reason' });
      return sendD(phone, tpl.cancelReasonList(lang, 'driver'), 'awaiting_cancel_reason', trip.id);
    }
    if (text === 'cancel_no' && trip) {
      await upsertSession(phone, { state: 'trip_assigned' });
      return sendD(phone, tpl.askOtp(lang), 'trip_assigned', trip.id);
    }
    return sendD(phone, tpl.cancelConfirm(lang), state, trip?.id ?? null);
  }

  if (state === 'awaiting_cancel_reason') {
    const trip = await getActiveTripForDriver(driver.id);
    if (!trip) {
      await resetSession(phone, { state: 'idle', role: 'driver' });
      return sendD(phone, tpl.driverHelp(lang), 'idle');
    }
    if (text === 'creason_other') {
      await upsertSession(phone, { state: 'awaiting_cancel_reason_text' });
      return sendD(phone, tpl.cancelReasonTyped(lang), 'awaiting_cancel_reason_text', trip.id);
    }
    const label = DRIVER_CANCEL_REASONS[text];
    if (!label) {
      return sendD(phone, tpl.cancelReasonList(lang, 'driver'), 'awaiting_cancel_reason', trip.id);
    }
    return finalizeDriverCancel(phone, driver.id, trip.id, label, text, lang);
  }

  if (state === 'awaiting_cancel_reason_text') {
    const trip = await getActiveTripForDriver(driver.id);
    if (!trip) {
      await resetSession(phone, { state: 'idle', role: 'driver' });
      return sendD(phone, tpl.driverHelp(lang), 'idle');
    }
    if (!text) {
      return sendD(phone, tpl.cancelReasonTyped(lang), 'awaiting_cancel_reason_text', trip.id);
    }
    return finalizeDriverCancel(phone, driver.id, trip.id, text.slice(0, 200), 'creason_other_text', lang);
  }

  if (state === 'awaiting_base_confirm') {
    if (text === 'base_yes') {
      await supabaseAdmin
        .from('drivers')
        .update({
          base_lat: data.pending_base_lat as number,
          base_lng: data.pending_base_lng as number,
          base_text: (data.pending_base_text as string) ?? null,
        })
        .eq('id', driver.id);
      await resetSession(phone, { state: 'idle', role: 'driver' });
      return sendD(phone, tpl.baseUpdated(lang), 'idle');
    }
    if (text === 'base_no') {
      await resetSession(phone, { state: 'idle', role: 'driver' });
      return sendD(phone, tpl.driverHelp(lang), 'idle');
    }
    return sendD(phone, tpl.updateBase(lang), state);
  }

  if (state === 'awaiting_language') {
    // Must persist the choice, not just acknowledge it - drivers have a
    // preferred_language column and every lead is rendered in it.
    if (text === 'lang_kannada' || text === 'lang_english') {
      const chosen = text === 'lang_kannada' ? 'kannada' : 'english';
      await supabaseAdmin.from('drivers').update({ preferred_language: chosen }).eq('id', driver.id);
      await resetSession(phone, { state: 'idle', role: 'driver' });
      return sendD(phone, tpl.text(t('language_set', chosen as Lang)), 'idle');
    }
    return sendD(phone, tpl.languageMenu(lang), 'awaiting_language');
  }

  // ── Idle / trip_assigned: priority order ────────────────────────────
  const activeTrip = await getActiveTripForDriver(driver.id);
  if (activeTrip) {
    // "I am on the way" - tells the rider someone is actually moving.
    if (text === 'start_trip' || text === 'started') {
      if (activeTrip.status === 'assigned') {
        await recordEvent('pickup_started', {
          actorRole: 'driver',
          actorId: driver.id,
          tripId: activeTrip.id,
        });
        const rider = await getRiderById(activeTrip.rider_id);
        if (rider) {
          await send(
            rider.phone,
            'rider',
            tpl.riderEnRoute(langOf(rider.preferred_language), driver.name ?? 'Driver', driver.vehicle_no ?? '-'),
            { tripId: activeTrip.id },
          );
        }
        await upsertSession(phone, { state: 'en_route' });
        return sendD(phone, tpl.askArrived(lang, activeTrip.id), 'en_route', activeTrip.id);
      }
      return sendD(phone, tpl.askOtp(lang), state, activeTrip.id);
    }

    if (text.startsWith('arrived_') || text === 'arrived') {
      if (activeTrip.status === 'assigned') {
        // Forgiving: a driver who skips "on the way" still gets there.
        await recordEvent('pickup_started', {
          actorRole: 'driver',
          actorId: driver.id,
          tripId: activeTrip.id,
          properties: { skipped_start: true },
        });
        await updateTrip(activeTrip.id, { status: 'arrived', arrived_at: new Date().toISOString() });
        recordEvent('driver_arrived', { actorRole: 'driver', actorId: driver.id, tripId: activeTrip.id });
        const rider = await getRiderById(activeTrip.rider_id);
        if (rider) {
          await send(
            rider.phone,
            'rider',
            tpl.driverArrived(langOf(rider.preferred_language), driver.name ?? 'Driver'),
            { tripId: activeTrip.id },
          );
        }
        await upsertSession(phone, { state: 'awaiting_ride_otp' });
        return sendD(phone, tpl.askOtp(lang), 'awaiting_ride_otp', activeTrip.id);
      }
      return sendD(phone, tpl.askOtp(lang), 'trip_assigned', activeTrip.id);
    }
    if (text === 'cancel' || text.startsWith('cancel_trip_')) {
      await upsertSession(phone, { state: 'awaiting_cancel_confirm' });
      return sendD(phone, tpl.cancelConfirm(lang), 'awaiting_cancel_confirm', activeTrip.id);
    }
    if (activeTrip.status === 'assigned') {
      const heading = (await getSession(phone))?.state === 'en_route';
      return heading
        ? sendD(phone, tpl.askArrived(lang, activeTrip.id), 'en_route', activeTrip.id)
        : sendD(phone, tpl.askStart(lang, activeTrip.id), 'trip_assigned', activeTrip.id);
    }
    if (activeTrip.status === 'arrived') {
      return sendD(phone, tpl.askOtp(lang), 'awaiting_ride_otp', activeTrip.id);
    }
    return sendD(phone, tpl.askDone(lang), 'ride_in_progress', activeTrip.id);
  }

  if (text.startsWith('quote_')) {
    const tripId = text.slice('quote_'.length);
    const trip = await getTrip(tripId);
    if (!trip || trip.status !== 'open' || quoteWindowClosed(trip)) {
      return sendD(phone, tripUnavailable(trip, lang), 'idle');
    }
    await upsertSession(phone, { state: 'awaiting_quote_amount', data: { pending_trip_id: tripId } });
    return sendD(phone, tpl.quotePrompt(lang), 'awaiting_quote_amount', tripId);
  }

  if (text.startsWith('pick_trip_')) {
    const tripId = text.slice('pick_trip_'.length);
    const trip = await getTrip(tripId);
    if (!trip || trip.status !== 'open' || quoteWindowClosed(trip)) {
      return sendD(phone, tripUnavailable(trip, lang), 'idle');
    }
    await upsertSession(phone, { state: 'awaiting_quote_amount', data: { pending_trip_id: tripId } });
    return sendD(phone, tpl.quotePrompt(lang), 'awaiting_quote_amount', tripId);
  }

  if (input.location) {
    const address = await resolveAddress(input.location.lat, input.location.lng, input.location);
    await upsertSession(phone, {
      state: 'awaiting_base_confirm',
      data: {
        pending_base_lat: input.location.lat,
        pending_base_lng: input.location.lng,
        ...(address ? { pending_base_text: address } : {}),
      },
    });
    return sendD(phone, tpl.updateBase(lang), 'awaiting_base_confirm');
  }

  const amount = parseAmount(text);
  if (amount !== null) {
    const openTrips = await openDispatchedTrips(driver.id);
    if (openTrips.length === 0) return sendD(phone, tpl.driverHelp(lang), 'idle');
    if (openTrips.length === 1) {
      return submitQuote(phone, driver.id, openTrips[0], amount, lang);
    }
    await upsertSession(phone, { state: 'awaiting_trip_pick' });
    return sendD(
      phone,
      {
        kind: 'list',
        body: t('quote_hint', lang),
        button: t('quote_btn', lang),
        sections: [
          {
            title: t('quote_btn', lang),
            rows: openTrips.map((tr) => ({
              id: `pick_trip_${tr.id}`,
              title: `${tr.distance_km ?? '?'} km`,
              description: (tr.drop_text ?? 'trip').slice(0, 60),
            })),
          },
        ],
      },
      'awaiting_trip_pick',
    );
  }

  if (text.startsWith('radius_')) {
    const m = /^radius_(\d+)$/.exec(text);
    if (m) {
      await supabaseAdmin.from('drivers').update({ radius_km: Number(m[1]) }).eq('id', driver.id);
      return sendD(phone, tpl.baseUpdated(lang), 'idle');
    }
  }

  if (text === 'language' || text === 'ಭಾಷೆ') {
    await upsertSession(phone, { state: 'awaiting_language' });
    return sendD(phone, tpl.languageMenu(lang), 'awaiting_language');
  }

  return sendD(phone, tpl.driverHelp(lang), 'idle');
}

// ── helpers ─────────────────────────────────────────────────────────────

async function openDispatchedTrips(driverId: string): Promise<Trip[]> {
  const { data } = await supabaseAdmin
    .from('lead_dispatches')
    .select('trip_id')
    .eq('driver_id', driverId);
  const ids = ((data ?? []) as Array<{ trip_id: string }>).map((r) => r.trip_id);
  if (ids.length === 0) return [];
  const { data: trips } = await supabaseAdmin
    .from('trips')
    .select('*')
    .in('id', ids)
    .eq('status', 'open');
  return ((trips ?? []) as Trip[])
    .filter((tr) => !quoteWindowClosed(tr))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}


/**
 * The right "this trip is gone" message. A trip nobody took is not the same
 * as one another driver won, and telling a driver "it was taken" when it
 * simply expired is confusing.
 */
function tripUnavailable(trip: Trip | null, lang: Lang): OutMessage {
  if (!trip) return tpl.tripTaken(lang);
  if (trip.status === 'expired' || trip.status === 'cancelled') return tpl.tripExpired(lang);
  if (trip.status === 'open' && quoteWindowClosed(trip)) return tpl.tripExpired(lang);
  return tpl.tripTaken(lang);
}


const DRIVER_CANCEL_REASONS: Record<string, string> = {
  creason_unreachable: 'Rider not answering',
  creason_too_far: 'Too far',
  creason_vehicle_problem: 'Vehicle problem',
  creason_not_available: 'Not available now',
};

/**
 * A driver dropping out reopens the trip AND re-notifies drivers. Without the
 * re-dispatch the rider waits out the whole quote window with nobody alerted.
 */
async function finalizeDriverCancel(
  phone: string,
  driverId: string,
  tripId: string,
  reasonLabel: string,
  reasonId: string,
  lang: Lang,
): Promise<void> {
  const settings = await getSettings();
  await updateTrip(tripId, {
    status: 'open',
    driver_id: null,
    assigned_at: null,
    quoted_amount_paise: null,
    leads_dispatched: false,
    // Why the driver dropped out - kept even though the trip is reopened.
    cancel_reason: reasonLabel,
    quote_window_closes_at: new Date(
      Date.now() + settings.quote_window_minutes * 60_000,
    ).toISOString(),
  });
  await supabaseAdmin.from('quotes').update({ status: 'lapsed' }).eq('trip_id', tripId);
  await supabaseAdmin.from('trip_otps').delete().eq('trip_id', tripId);

  recordEvent('cancelled', {
    actorRole: 'driver',
    actorId: driverId,
    tripId,
    properties: { reopened: true, reason_id: reasonId, reason: reasonLabel, stage: 'driver_cancelled' },
  });

  const trip = await getTrip(tripId);
  if (trip) {
    const reopened: Trip = { ...trip, status: 'open', leads_dispatched: false };
    const notified = await dispatchLeads(reopened);
    if (notified === 0) {
      // Nobody else covers the pickup - do not promise another auto.
      await noCoverExpire(reopened);
    } else {
      const rider = await getRiderById(trip.rider_id);
      if (rider) {
        await send(
          rider.phone,
          'rider',
          tpl.driverDroppedOut(langOf(rider.preferred_language), null),
          { tripId },
        );
        await upsertSession(rider.phone, {
          state: 'collecting_quotes',
          role: 'rider',
          current_trip_id: tripId,
          data: { pending_trip_id: tripId },
        });
      }
    }
  }

  await resetSession(phone, { state: 'idle', role: 'driver' });
  await sendD(phone, tpl.driverCancelled(lang), 'idle');
}


/** A separate message: a URL button cannot share a message with reply buttons. */
async function sendNavigation(
  phone: string,
  lang: Lang,
  kind: 'pickup' | 'drop',
  trip: Trip,
): Promise<void> {
  const lat = kind === 'pickup' ? trip.pickup_lat : trip.drop_lat;
  const lng = kind === 'pickup' ? trip.pickup_lng : trip.drop_lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  await sendD(phone, tpl.navigateTo(lang, kind, lat, lng), 'idle', trip.id);
}

async function submitQuote(
  phone: string,
  driverId: string,
  trip: Trip,
  amountPaise: number,
  lang: Lang,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('quotes')
    .select('amount_paise')
    .eq('trip_id', trip.id)
    .eq('driver_id', driverId)
    .maybeSingle();
  if (existing) {
    await resetSession(phone, { state: 'idle', role: 'driver' });
    return sendD(phone, tpl.alreadyQuoted(lang, (existing as { amount_paise: number }).amount_paise), 'idle');
  }

  if (quoteWindowClosed(trip) || trip.status !== 'open') {
    await resetSession(phone, { state: 'idle', role: 'driver' });
    return sendD(phone, tripUnavailable(trip, lang), 'idle');
  }

  await supabaseAdmin.from('quotes').insert({
    id: uuid(),
    trip_id: trip.id,
    driver_id: driverId,
    amount_paise: amountPaise,
    status: 'pending',
  });

  const patch: Record<string, unknown> = {};
  if (!trip.first_quote_at) patch.first_quote_at = new Date().toISOString();
  if (Object.keys(patch).length) await updateTrip(trip.id, patch);

  recordEvent('quote_received', {
    actorRole: 'driver',
    actorId: driverId,
    tripId: trip.id,
    properties: { amount_paise: amountPaise },
  });

  await sendRiderQuoteList(trip);

  await resetSession(phone, { state: 'idle', role: 'driver' });
  await sendD(phone, tpl.quoteSent(lang, amountPaise), 'idle');
}
