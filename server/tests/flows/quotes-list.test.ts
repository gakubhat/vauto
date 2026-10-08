import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { closeQuoteWindow } from '../../src/lib/matching';
import { getTrip } from '../../src/state/queries';
import {
  DRIVER_A_PHONE,
  DRIVER_B_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
  findButtonId,
  messageLog,
  messagesTo,
  postTrip,
  riderStep,
  seedDriver,
  seedRider,
  setAutoPickCheapest,
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
  await setAutoPickCheapest(false);
});
afterAll(async () => {
  await truncateAll();
});

function quoteLists() {
  return messagesTo(RIDER_PHONE).filter(
    (m) =>
      m.msg.kind === 'list' &&
      m.msg.sections.some((s) => s.rows.some((r) => r.id.startsWith('accept_quote_'))),
  );
}

function quoteRowsOf(msg: (typeof messageLog)[number]['msg']) {
  if (msg.kind !== 'list') return [];
  return msg.sections.flatMap((s) => s.rows.filter((r) => r.id.startsWith('accept_quote_')));
}

describe('quote list', () => {
  it('sends one list of quotes, not a separate Accept per quote', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      name: 'Ramesh',
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
    });
    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });

    const lists = quoteLists();
    expect(lists.length).toBe(1);
    expect(quoteRowsOf(lists[0].msg).length).toBe(1);
    expect(messagesTo(RIDER_PHONE).some((m) => m.msg.kind === 'buttons' && m.msg.body.includes('Ramesh'))).toBe(
      false,
    );
  }, 60000);

  it('refreshes the list when a second quote arrives', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      name: 'Ramesh',
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
    });
    await seedDriver(DRIVER_B_PHONE, {
      name: 'Suresh',
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
    });
    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '90' });
    await driverStep(DRIVER_B_PHONE, { text: '70' });

    const lists = quoteLists();
    expect(lists.length).toBe(2);
    expect(quoteRowsOf(lists[0].msg).length).toBe(1);
    expect(quoteRowsOf(lists[1].msg).length).toBe(2);
  }, 60000);

  it('assigns the trip when the rider taps a row in the list', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      name: 'Ramesh',
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
    });
    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' });

    const accept = findButtonId('accept_quote_', RIDER_PHONE) as string;
    await riderStep({ text: accept });

    expect((await getTrip(tripId))?.status).toBe('assigned');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('trip_assigned');
  }, 60000);

  it('orders equal-priced quotes by who replied first', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { name: 'Ramesh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await seedDriver(DRIVER_B_PHONE, { name: 'Suresh', lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
    await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '70' }); // first to reply
    await driverStep(DRIVER_B_PHONE, { text: '70' }); // same price, later

    const lists = quoteLists();
    const rows = quoteRowsOf(lists[lists.length - 1].msg);
    expect(rows.length).toBe(2);

    const ids = rows.map((r) => r.id.replace('accept_quote_', ''));
    const { data: quotes } = await supabaseAdmin.from('quotes').select('id, driver_id').in('id', ids);
    const driverByQuote = new Map(
      (quotes ?? []).map((q) => [(q as { id: string }).id, (q as { driver_id: string }).driver_id]),
    );
    const { data: drvA } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('phone', DRIVER_A_PHONE)
      .single();
    // Cheapest-equal, first-reply first.
    expect(driverByQuote.get(ids[0])).toBe((drvA as { id: string }).id);
  }, 60000);

  it('keeps the trip open at window close so the rider can still pick', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      name: 'Ramesh',
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
    });
    const tripId = await postTrip();
    await driverStep(DRIVER_A_PHONE, { text: '80' });

    const before = quoteLists().length;
    await closeQuoteWindow((await getTrip(tripId)) as never);
    await closeQuoteWindow((await getTrip(tripId)) as never);

    expect((await getTrip(tripId))?.status).toBe('open');
    expect((await stateOf(RIDER_PHONE))?.state).toBe('collecting_quotes');
    expect((await stateOf(RIDER_PHONE))?.data).toMatchObject({ choice_prompted: true });
    const after = quoteLists();
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].msg.kind === 'list' && after[after.length - 1].msg.body).toMatch(/Time to pick/);
  }, 60000);
});
