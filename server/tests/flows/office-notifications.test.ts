import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { notifyDriverOfApproval } from '../../src/lib/notify-driver';
import {
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
  findButtonId,
  messageLog,
  postTrip,
  riderStep,
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

describe('office notifications', () => {
  it('tells a driver when the office verifies them', async () => {
    const driverId = await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, language: 'english' });

    await notifyDriverOfApproval(driverId, 'approve');

    const sent = messageLog.filter((m) => m.to === DRIVER_A_PHONE);
    expect(sent).toHaveLength(1);
    const body = (sent[0].msg as { body: string }).body;
    expect(body).toContain('verified');
  }, 60000);

  /**
   * A driver's first ever mention of money used to be the message telling them
   * their subscription had lapsed. Approval is the one moment we have their
   * attention, so the terms belong here.
   */
  it('states the current terms when approving a driver', async () => {
    const driverId = await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, language: 'english' });

    await notifyDriverOfApproval(driverId, 'approve');

    const body = messageLog
      .filter((m) => m.to === DRIVER_A_PHONE)
      .map((m) => (m.msg as { body: string }).body)
      .join('\n');

    expect(body).toContain('free');
    expect(body.toLowerCase()).toContain('before that changes');
    expect(body).toContain('HELP');
  }, 60000);

  it('tells a driver when the office rejects them', async () => {
    const driverId = await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, language: 'english' });

    await notifyDriverOfApproval(driverId, 'reject');

    const sent = messageLog.filter((m) => m.to === DRIVER_A_PHONE);
    expect(sent).toHaveLength(1);
    expect((sent[0].msg as { body: string }).body).toContain('not approved');
  }, 60000);

  it('closes a completed ride by telling the rider what to do next', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });

    const { data: otp } = await supabaseAdmin
      .from('trip_otps')
      .select('code, trip_id')
      .single();
    const row = otp as { code: string; trip_id: string };
    await driverStep(DRIVER_A_PHONE, { text: 'arrived' });
    await driverStep(DRIVER_A_PHONE, { text: row.code });
    await driverStep(DRIVER_A_PHONE, { text: 'DONE' });
    await riderStep({ text: 'confirm_yes' });
    await riderStep({ text: 'rate_5' });

    const bodies = messageLog
      .filter((m) => m.to === RIDER_PHONE)
      .map((m) => (m.msg as { body?: string }).body ?? '');

    expect(bodies.some((b) => b.includes('Thanks for the rating'))).toBe(true);
    // The closing message tells them how to start the next one.
    expect(bodies.some((b) => b.includes('Thanks for using VAuto'))).toBe(true);
  }, 60000);
});
