import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '../supabase/client';

export interface Settings {
  quote_window_minutes: number;
  max_drivers_per_lead: number;
  default_radius_km: number;
  radius_options: number[];
  scheduling_enabled: boolean;
  auto_pick_cheapest: boolean;
  fare_check_enabled: boolean;
  trial_days: number;
  trial_min_rides: number;
  dispute_hours: number;
  scheduled_lead_hours: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  evening_dispatch_hour: number;
  scheduled_confirm_minutes: number;
  pick_deadline_minutes: number;
  lead_stage_size: number;
  lead_stage_interval_minutes: number;
  lead_stage_expand_below: number;
  template_leads_per_driver_per_day: number;
  lead_warm_band_km: number;
  subscription_price_paise: number;
  renewal_contact: string | null;
  helpline: string | null;
  office_number: string | null;
  lead_template: string;
  kyc_approved_template: string;
}

let cachedSettings: Settings | null = null;
let cachedAt = 0;

export async function getSettings(): Promise<Settings> {
  if (cachedSettings && Date.now() - cachedAt < 30_000) return cachedSettings;
  const { data } = await supabaseAdmin.from('settings').select('*').eq('id', true).single();
  cachedSettings = data as Settings;
  cachedAt = Date.now();
  return cachedSettings;
}

export function clearSettingsCache(): void {
  cachedSettings = null;
}

export interface Rider {
  id: string;
  phone: string;
  name: string | null;
  preferred_language: string;
  home_lat: number | null;
  home_lng: number | null;
  home_text: string | null;
  rating_avg: number;
  rating_count: number;
}

export interface Driver {
  id: string;
  phone: string;
  name: string | null;
  vehicle_no: string | null;
  preferred_language: string;
  base_lat: number | null;
  base_lng: number | null;
  base_text: string | null;
  radius_km: number;
  approval_status: 'pending' | 'approved' | 'suspended';
  kyc_aadhaar_url: string | null;
  kyc_aadhaar_back_url: string | null;
  kyc_selfie_url: string | null;
  subscription_until: string | null;
  trial_ends_at: string | null;
  rating_avg: number;
  rating_count: number;
  last_reply_at: string | null;
}

export interface Trip {
  id: string;
  trip_number: number;
  rider_id: string;
  driver_id: string | null;
  status: 'open' | 'assigned' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'disputed';
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_text: string | null;
  drop_lat: number | null;
  drop_lng: number | null;
  drop_text: string | null;
  dispute_lat: number | null;
  dispute_lng: number | null;
  dispute_text: string | null;
  distance_km: number | null;
  pickup_at: string | null;
  quote_window_closes_at: string | null;
  leads_dispatched: boolean;
  code_4digit: string | null;
  quoted_amount_paise: number | null;
  reported_fare_paise: number | null;
  fare_check_sent: boolean;
  created_at: string;
  first_quote_at: string | null;
  assigned_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  done_at: string | null;
  completed_at: string | null;
  pick_deadline_at: string | null;
  next_lead_batch_at: string | null;
}

const ACTIVE_STATUSES = ['open', 'assigned', 'arrived', 'in_progress', 'disputed'];

/**
 * A trip only blocks its driver while he is actually on it. Once he sends DONE
 * (`done_at` is set) the ride is over for him, so he must be free for new leads
 * even though the trip stays `in_progress` until the rider confirms or the 24h
 * silence turns it into `disputed`. A `disputed` trip must not block him
 * either: the dispute is between the rider and the office, and holding him out
 * of the pool would punish him for a fare the office has not even ruled on.
 * The rider, by contrast, is blocked by `disputed` and by an unconfirmed
 * `in_progress` trip, so `ACTIVE_STATUSES` above is deliberately left alone.
 */
const DRIVER_ACTIVE_STATUSES = ['open', 'assigned', 'arrived', 'in_progress'];

export async function getRiderByPhone(phone: string): Promise<Rider | null> {
  const { data } = await supabaseAdmin.from('riders').select('*').eq('phone', phone).maybeSingle();
  return (data as Rider | null) ?? null;
}

export async function getDriverByPhone(phone: string): Promise<Driver | null> {
  const { data } = await supabaseAdmin.from('drivers').select('*').eq('phone', phone).maybeSingle();
  return (data as Driver | null) ?? null;
}

export async function ensureRider(phone: string): Promise<Rider> {
  const existing = await getRiderByPhone(phone);
  if (existing) return existing;
  const row = { id: uuid(), phone };
  await supabaseAdmin.from('riders').insert(row);
  return (await getRiderByPhone(phone)) as Rider;
}

