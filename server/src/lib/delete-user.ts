import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { supabaseAdmin } from '../supabase/client';
import { recordEvent } from './events';
import { removeObject } from './storage';

export interface DeleteResult {
  ok: boolean;
  deleted: Record<string, number>;
}

async function removeFromStorage(url: string | null, bucket: string): Promise<void> {
  await removeObject(url, bucket);
}

async function deleteTripsOfRider(riderId: string): Promise<number> {
  const { data } = await supabaseAdmin.from('trips').select('id').eq('rider_id', riderId);
  const ids = ((data ?? []) as Array<{ id: string }>).map((t) => t.id);
  if (ids.length === 0) return 0;
  // Quotes, dispatches, ratings, events, messages and OTPs all cascade.
  const { error } = await supabaseAdmin.from('trips').delete().in('id', ids);
  if (error) throw new Error(`trips: ${error.message}`);
  return ids.length;
}

/** Everything a rider owns. Their trips go with them. */
export async function deleteRiderCompletely(riderId: string): Promise<DeleteResult> {
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('phone')
    .eq('id', riderId)
    .maybeSingle();
  const phone = (rider as { phone: string } | null)?.phone;

  const trips = await deleteTripsOfRider(riderId);

  await supabaseAdmin.from('ratings').delete().eq('target_id', riderId);
  await supabaseAdmin.from('conversation_sessions').delete().eq('phone', phone ?? '__none__');

  const { error } = await supabaseAdmin.from('riders').delete().eq('id', riderId);
  if (error) throw new Error(`riders: ${error.message}`);

  recordEvent('user_deleted', {
    actorRole: 'office',
    properties: { kind: 'rider', rider_id: riderId, trips },
  });

  return { ok: true, deleted: { trips } };
}

/**
 * Everything a driver owns, including their KYC documents.
 * Trips they drove are anonymised (driver_id -> NULL) rather than deleted,
 * because those trips are part of a rider's history and of the analytics.
 */
export async function deleteDriverCompletely(driverId: string): Promise<DeleteResult> {
  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('phone, kyc_aadhaar_url, kyc_aadhaar_back_url, kyc_selfie_url')
    .eq('id', driverId)
    .maybeSingle();

  const d = driver as {
    phone: string;
    kyc_aadhaar_url: string | null;
    kyc_aadhaar_back_url: string | null;
    kyc_selfie_url: string | null;
  } | null;

  const { data: driven } = await supabaseAdmin
    .from('trips')
    .select('id')
    .eq('driver_id', driverId);
  const drivenIds = ((driven ?? []) as Array<{ id: string }>).map((t) => t.id);

  // Quotes, dispatches and subscriptions cascade from drivers now.
  await supabaseAdmin.from('ratings').delete().eq('target_id', driverId);
  await supabaseAdmin.from('conversation_sessions').delete().eq('phone', d?.phone ?? '__none__');

  if (d) {
    await removeFromStorage(d.kyc_aadhaar_url, config.storageBucketKyc);
    await removeFromStorage(d.kyc_aadhaar_back_url, config.storageBucketKyc);
    await removeFromStorage(d.kyc_selfie_url, config.storageBucketKyc);
  }

  const { error } = await supabaseAdmin.from('drivers').delete().eq('id', driverId);
  if (error) throw new Error(`drivers: ${error.message}`);

  recordEvent('user_deleted', {
    actorRole: 'office',
    properties: { kind: 'driver', driver_id: driverId, trips_anonymised: drivenIds.length },
  });

  return { ok: true, deleted: { trips_anonymised: drivenIds.length } };
}

export { uuid as newId };
