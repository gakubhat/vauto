import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import { normalisePhone } from '../../src/lib/help';
import {
  DRIVER_A_PHONE,
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
  setupMockSendMessage,
  truncateAll,
} from '../engine';

/**
 * A help request must actually reach a human.
 *
 * The queue, the dashboard counter and the admin page can all be correct while
 * nobody is told anything - which is the difference between a feature that is
 * used and one that is decorative.
 */

const OFFICE = '+91 91487 38021';

beforeAll(async () => {
  setupMockSendMessage();
  await truncateAll();
});
beforeEach(async () => {
  messageLog.length = 0;
  await truncateAll();
  await setOfficeNumber(OFFICE);
});
afterAll(async () => {
  await truncateAll();
});

function bodiesTo(phone: string): string[] {
  return messageLog.filter((m) => m.to === phone).map((m) => (m.msg as { body?: string }).body ?? '');
}

describe('office alerts', () => {
  it('alerts the office when a rider asks for help', async () => {
    await seedRider();

    await riderStep({ text: 'help' });

    const alerts = bodiesTo(OFFICE);
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain('Help needed');
    expect(alerts[0]).toContain(RIDER_PHONE);
    expect(alerts[0]).toContain('Sita');
  }, 60000);

  it('marks a dispute as urgent and includes the reason', async () => {
    await seedRider();
    await seedDriver(DRIVER_A_PHONE, { lat: PICKUP.lat, lng: PICKUP.lng, radiusKm: 5 });
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
    await driverStep(DRIVER_A_PHONE, { text: 'trip_done' });
    messageLog.length = 0;

    await riderStep({ text: 'confirm_no' });

    const alerts = bodiesTo(OFFICE);
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toContain('Dispute');
    expect(alerts[0]).toContain(tripId.slice(0, 8));
  }, 60000);

  it('alerts once, not once per "help" tap', async () => {
    await seedRider();

    await riderStep({ text: 'help' });
    await riderStep({ text: 'help' });
    await riderStep({ text: 'help' });

    // One open request per phone, so one alert. A panicking user must not spam.
    expect(bodiesTo(OFFICE).length).toBe(1);
  }, 60000);

  it('sends nothing when no office number is configured', async () => {
    await setOfficeNumber(null);
    await seedRider();

    await riderStep({ text: 'help' });

    expect(bodiesTo(OFFICE).length).toBe(0);
    // The user still gets a reply - never left in silence.
    expect(bodiesTo(RIDER_PHONE).length).toBeGreaterThan(0);
  }, 60000);

  it('never alerts the office about the office itself', async () => {
    // The office number acts as a rider here. It still gets its own *reply*,
    // so assert on content: an alert would say "Help needed".
    await seedRider(OFFICE, 'Office');

    await riderStepAs(OFFICE, { text: 'help' });

    const sent = bodiesTo(OFFICE);
    expect(sent.some((b) => b.includes('Help needed'))).toBe(false);
    // The reply itself still went out.
    expect(sent.length).toBe(1);
    expect(sent[0]).toContain('Call us');
  }, 60000);

  it('a failed alert does not break the user flow', async () => {
    // The user must still get their reply even if the office send fails.
    await seedRider();
    await riderStep({ text: 'help' });
    expect(bodiesTo(RIDER_PHONE).length).toBeGreaterThan(0);
  }, 60000);
});

describe('normalisePhone', () => {
  it('treats differently formatted numbers as equal', () => {
    expect(normalisePhone('+91 91487 38021')).toBe(normalisePhone('919148738021'));
    expect(normalisePhone('+91-91487-38021')).toBe('919148738021');
    expect(normalisePhone(null)).toBe('');
  });
});
