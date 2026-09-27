import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
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
  setHelpline,
  setupMockSendMessage,
  stateOf,
  truncateAll,
} from '../engine';

const LINE = '+91 94482 67561';

beforeAll(async () => {
  setupMockSendMessage();
  await truncateAll();
});
beforeEach(async () => {
  messageLog.length = 0;
  await truncateAll();
  await setHelpline(LINE);
});
afterAll(async () => {
  await truncateAll();
});

function lastTo(phone: string): string {
  const mine = messageLog.filter((m) => m.to === phone);
  const last = mine[mine.length - 1];
  return ((last?.msg as { body?: string })?.body ?? '') as string;
}

async function openHelp(phone = RIDER_PHONE): Promise<Array<Record<string, unknown>>> {
  const { supabaseAdmin } = await import('../../src/supabase/client');
  const { data } = await supabaseAdmin
    .from('help_requests')
    .select('*')
    .eq('phone', phone)
    .is('closed_at', null);
  return (data ?? []) as Array<Record<string, unknown>>;
}

describe('helpline', () => {
  it('answers "help" with the configured number', async () => {
    await seedRider();

    await riderStep({ text: 'help' });

    expect(lastTo(RIDER_PHONE)).toContain(LINE);
    expect((await stateOf(RIDER_PHONE))?.state).toBe('idle');
  }, 60000);

  it('queues the request for the office, once', async () => {
    await seedRider();

    await riderStep({ text: 'help' });
    await riderStep({ text: 'help' });

    // A second "help" is the same person still waiting, not a new request.
    const open = await openHelp();
    expect(open.length).toBe(1);
    expect(open[0].source).toBe('help');
    expect(open[0].role).toBe('rider');
  }, 60000);

  it('answers "help" in Kannada too', async () => {
    await seedRider();

    await riderStep({ text: 'ಸಹಾಯ' });

    expect(lastTo(RIDER_PHONE)).toContain(LINE);
  }, 60000);

  it('still replies when no number is configured', async () => {
    await setHelpline(null);
    await seedRider();

    await riderStep({ text: 'help' });

    // A helpline that stays silent is worse than none - it must say something.
    expect(lastTo(RIDER_PHONE)).toContain('office will help');
  }, 60000);

  it('a driver can reach it too', async () => {
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    await driverStep(DRIVER_A_PHONE, { text: 'help' });

    expect(lastTo(DRIVER_A_PHONE)).toContain(LINE);
  }, 60000);

  it('gives the number when a rider disputes a trip', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });
    await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
    await driverStep(DRIVER_A_PHONE, { text: 'arrived' });

    const { supabaseAdmin } = await import('../../src/supabase/client');
    const { data: otp } = await supabaseAdmin
      .from('trip_otps')
      .select('code')
      .eq('trip_id', tripId)
      .single();
    await driverStep(DRIVER_A_PHONE, { text: (otp as { code: string }).code });
    await driverStep(DRIVER_A_PHONE, { text: 'trip_done' });

    await riderStep({ text: 'confirm_no' });

    expect(lastTo(RIDER_PHONE)).toContain(LINE);
    // A dispute is a person needing a human, so it lands in the same queue,
    // linked to the trip the office will look into.
    const open = await openHelp();
    expect(open.length).toBe(1);
    expect(open[0].source).toBe('dispute');
    expect(open[0].trip_id).toBe(tripId);
  }, 60000);
});
