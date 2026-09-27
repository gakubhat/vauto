import { v4 as uuid } from 'uuid';
import { supabaseAdmin } from '../supabase/client';

export interface Settings {
  quote_window_minutes: number;
  max_drivers_per_lead: number;
  default_radius_km: number;
  radius_options: number[];
  auto_pick_cheapest: boolean;
  fare_check_enabled: boolean;
  trial_days: number;
  trial_min_rides: number;
  dispute_hours: number;
  scheduled_lead_hours: number;
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
}

const ACTIVE_STATUSES = ['open', 'assigned', 'arrived', 'in_progress', 'disputed'];

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
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Trip | null) ?? null;
}

export async function updateTrip(tripId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from('trips').update(patch).eq('id', tripId);
  if (error) console.error('[TRIP UPDATE ERROR]', tripId, error.message);
}

export async function getRiderById(id: string): Promise<Rider | null> {
  const { data } = await supabaseAdmin.from('riders').select('*').eq('id', id).maybeSingle();
  return (data as Rider | null) ?? null;
}

export async function getDriverById(id: string): Promise<Driver | null> {
  const { data } = await supabaseAdmin.from('drivers').select('*').eq('id', id).maybeSingle();
  return (data as Driver | null) ?? null;
}
