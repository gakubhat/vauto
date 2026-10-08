import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { runSchedulerTick } from '../../src/scheduler';
import { getTrip } from '../../src/state/queries';
import {
  DRIVER_A_PHONE,
  DRIVER_B_PHONE,
  DRIVER_C_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
  findButtonId,
  messageLog,
  postTrip,
  riderStep,
  riderStepAs,
  seedDriver,
  seedRider,
  setOfficeNumber,
  setScheduling,
  setStaging,
  setTemplateCap,
  setWarmBand,
  setupMockSendMessage,
  stateOf,
  truncateAll,
} from '../engine';

const OFFICE_PHONE = '+919999000007';
const RIDER_2_PHONE = '+919999000021';

beforeAll(async () => {
  setupMockSendMessage();
  await truncateAll();
});
beforeEach(async () => {
  messageLog.length = 0;
  await truncateAll();
  await setScheduling(true);
  // Deterministic staged-dispatch defaults for every test.
  await setStaging({ size: 10, intervalMinutes: 6, expandBelow: 3 });
  await setTemplateCap(5);
  await setWarmBand(1);
});
afterAll(async () => {
  await setScheduling(false);
  await truncateAll();
});

/** Book a scheduled trip with a given pickup time and hold the leads back. */
async function bookScheduled(pickupAt: Date): Promise<string> {
  await riderStep({ text: 'auto' });
  await riderStep({ location: PICKUP });
  await riderStep({ location: { lat: 12.98, lng: 77.6 } });
  await riderStep({ text: 'schedule' });
  await riderStep({ text: findButtonId('slot_', RIDER_PHONE) as string });
  await riderStep({ text: findButtonId('hour_', RIDER_PHONE) as string });
  const tripId = (await stateOf(RIDER_PHONE))?.data?.pending_trip_id as string;
  await supabaseAdmin
    .from('trips')
    .update({ pickup_at: pickupAt.toISOString(), quote_window_closes_at: pickupAt.toISOString() })
    .eq('id', tripId);
  return tripId;
}

