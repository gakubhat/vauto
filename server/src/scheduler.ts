import { supabaseAdmin } from './supabase/client';
import { closeQuoteWindow, dispatchLeads } from './lib/matching';
import { getSettings, clearSettingsCache, type Trip } from './state/queries';

/**
 * Everything that must send a WhatsApp message runs here, because pg_cron
 * cannot. Runs every 60 seconds.
 */
export function startScheduler(intervalMs = 60_000): NodeJS.Timeout {
  const tick = async () => {
    try {
      clearSettingsCache();
      const settings = await getSettings();

      // 1. Scheduled trips: send leads N hours before pickup.
      const from = new Date();
      const to = new Date(Date.now() + settings.scheduled_lead_hours * 3_600_000);
      const { data: scheduled } = await supabaseAdmin
        .from('trips')
        .select('*')
        .eq('status', 'open')
        .eq('leads_dispatched', false)
        .gte('pickup_at', from.toISOString())
        .lte('pickup_at', to.toISOString());

      for (const trip of (scheduled ?? []) as Trip[]) {
        await dispatchLeads(trip);
      }

      // 2. Open trips past their quote window.
      const { data: expired } = await supabaseAdmin
        .from('trips')
        .select('*')
        .eq('status', 'open')
        .lt('quote_window_closes_at', new Date().toISOString());

      for (const trip of (expired ?? []) as Trip[]) {
        await closeQuoteWindow(trip);
      }
    } catch (e) {
      console.error('[SCHEDULER ERROR]', e);
    }
  };

  void tick();
  return setInterval(tick, intervalMs);
}
