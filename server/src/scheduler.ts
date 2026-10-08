import { supabaseAdmin } from './supabase/client';
import {
  atRiskExpire,
  closeQuoteWindow,
  dispatchLeads,
  dispatchScheduledLeads,
  pickDeadlineExpire,
} from './lib/matching';
import { clearSettingsCache, getRiderById, getSettings, updateTrip, type Trip } from './state/queries';
import { dispatchAt, inQuietWindow, istHour, type LeadPlan } from './lib/schedule';
import { openHelpRequest } from './lib/help';

/**
 * Everything that must send a WhatsApp message runs here, because pg_cron
 * cannot. Runs every 60 seconds.
 */
export function startScheduler(intervalMs = 60_000): NodeJS.Timeout {
  void runSchedulerTick();
  return setInterval(() => void runSchedulerTick(), intervalMs);
}

/** One pass of the scheduler. Exported so tests can drive it directly. */
export async function runSchedulerTick(): Promise<void> {
  try {
    clearSettingsCache();
    const settings = await getSettings();

    // 1. Scheduled trips: send leads when their dispatch time arrives. For
    // early-morning pickups that is the evening before (quiet-window rule), not
    // 3 AM. The look-back is implicit: anything already due goes out now, which
    // also recovers a dispatch missed during an outage.
    const plan: LeadPlan = {
      leadHours: settings.scheduled_lead_hours,
      quietStart: settings.quiet_hours_start,
      quietEnd: settings.quiet_hours_end,
      eveningHour: settings.evening_dispatch_hour,
    };
    const horizon = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const { data: scheduled } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('status', 'open')
      .eq('leads_dispatched', false)
      .not('pickup_at', 'is', null)
      .lte('pickup_at', horizon);

    for (const trip of (scheduled ?? []) as Trip[]) {
      if (!trip.pickup_at) continue;
      // Hard rule: never message drivers on a scheduled trip inside the quiet
      // window. A trip that comes due then was either handled the evening
      // before or is not serviceable (and was never offered).
      if (inQuietWindow(istHour(new Date()), plan.quietStart, plan.quietEnd)) continue;
      if (dispatchAt(new Date(trip.pickup_at), plan).getTime() <= Date.now()) {
        await dispatchScheduledLeads(trip);
      }
    }

    // 1b. Staged dispatch: widen to the next batch of nearby drivers while the
    // trip still has too few quotes and there is time left in its window. This
    // is what keeps a trip from blasting every driver the moment it is created.
    const { data: expand } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('status', 'open')
      .eq('leads_dispatched', true)
      .not('next_lead_batch_at', 'is', null)
      .lte('next_lead_batch_at', new Date().toISOString());

    for (const trip of (expand ?? []) as Trip[]) {
      const { count } = await supabaseAdmin
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', trip.id)
        .eq('status', 'pending');
      if ((count ?? 0) >= settings.lead_stage_expand_below) {
        // Enough quotes already - stop widening.
        await updateTrip(trip.id, { next_lead_batch_at: null });
        continue;
      }
      // Do not start a stage with no time left to be answered.
      if (
        trip.quote_window_closes_at &&
        new Date(trip.quote_window_closes_at).getTime() - Date.now() <
          settings.lead_stage_interval_minutes * 60_000
      ) {
        await updateTrip(trip.id, { next_lead_batch_at: null });
        continue;
      }
      await dispatchLeads(trip);
    }

    // 1c. A scheduled trip close to pickup with no quote at all: warn the rider
    // now so they can arrange a backup, rather than failing at pickup time.
    // Skipped for last-minute bookings, which have not had a fair chance.
    const confirmMs = settings.scheduled_confirm_minutes * 60_000;
    const soon = new Date(Date.now() + confirmMs).toISOString();
    const { data: atRisk } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('status', 'open')
      .eq('leads_dispatched', true)
      .not('pickup_at', 'is', null)
      .gt('pickup_at', new Date().toISOString())
      .lte('pickup_at', soon);

    for (const trip of (atRisk ?? []) as Trip[]) {
      if (!trip.pickup_at) continue;
      const bookedAheadMs =
        new Date(trip.pickup_at).getTime() - new Date(trip.created_at).getTime();
      if (bookedAheadMs < confirmMs) continue;
      const { count } = await supabaseAdmin
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', trip.id)
        .eq('status', 'pending');
      if ((count ?? 0) === 0) await atRiskExpire(trip);
    }

    // 2. Open trips past their quote window. A scheduled trip's window is
    // its pickup time (quote_window_closes_at = pickup_at), so it must never
    // be expired before then - the leads were only just sent. `or` keeps
    // immediate trips (pickup_at is null) on the plain window comparison.
    const now = new Date().toISOString();
    const { data: expired } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('status', 'open')
      .not('quote_window_closes_at', 'is', null)
      .lt('quote_window_closes_at', now)
      .or(`pickup_at.is.null,pickup_at.lte.${now}`);

    for (const trip of (expired ?? []) as Trip[]) {
      await closeQuoteWindow(trip);
    }

    // 2b. The rider was shown quotes and given a deadline to pick one, and did
    // not. Expire so the trip stops blocking them from booking again, and tell
    // them. The deadline is set when the list is sent (closeQuoteWindow).
    const { data: timedOut } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('status', 'open')
      .not('pick_deadline_at', 'is', null)
      .lt('pick_deadline_at', new Date().toISOString());

    for (const trip of (timedOut ?? []) as Trip[]) {
      await pickDeadlineExpire(trip);
    }

    // 3. A completion the rider never answered is flipped to `disputed` by the
    // pg_cron function, which cannot send a WhatsApp message. Nothing has told
    // the office yet, so open the dispute for any disputed trip that has no
    // help request (the explicit No already opened one; this covers silence).
    const { data: disputed } = await supabaseAdmin
      .from('trips')
      .select('*')
      .eq('status', 'disputed');

    for (const trip of (disputed ?? []) as Trip[]) {
      const [{ data: byTrip }, rider] = await Promise.all([
        supabaseAdmin.from('help_requests').select('id').eq('trip_id', trip.id).limit(1),
        getRiderById(trip.rider_id),
      ]);
      if ((byTrip ?? []).length > 0 || !rider) continue;
      // Idempotent and escalating: creates the request, or upgrades an open
      // plain help request to an urgent dispute. Repeats are no-ops.
      await openHelpRequest({
        phone: rider.phone,
        role: 'rider',
        source: 'dispute',
        tripId: trip.id,
        name: rider.name,
      });
    }
  } catch (e) {
    console.error('[SCHEDULER ERROR]', e);
  }
}