export async function ensureDriver(phone: string): Promise<Driver> {
  const existing = await getDriverByPhone(phone);
  if (existing) return existing;
  const row = { id: uuid(), phone };
  await supabaseAdmin.from('drivers').insert(row);
  return (await getDriverByPhone(phone)) as Driver;
}

/**
 * The office can force a phone onto one flow when the Rider/Driver choice was
 * wrong. This is consulted before the tables because the session row (which
 * would otherwise carry the role) is deleted by the 24h cleanup.
 */
export async function getRoleOverride(phone: string): Promise<'rider' | 'driver' | null> {
  const { data } = await supabaseAdmin
    .from('role_overrides')
    .select('role')
    .eq('phone', phone)
    .maybeSingle();
  return ((data as { role: 'rider' | 'driver' } | null)?.role) ?? null;
}

/** Which flow the tables alone would resolve this phone to. */
async function naturalRole(phone: string): Promise<'rider' | 'driver' | null> {
  if (await getDriverByPhone(phone)) return 'driver';
  if (await getRiderByPhone(phone)) return 'rider';
  return null;
}

/** Remove a role row if nothing depends on it, so clearing an override can
 *  actually revert. If the flow has been used, the row is kept deliberately. */
async function removeRoleRowIfUnused(phone: string, role: 'rider' | 'driver'): Promise<void> {
  const count = async (table: string, column: string, id: string): Promise<number> => {
    const { count: n } = await supabaseAdmin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, id);
    return n ?? 0;
  };

  if (role === 'driver') {
    const driver = await getDriverByPhone(phone);
    if (!driver) return;
    const used =
      (await count('trips', 'driver_id', driver.id)) +
      (await count('quotes', 'driver_id', driver.id)) +
      (await count('lead_dispatches', 'driver_id', driver.id)) +
      (await count('subscriptions', 'driver_id', driver.id));
    if (used === 0) await supabaseAdmin.from('drivers').delete().eq('id', driver.id);
    return;
  }

  const rider = await getRiderByPhone(phone);
  if (!rider) return;
  if ((await count('trips', 'rider_id', rider.id)) === 0) {
    await supabaseAdmin.from('riders').delete().eq('id', rider.id);
  }
}

export async function setRoleOverride(
  phone: string,
  role: 'rider' | 'driver',
  setBy: string,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('role_overrides')
    .select('previous_role')
    .eq('phone', phone)
    .maybeSingle();
  const previous =
    (existing as { previous_role: string | null } | null)?.previous_role ??
    (await naturalRole(phone));

  const { error } = await supabaseAdmin.from('role_overrides').upsert({
    phone,
    role,
    previous_role: previous,
    set_at: new Date().toISOString(),
    set_by: setBy,
  });
  if (error) console.error('[ROLE OVERRIDE ERROR]', phone, error.message);
}

export async function clearRoleOverride(phone: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('role_overrides')
    .select('role, previous_role')
    .eq('phone', phone)
    .maybeSingle();
  const row = data as { role: 'rider' | 'driver'; previous_role: 'rider' | 'driver' | null } | null;

  await supabaseAdmin.from('role_overrides').delete().eq('phone', phone);

  // Undo the companion row the override created, but only if it was never used.
  if (row?.previous_role && row.previous_role !== row.role) {
    await removeRoleRowIfUnused(phone, row.role);
  }
}

export async function getTrip(tripId: string): Promise<Trip | null> {
  const { data } = await supabaseAdmin.from('trips').select('*').eq('id', tripId).maybeSingle();
  return (data as Trip | null) ?? null;
}

export async function getActiveTripForRider(riderId: string): Promise<Trip | null> {
  const { data } = await supabaseAdmin
    .from('trips')
    .select('*')
    .eq('rider_id', riderId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Trip | null) ?? null;
}

export async function getActiveTripForDriver(driverId: string): Promise<Trip | null> {
  const { data } = await supabaseAdmin
    .from('trips')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', DRIVER_ACTIVE_STATUSES)
    .is('done_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Trip | null) ?? null;
}

export async function updateTrip(tripId: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabaseAdmin.from('trips').update(patch).eq('id', tripId);
  if (error) {
    console.error('[TRIP UPDATE ERROR]', tripId, error.message);
    return false;
  }
  return true;
}

export async function getRiderById(id: string): Promise<Rider | null> {
  const { data } = await supabaseAdmin.from('riders').select('*').eq('id', id).maybeSingle();
  return (data as Rider | null) ?? null;
}

export async function getDriverById(id: string): Promise<Driver | null> {
  const { data } = await supabaseAdmin.from('drivers').select('*').eq('id', id).maybeSingle();
  return (data as Driver | null) ?? null;
}
