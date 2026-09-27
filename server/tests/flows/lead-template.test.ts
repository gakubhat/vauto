import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { getTrip } from '../../src/state/queries';
import { inWhatsAppWindow } from '../../src/lib/matching';
import {
  DROP,
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
  findButtonId,
  messageLog,
  riderStep,
  seedDriver,
  seedRider,
  setupMockSendMessage,
  templateLog,
  truncateAll,
} from '../engine';

beforeAll(async () => {
  setupMockSendMessage();
  await truncateAll();
});
beforeEach(async () => {
  messageLog.length = 0;
  templateLog.length = 0;
  await truncateAll();
});
afterAll(async () => {
  await truncateAll();
});

async function bookNow(): Promise<void> {
  await riderStep({ text: 'auto' });
  await riderStep({ location: PICKUP });
  await riderStep({ location: DROP });
  await riderStep({ text: 'book_now' });
}

const TWO_DAYS_AGO = new Date(Date.now() - 48 * 3600_000).toISOString();

describe('the 24h WhatsApp window', () => {
  it('treats a recent reply as inside the window, an old one as outside', () => {
    expect(inWhatsAppWindow(new Date().toISOString())).toBe(true);
    expect(inWhatsAppWindow(TWO_DAYS_AGO)).toBe(false);
    expect(inWhatsAppWindow(null)).toBe(false);
    expect(inWhatsAppWindow(undefined)).toBe(false);
  });
});

describe('lead delivery to an idle driver', () => {
  it('sends a template, not an interactive, when the driver has not replied in 24h', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      lastReplyAt: TWO_DAYS_AGO,
      language: 'english',
    });
    await bookNow();

    expect(templateLog).toHaveLength(1);
    expect(templateLog[0].to).toBe(DRIVER_A_PHONE);
    expect(templateLog[0].languageCode).toBe('en');

    // No free-form lead went to him - it would have been dropped by Meta.
    const leadButtons = messageLog.filter(
      (m) => m.to === DRIVER_A_PHONE && m.msg.kind === 'buttons',
    );
    expect(leadButtons).toHaveLength(0);
  }, 60000);

  it('uses Kannada locale for a Kannada driver', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      lastReplyAt: TWO_DAYS_AGO,
      language: 'kannada',
    });
    await bookNow();

    expect(templateLog[0].languageCode).toBe('kn');
  }, 60000);

  it('passes pickup, drop, distance and time as body parameters', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      lastReplyAt: TWO_DAYS_AGO,
      language: 'english',
    });
    await bookNow();

    const body = templateLog[0].components[0] as {
      parameters: Array<{ text: string }>;
    };
    expect(body.parameters).toHaveLength(4);
    // The copy must tell him how to answer, since there is no Quote button.
    expect(body.parameters[0].text).toBeTruthy();
    expect(body.parameters[3].text).toBeTruthy();
  }, 60000);

  it('still sends the interactive lead when the driver replied recently', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      lastReplyAt: new Date().toISOString(),
    });
    await bookNow();

    expect(templateLog).toHaveLength(0);
    expect(findButtonId('quote_', DRIVER_A_PHONE)).toBeTruthy();
  }, 60000);

  it('records the channel and wamid on the dispatch', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      lastReplyAt: TWO_DAYS_AGO,
    });
    await bookNow();

    const { data } = await supabaseAdmin
      .from('lead_dispatches')
      .select('channel, template_name, wamid')
      .eq('driver_id', (await driverIdOf(DRIVER_A_PHONE)) as string);
    const row = (data ?? [])[0] as
      | { channel: string; template_name: string | null; wamid: string | null }
      | undefined;

    expect(row?.channel).toBe('template');
    expect(row?.template_name).toBeTruthy();
    expect(row?.wamid).toBeTruthy();
  }, 60000);

  it('a bare-number reply after the template creates a quote', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, {
      lat: PICKUP.lat,
      lng: PICKUP.lng,
      radiusKm: 5,
      lastReplyAt: TWO_DAYS_AGO,
    });
    const tripId = await tripIdAfterBooking();

    await driverStep(DRIVER_A_PHONE, { text: '70' });

    const { data: quotes } = await supabaseAdmin
      .from('quotes')
      .select('amount_paise, status')
      .eq('trip_id', tripId);
    expect((quotes ?? [])[0]).toMatchObject({ amount_paise: 7000, status: 'pending' });
  }, 60000);
});

async function driverIdOf(phone: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('drivers')
    .select('id')
    .eq('phone', phone)
    .single();
  return (data as { id: string }).id;
}

async function tripIdAfterBooking(): Promise<string> {
  await bookNow();
  const { data } = await supabaseAdmin
    .from('trips')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  const id = (data as { id: string }).id;
  expect(await getTrip(id)).toBeTruthy();
  return id;
}
