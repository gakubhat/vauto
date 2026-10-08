import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { getTrip } from '../../src/state/queries';
import {
  DRIVER_A_PHONE,
  DRIVER_B_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
  findButtonId,
  messageLog,
  postTrip,
  renderLog,
  riderStep,
  seedDriver,
  seedRider,
  setupMockSendMessage,
  stateOf,
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

describe('ride lifecycle', () => {
  it('books, collects quotes, assigns, starts and completes', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await seedDriver(DRIVER_B_PHONE, { name: 'Suresh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    const tripId = await postTrip();
    expect(tripId).toBeTruthy();
    expect(await stateOf(RIDER_PHONE)).toMatchObject({ role: 'rider', state: 'collecting_quotes' });

    // Both drivers were sent a lead with a Quote button.
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
    expect(findButtonId('quote_', DRIVER_B_PHONE)).toBeTruthy();

    await driverStep(DRIVER_A_PHONE, { text: '90' });
    await driverStep(DRIVER_B_PHONE, { text: '70' });

    const { data: quotes } = await supabaseAdmin.from('quotes').select('*').eq('trip_id', tripId);
    expect(quotes?.length).toBe(2);

    // Quotes arrive as one list the rider picks from, not a per-quote Accept.
    const acceptId = findButtonId('accept_quote_', RIDER_PHONE);
    expect(acceptId).toBeTruthy();
    const lists = messageLog.filter(
      (m) =>
        m.to === RIDER_PHONE &&
        m.msg.kind === 'list' &&
        m.msg.sections.some((s) => s.rows.some((r) => r.id.startsWith('accept_quote_'))),
    );
    expect(lists.length).toBeGreaterThan(0);
    const lastList = lists[lists.length - 1];
    if (lastList.msg.kind !== 'list') throw new Error('expected list');
    const quoteRows = lastList.msg.sections.flatMap((s) =>
      s.rows.filter((r) => r.id.startsWith('accept_quote_')),
    );
    expect(quoteRows.length).toBe(2);

    await riderStep({ text: acceptId as string });

    const trip = await getTrip(tripId);
    expect(trip?.status).toBe('assigned');
    expect(trip?.quoted_amount_paise).toBe(7000);
    expect((await stateOf(RIDER_PHONE))?.state).toBe('trip_assigned');

    // Driver arrives and enters the OTP.
    await driverStep(DRIVER_B_PHONE, { text: 'arrived' });
    const { data: otp } = await supabaseAdmin
      .from('trip_otps')
      .select('code')
      .eq('trip_id', tripId)
      .single();
    expect(otp).toBeTruthy();

    await driverStep(DRIVER_B_PHONE, { text: '0000' });
    expect((await getTrip(tripId))?.status).toBe('arrived');

    await driverStep(DRIVER_B_PHONE, { text: (otp as { code: string }).code });
    expect((await getTrip(tripId))?.status).toBe('in_progress');

    // Driver marks done, rider confirms.
    await driverStep(DRIVER_B_PHONE, { text: 'DONE' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_completion_confirm');

    await riderStep({ text: 'confirm_yes' });
    expect((await getTrip(tripId))?.status).toBe('completed');

    // Rider rates the driver.
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_rating');
    await riderStep({ text: 'rate_5' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('idle');

    const { data: ratings } = await supabaseAdmin.from('ratings').select('*').eq('trip_id', tripId);
    expect(ratings?.length).toBe(1);

    console.log('\n' + renderLog());
  }, 60000);

  it('rejects an invalid quote and keeps the driver in the same state', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();

    const quoteBtn = findButtonId('quote_', DRIVER_A_PHONE) as string;
    expect(quoteBtn).toBeTruthy();
    await driverStep(DRIVER_A_PHONE, { text: quoteBtn });
    await driverStep(DRIVER_A_PHONE, { text: 'abc' });

    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('awaiting_quote_amount');
    const { data: quotes } = await supabaseAdmin.from('quotes').select('*');
    expect(quotes?.length ?? 0).toBe(0);
  }, 60000);
});

/** Book, assign, start and DONE a trip, leaving the rider on the completion prompt. */
async function rideToDone(): Promise<string> {
  const tripId = await postTrip();
  await driverStep(DRIVER_A_PHONE, { text: '70' });
  await riderStep({ text: findButtonId('accept_quote_', RIDER_PHONE) as string });
  await driverStep(DRIVER_A_PHONE, { text: 'arrived' });
  const { data: otp } = await supabaseAdmin
    .from('trip_otps')
    .select('code')
    .eq('trip_id', tripId)
    .single();
  await driverStep(DRIVER_A_PHONE, { text: (otp as { code: string }).code });
  await driverStep(DRIVER_A_PHONE, { text: 'DONE' });
  return tripId;
}

describe('dispute safety net', () => {
  it('flags an unanswered completion as disputed after dispute_hours', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await rideToDone();

    // The rider never answers. The trip stays in_progress so it is still the
    // rider's active trip; pg_cron must turn the silence into a dispute.
    expect((await getTrip(tripId))?.status).toBe('in_progress');
    await supabaseAdmin
      .from('trips')
      .update({ done_at: new Date(Date.now() - 25 * 3_600_000).toISOString() })
      .eq('id', tripId);
    const { error } = await supabaseAdmin.rpc('v3_auto_dispute_stale');
    expect(error).toBeNull();

    expect((await getTrip(tripId))?.status).toBe('disputed');
  }, 60000);

  it('refuses a late Yes once the silence has already disputed the trip', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await rideToDone();

    await supabaseAdmin.from('trips').update({ status: 'disputed' }).eq('id', tripId);
    await riderStep({ text: 'confirm_yes' });

    // The office owns it now; the late tap must not flip it back to completed.
    expect((await getTrip(tripId))?.status).toBe('disputed');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('idle');
  }, 60000);

  it('lets the rider skip the rating instead of trapping them', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await rideToDone();

    await riderStep({ text: 'confirm_yes' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_rating');

    await riderStep({ text: 'stop' });
    expect((await stateOf(RIDER_PHONE))?.state).toBe('idle');
    expect((await getTrip(tripId))?.status).toBe('completed');
  }, 60000);
});
