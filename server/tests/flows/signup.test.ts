import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import {
  DRIVER_A_PHONE,
  PICKUP,
  RIDER_PHONE,
  driverStep,
  messageLog,
  riderStep,
  setupMockSendMessage,
  startAsNewDriver,
  startAsNewRider,
  stateOf,
  truncateAll,
} from '../engine';

const NEW_RIDER = '+919999000011';
const NEW_DRIVER = '+919999000012';

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

describe('signup', () => {
  it('asks only for a name, then offers a Book button', async () => {
    await startAsNewRider(NEW_RIDER);
    const { handleRiderMessage } = await import('../../src/state/flows/rider');

    await handleRiderMessage(NEW_RIDER, { text: 'Sita' });

    // No home-location step - straight to idle.
    expect((await stateOf(NEW_RIDER))?.state).toBe('idle');

    const last = messageLog.filter((m) => m.to === NEW_RIDER).slice(-1)[0];
    expect(last.msg.kind).toBe('buttons');
    // A brand-new rider defaults to Kannada before choosing a language.
    expect((last.msg as { body: string }).body).toContain('ಆಟೋ');
    const ids = (last.msg as { buttons: Array<{ id: string }> }).buttons.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['book_auto', 'help', 'language']));

    const { data } = await supabaseAdmin.from('riders').select('*').eq('phone', NEW_RIDER).single();
    expect((data as { name: string } | null)?.name).toBe('Sita');
  }, 60000);

  it('starts a booking from the Book button', async () => {
    await startAsNewRider(NEW_RIDER);
    const { handleRiderMessage } = await import('../../src/state/flows/rider');
    await handleRiderMessage(NEW_RIDER, { text: 'Sita' });

    await handleRiderMessage(NEW_RIDER, { text: 'book_auto' });
    expect((await stateOf(NEW_RIDER))?.state).toBe('awaiting_pickup_location');
  }, 60000);

  it('shows the menu on hi instead of starting a booking', async () => {
    await startAsNewRider(NEW_RIDER);
    const { handleRiderMessage } = await import('../../src/state/flows/rider');
    await handleRiderMessage(NEW_RIDER, { text: 'Sita' });
    messageLog.length = 0;

    await handleRiderMessage(NEW_RIDER, { text: 'hi' });

    expect((await stateOf(NEW_RIDER))?.state).toBe('idle');
    const last = messageLog.filter((m) => m.to === NEW_RIDER).slice(-1)[0];
    expect(last.msg.kind).toBe('buttons');
    const ids = (last.msg as { buttons: Array<{ id: string }> }).buttons.map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(['book_auto', 'help', 'language']));
  }, 60000);

  it('rejects text where a pickup location is expected, and explains why', async () => {
    await startAsNewRider(NEW_RIDER);
    const { handleRiderMessage } = await import('../../src/state/flows/rider');
    await handleRiderMessage(NEW_RIDER, { text: 'Sita' });
    await handleRiderMessage(NEW_RIDER, { text: 'book_auto' });

    const locReq = (): string => {
      const m = [...messageLog]
        .reverse()
        .find((x) => x.to === NEW_RIDER && x.msg.kind === 'location_request');
      return (m?.msg as { body: string } | undefined)?.body ?? '';
    };
    const first = locReq();

    await handleRiderMessage(NEW_RIDER, { text: 'bus stand' });

    // Matching runs on coordinates, so a typed pickup must never advance.
    expect((await stateOf(NEW_RIDER))?.state).toBe('awaiting_pickup_location');
    // The re-prompt is deliberately different from the first, so it does not
    // read as "the bot did not hear me".
    expect(locReq()).not.toBe(first);
    expect(locReq().length).toBeGreaterThan(0);

    // And offers a way out.
    const sent = messageLog.filter((m) => m.to === NEW_RIDER);
    const last = sent[sent.length - 1].msg as { buttons?: Array<{ id: string }> };
    expect(last.buttons?.map((b) => b.id)).toEqual(expect.arrayContaining(['cancel_booking']));

    await handleRiderMessage(NEW_RIDER, { text: 'cancel_booking' });
    expect((await stateOf(NEW_RIDER))?.state).toBe('idle');
  }, 60000);

  it('offers a typed-destination option at the drop step', async () => {
    await startAsNewRider(NEW_RIDER);
    const { handleRiderMessage } = await import('../../src/state/flows/rider');
    await handleRiderMessage(NEW_RIDER, { text: 'Sita' });
    await handleRiderMessage(NEW_RIDER, { text: 'book_auto' });
    await handleRiderMessage(NEW_RIDER, { location: PICKUP });

    // Two bubbles: the map picker, then type-it / cancel options.
    const sent = messageLog.filter((m) => m.to === NEW_RIDER);
    const opts = sent[sent.length - 1].msg as { buttons?: Array<{ id: string }> };
    expect(opts.buttons?.map((b) => b.id)).toEqual(
      expect.arrayContaining(['type_drop', 'cancel_booking']),
    );

    await handleRiderMessage(NEW_RIDER, { text: 'type_drop' });
    expect((await stateOf(NEW_RIDER))?.state).toBe('awaiting_drop_location');
    const typed = messageLog.filter((m) => m.to === NEW_RIDER).slice(-1)[0].msg;
    expect(typed.kind).toBe('text');

    // Typing the area then advances, as before.
    await handleRiderMessage(NEW_RIDER, { text: 'bus stand' });
    expect((await stateOf(NEW_RIDER))?.state).toBe('awaiting_trip_confirm');
  }, 60000);

  it('walks a driver through signup and KYC, ending pending approval', async () => {
    await startAsNewDriver(NEW_DRIVER);

    await driverStep(NEW_DRIVER, { text: 'Ramesh' });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('awaiting_vehicle_number');

    await driverStep(NEW_DRIVER, { text: 'KA-05-1234' });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('awaiting_base_location');

    await driverStep(NEW_DRIVER, { location: PICKUP });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('awaiting_radius');

    await driverStep(NEW_DRIVER, { text: 'radius_5' });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('awaiting_kyc_aadhaar_front');

    await driverStep(NEW_DRIVER, { imageUrl: 'https://example.com/front.jpg' });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('awaiting_kyc_aadhaar_back');

    await driverStep(NEW_DRIVER, { imageUrl: 'https://example.com/back.jpg' });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('awaiting_kyc_selfie');

    await driverStep(NEW_DRIVER, { imageUrl: 'https://example.com/selfie.jpg' });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('idle');

    const { data } = await supabaseAdmin.from('drivers').select('*').eq('phone', NEW_DRIVER).single();
    const d = data as Record<string, unknown> | null;
    expect(d?.name).toBe('Ramesh');
    expect(d?.vehicle_no).toBe('KA-05-1234');
    expect(d?.radius_km).toBe(5);
    expect(d?.kyc_aadhaar_url).toBe('https://example.com/front.jpg');
    expect(d?.kyc_aadhaar_back_url).toBe('https://example.com/back.jpg');
    expect(d?.kyc_selfie_url).toBe('https://example.com/selfie.jpg');
    expect(d?.approval_status).toBe('pending');
  }, 60000);

  it('rejects text where a KYC image is expected', async () => {
    await startAsNewDriver(NEW_DRIVER);
    await driverStep(NEW_DRIVER, { text: 'Ramesh' });
    await driverStep(NEW_DRIVER, { text: 'KA-05-1234' });
    await driverStep(NEW_DRIVER, { location: PICKUP });
    await driverStep(NEW_DRIVER, { text: 'radius_5' });

    await driverStep(NEW_DRIVER, { text: 'here is my aadhaar' });
    expect((await stateOf(NEW_DRIVER))?.state).toBe('awaiting_kyc_aadhaar_front');
  }, 60000);

  it('rejects text where a driver base location is expected', async () => {
    await startAsNewDriver(NEW_DRIVER);
    await driverStep(NEW_DRIVER, { text: 'Ramesh' });
    await driverStep(NEW_DRIVER, { text: 'KA-05-1234' });

    await driverStep(NEW_DRIVER, { text: 'bus stand' });

    // A bare area name would leave the driver silently out of every lead.
    expect((await stateOf(NEW_DRIVER))?.state).toBe('awaiting_base_location');
    const last = messageLog.filter((m) => m.to === NEW_DRIVER).slice(-1)[0];
    expect(last.msg.kind).toBe('location_request');
  }, 60000);

  it('lets a driver skip every KYC step', async () => {
    await startAsNewDriver(NEW_DRIVER);
    await driverStep(NEW_DRIVER, { text: 'Ramesh' });
    await driverStep(NEW_DRIVER, { text: 'KA-05-1234' });
    await driverStep(NEW_DRIVER, { location: PICKUP });
    await driverStep(NEW_DRIVER, { text: 'radius_5' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });

    expect((await stateOf(NEW_DRIVER))?.state).toBe('idle');
    const { data } = await supabaseAdmin.from('drivers').select('*').eq('phone', NEW_DRIVER).single();
    expect((data as { approval_status: string } | null)?.approval_status).toBe('pending');
  }, 60000);

  it('tells a pending driver they are not verified yet', async () => {
    await startAsNewDriver(NEW_DRIVER);
    await driverStep(NEW_DRIVER, { text: 'Ramesh' });
    await driverStep(NEW_DRIVER, { text: 'KA-05-1234' });
    await driverStep(NEW_DRIVER, { location: PICKUP });
    await driverStep(NEW_DRIVER, { text: 'radius_5' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });
    await driverStep(NEW_DRIVER, { text: 'skip_kyc' });

    const before = messageLog.length;
    await driverStep(NEW_DRIVER, { text: '70' });
    const sent = messageLog.slice(before).filter((m) => m.to === NEW_DRIVER);

    // Told why, in Kannada (drivers default to Kannada), and no quote created.
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.some((m) => m.msg.kind === 'text' && m.msg.body.includes('ಪರಿಶೀಲನೆ'))).toBe(true);

    const { data: quotes } = await supabaseAdmin.from('quotes').select('id');
    expect(quotes?.length ?? 0).toBe(0);
  }, 60000);
});
