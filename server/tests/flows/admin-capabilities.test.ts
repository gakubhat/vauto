import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { resolveRole } from '../../src/routes/webhook';
import { resolveDispute } from '../../src/lib/dispute';
import { buildSettingsPatch } from '../../src/lib/settings';
import {
  clearRoleOverride,
  getDriverByPhone,
  getRiderByPhone,
  getTrip,
  setRoleOverride,
} from '../../src/state/queries';
import { deleteSession } from '../../src/state/store';
import {
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  messageLog,
  postTrip,
  seedDriver,
  seedRider,
  setupMockSendMessage,
  truncateAll,
} from '../engine';

beforeAll(async () => {
  setupMockSendMessage();
  await truncateAll();
});
beforeEach(async () => {
  messageLog.length = 0;
  await truncateAll();
});
afterAll(async () => {
  await truncateAll();
});

function bodiesTo(phone: string): string[] {
  return messageLog.filter((m) => m.to === phone).map((m) => (m.msg as { body?: string }).body ?? '');
}

async function waitForEvent(tripId: string, type: string): Promise<boolean> {
  for (let i = 0; i < 20; i += 1) {
    const { data } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('trip_id', tripId)
      .eq('type', type)
      .limit(1);
    if ((data ?? []).length > 0) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

describe('office role override', () => {
  it('pins a phone onto either flow and survives session deletion', async () => {
    await seedRider(RIDER_PHONE, 'Sita');
    await deleteSession(RIDER_PHONE);

    // Naturals: in the riders table, resolves as rider.
    expect((await resolveRole(RIDER_PHONE))?.role).toBe('rider');

    // Pin to driver: even with a rider row present, and after the session is
    // deleted, it must resolve as driver (the old override snapped back).
    await setRoleOverride(RIDER_PHONE, 'driver', 'test');
    await deleteSession(RIDER_PHONE);
    expect((await resolveRole(RIDER_PHONE))?.role).toBe('driver');
    expect(await getDriverByPhone(RIDER_PHONE)).toBeTruthy();

    // Clear: back to the natural role.
    await clearRoleOverride(RIDER_PHONE);
    await deleteSession(RIDER_PHONE);
    expect((await resolveRole(RIDER_PHONE))?.role).toBe('rider');
    expect(await getRiderByPhone(RIDER_PHONE)).toBeTruthy();
  }, 60000);
});

describe('settings validation', () => {
  it('refuses unsafe values and coerces valid ones', () => {
    expect(buildSettingsPatch({ quote_window_minutes: 0 }).error).toMatch(/quote_window_minutes/);
    expect(buildSettingsPatch({ dispute_hours: -1 }).error).toMatch(/dispute_hours/);
    expect(buildSettingsPatch({ radius_options: [] }).error).toMatch(/radius_options/);
    expect(buildSettingsPatch({ radius_options: [0] }).error).toBeTruthy();

    const { patch, error } = buildSettingsPatch({
      quote_window_minutes: 15,
      radius_options: [2, 4],
      helpline: '+911234',
    });
    expect(error).toBeUndefined();
    expect(patch.quote_window_minutes).toBe(15);
    expect(patch.radius_options).toEqual([2, 4]);
    expect(patch.helpline).toBe('+911234');
  });
});

describe('dispute resolution', () => {
  it('records the ruling and tells the rider', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    await supabaseAdmin.from('trips').update({ status: 'disputed' }).eq('id', tripId);
    const trip = await getTrip(tripId);
    messageLog.length = 0;

    await resolveDispute(trip!, 'completed', 'Rider was right');

    expect(bodiesTo(RIDER_PHONE).some((b) => b.includes('reviewed your trip'))).toBe(true);
    expect(await waitForEvent(tripId, 'dispute_resolved')).toBe(true);
  }, 60000);
});