describe('scheduler', () => {
  it('leads a scheduled trip and does not expire it in the same pass', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    // Pickup is just inside the lead window, so this tick dispatches it.
    const tripId = await bookScheduled(new Date(Date.now() + 30 * 60_000));
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeUndefined();

    await runSchedulerTick();

    const trip = await getTrip(tripId);
    // Dispatched, and still open for quotes - not expired by phase 2.
    expect(trip?.leads_dispatched).toBe(true);
    expect(trip?.status).toBe('open');
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
    expect(new Date(trip?.quote_window_closes_at as string).getTime()).toBeGreaterThan(Date.now());
  }, 60000);

  it('does not dispatch or expire a scheduled trip whose pickup is far away', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    const tripId = await bookScheduled(new Date(Date.now() + 6 * 3_600_000));

    await runSchedulerTick();

    const trip = await getTrip(tripId);
    expect(trip?.leads_dispatched).toBe(false);
    expect(trip?.status).toBe('open');
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeUndefined();
  }, 60000);

  it('still expires an immediate trip whose quote window has closed', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();

    await supabaseAdmin
      .from('trips')
      .update({ quote_window_closes_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', tripId);

    await runSchedulerTick();

    expect((await getTrip(tripId))?.status).toBe('expired');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_retry_choice');
  }, 60000);

  it('dispatches a scheduled trip whose lead window was missed', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });

    // Pickup already passed, so the forward-only window used to skip it and the
    // trip would expire undispatched. The look-back recovers it.
    const tripId = await bookScheduled(new Date(Date.now() - 30 * 60_000));
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeUndefined();

    await runSchedulerTick();

    const trip = await getTrip(tripId);
    expect(trip?.leads_dispatched).toBe(true);
    expect(trip?.status).toBe('open');
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
  }, 60000);

  it('retries a scheduled dispatch whose sends all failed', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await bookScheduled(new Date(Date.now() + 30 * 60_000));

    const { setTransport } = await import('../../src/whatsapp/api');
    setTransport(async () => {
      throw new Error('boom');
    });
    await runSchedulerTick();
    setupMockSendMessage();

    // A failed batch records no offer and schedules a retry (next_lead_batch_at).
    const afterFail = await getTrip(tripId);
    expect(afterFail?.status).toBe('open');
    expect(afterFail?.next_lead_batch_at).toBeTruthy();
    const { data: failedOffers } = await supabaseAdmin
      .from('lead_dispatches')
      .select('driver_id')
      .eq('trip_id', tripId);
    expect(failedOffers?.length ?? 0).toBe(0);

    // Make the retry due; it now succeeds.
    await supabaseAdmin
      .from('trips')
      .update({ next_lead_batch_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', tripId);
    await runSchedulerTick();

    expect((await getTrip(tripId))?.leads_dispatched).toBe(true);
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
  }, 60000);

  it('widens to the next stage only while the trip still needs quotes', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await seedDriver(DRIVER_B_PHONE, { lat: PICKUP.lat + 0.002, lng: PICKUP.lng, radiusKm: 5 });
    await seedDriver(DRIVER_C_PHONE, { lat: PICKUP.lat + 0.004, lng: PICKUP.lng, radiusKm: 5 });
    // One driver per stage; one quote is enough to stop widening.
    await setStaging({ size: 1, expandBelow: 1 });

    const tripId = await postTrip();
    const offers = async (): Promise<number> =>
      (
        await supabaseAdmin.from('lead_dispatches').select('driver_id').eq('trip_id', tripId)
      ).data?.length ?? 0;
    expect(await offers()).toBe(1);

    // Next stage due -> exactly one more driver offered.
    await supabaseAdmin
      .from('trips')
      .update({ next_lead_batch_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', tripId);
    await runSchedulerTick();
    expect(await offers()).toBe(2);

    // Quote from whichever driver was offered, then it stops widening.
    const { data: offerRows } = await supabaseAdmin
      .from('lead_dispatches')
      .select('driver_id')
      .eq('trip_id', tripId)
      .limit(1);
    const { data: drv } = await supabaseAdmin
      .from('drivers')
      .select('phone')
      .eq('id', (offerRows ?? [])[0].driver_id as string)
      .single();
    await driverStep((drv as { phone: string }).phone, { text: '70' });

    await supabaseAdmin
      .from('trips')
      .update({ next_lead_batch_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', tripId);
    await runSchedulerTick();

    expect((await getTrip(tripId))?.next_lead_batch_at).toBeFalsy();
    expect(await offers()).toBe(2);
  }, 60000);

  it('does not template a dormant driver beyond the daily cap', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, lastReplyAt: null });
    await setTemplateCap(1);

    const { data: drv } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('phone', DRIVER_A_PHONE)
      .single();
    const driverId = (drv as { id: string }).id;

    // First trip: the one allowed template goes out.
    await postTrip();
    const { count: firstCount } = await supabaseAdmin
      .from('lead_dispatches')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driverId)
      .eq('channel', 'template');
    expect(firstCount).toBe(1);

    // Second trip: the dormant driver is at his cap, so nobody is offered and
    // the trip dies as no-cover rather than paying to spam him.
    await seedRider(RIDER_2_PHONE, 'Gita');
    await riderStepAs(RIDER_2_PHONE, { text: 'auto' });
    await riderStepAs(RIDER_2_PHONE, { location: PICKUP });
    await riderStepAs(RIDER_2_PHONE, { location: { lat: 12.98, lng: 77.6 } });
    await riderStepAs(RIDER_2_PHONE, { text: 'book_now' });

    // The session is reset by the no-cover expiry, so find the trip by rider.
    const { data: r2 } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('phone', RIDER_2_PHONE)
      .single();
    const { data: trips2 } = await supabaseAdmin
      .from('trips')
      .select('id, status')
      .eq('rider_id', (r2 as { id: string }).id)
      .order('created_at', { ascending: false })
      .limit(1);
    const trip2 = (trips2 ?? [])[0]?.id as string;
    expect((trips2 ?? [])[0]?.status).toBe('expired');

    const { data: d2 } = await supabaseAdmin
      .from('lead_dispatches')
      .select('driver_id')
      .eq('trip_id', trip2);
    expect(d2?.length ?? 0).toBe(0);
  }, 60000);

  it('prefers a warm driver inside the band over a nearer cold one', async () => {
    await seedRider();
    // Cold driver right at the pickup; warm driver ~0.9 km away, inside the band.
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, lastReplyAt: null });
    await seedDriver(DRIVER_B_PHONE, { lat: PICKUP.lat + 0.008, lng: PICKUP.lng, radiusKm: 5 });
    await setStaging({ size: 1 });
    await setWarmBand(1);

    const tripId = await postTrip();
    const { data: warm } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('phone', DRIVER_B_PHONE)
      .single();
    const { data: offers } = await supabaseAdmin
      .from('lead_dispatches')
      .select('driver_id')
      .eq('trip_id', tripId);

    expect((offers ?? []).map((r) => (r as { driver_id: string }).driver_id)).toEqual([
      (warm as { id: string }).id,
    ]);
  }, 60000);

  it('does not push a warm driver outside the band ahead of nearer cold ones', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5, lastReplyAt: null });
    await seedDriver(DRIVER_C_PHONE, { lat: PICKUP.lat + 0.004, lng: PICKUP.lng, radiusKm: 5, lastReplyAt: null });
    // Warm, but ~2.2 km away - outside the 1 km band.
    await seedDriver(DRIVER_B_PHONE, { lat: PICKUP.lat + 0.02, lng: PICKUP.lng, radiusKm: 5 });
    await setStaging({ size: 1 });
    await setWarmBand(1);

    const tripId = await postTrip();
    const { data: warm } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('phone', DRIVER_B_PHONE)
      .single();
    const { data: offers } = await supabaseAdmin
      .from('lead_dispatches')
      .select('driver_id')
      .eq('trip_id', tripId);
    const offered = (offers ?? []).map((r) => (r as { driver_id: string }).driver_id);

    expect(offered.length).toBe(1);
    expect(offered).not.toContain((warm as { id: string }).id);
  }, 60000);

  it('expires a trip the rider never picked, after the pick deadline', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });

    // Close the window: this tick shows the rider the list and sets the deadline.
    await supabaseAdmin
      .from('trips')
      .update({ quote_window_closes_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', tripId);
    await runSchedulerTick();
    expect((await getTrip(tripId))?.status).toBe('open');
    expect((await getTrip(tripId))?.pick_deadline_at).toBeTruthy();

    // The rider never picks; once the deadline passes the trip expires and frees them.
    await supabaseAdmin
      .from('trips')
      .update({ pick_deadline_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', tripId);
    await runSchedulerTick();

    expect((await getTrip(tripId))?.status).toBe('expired');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('awaiting_retry_choice');
  }, 60000);

  it('opens a dispute for the office when a silent completion is disputed', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await setOfficeNumber(OFFICE_PHONE);
    const tripId = await postTrip();

    // What pg_cron does to a trip the rider never answered.
    await supabaseAdmin.from('trips').update({ status: 'disputed' }).eq('id', tripId);
    const pre = await supabaseAdmin.from('help_requests').select('id').eq('trip_id', tripId);

    await runSchedulerTick();

    const { data: help } = await supabaseAdmin
      .from('help_requests')
      .select('source, trip_id')
      .eq('trip_id', tripId);
    expect(help?.[0]?.source).toBe('dispute');
    // If our pass won the race, the office gets a real message. If the dev
    // server's own scheduler won it, the row proves the same path ran.
    if ((pre.data ?? []).length === 0) {
      expect(
        messageLog.some(
          (m) => m.to === OFFICE_PHONE && ((m.msg as { body?: string }).body ?? '').includes('Dispute'),
        ),
      ).toBe(true);
    }

    // Idempotent: a second pass does not alert again.
    const before = messageLog.length;
    await runSchedulerTick();
    expect(messageLog.slice(before).filter((m) => m.to === OFFICE_PHONE).length).toBe(0);
    await setOfficeNumber(null);
  }, 60000);
});
