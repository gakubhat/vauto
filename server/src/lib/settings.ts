/**
 * Validate and coerce an admin settings payload into a safe update patch.
 *
 * Pulled out of the route so it can be unit-tested: a 0 quote window or 0
 * dispute clock is accepted by the database but has real consequences
 * (instant expiry / instant disputes), so it must be refused here.
 */
const NUMERIC: Record<string, [number, number]> = {
  quote_window_minutes: [1, 1440],
  max_drivers_per_lead: [1, 500],
  default_radius_km: [1, 100],
  trial_days: [0, 3650],
  trial_min_rides: [0, 10000],
  dispute_hours: [1, 720],
  scheduled_lead_hours: [1, 168],
  quiet_hours_start: [0, 23],
  quiet_hours_end: [0, 23],
  evening_dispatch_hour: [0, 23],
  scheduled_confirm_minutes: [1, 720],
  pick_deadline_minutes: [1, 1440],
  lead_stage_size: [1, 200],
  lead_stage_interval_minutes: [1, 120],
  lead_stage_expand_below: [0, 100],
  template_leads_per_driver_per_day: [0, 100],
  lead_warm_band_km: [0, 50],
  subscription_price_paise: [0, 100_000_000],
};

const PASSTHROUGH = [
  'auto_pick_cheapest',
  'fare_check_enabled',
  'scheduling_enabled',
  'renewal_contact',
  'helpline',
  'office_number',
  'lead_template',
  'kyc_approved_template',
];

export function buildSettingsPatch(body: Record<string, unknown>): {
  patch: Record<string, unknown>;
  error?: string;
} {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const [key, [min, max]] of Object.entries(NUMERIC)) {
    if (!(key in body)) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < min || n > max) {
      return { patch, error: `${key} must be a whole number between ${min} and ${max}` };
    }
    patch[key] = n;
  }

  if ('radius_options' in body) {
    const arr = Array.isArray(body.radius_options) ? body.radius_options.map(Number) : null;
    if (!arr || arr.length === 0 || arr.some((x) => !Number.isInteger(x) || x < 1 || x > 100)) {
      return {
        patch,
        error: 'radius_options must be a non-empty list of whole km between 1 and 100',
      };
    }
    patch.radius_options = arr;
  }

  for (const key of PASSTHROUGH) if (key in body) patch[key] = body[key];

  return { patch };
}
