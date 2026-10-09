import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../../src/supabase/client';
import {
  addKycDocument,
  kycExtension,
  requestKycDocuments,
  validateKycImage,
} from '../../src/lib/kyc';
import { getDriverById } from '../../src/state/queries';
import { resetSession } from '../../src/state/store';
import {
  DRIVER_A_PHONE,
  driverStep,
  findButtonId,
  messageLog,
  seedDriver,
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

/** Pretend storage stored the object; returns the path it was given. */
const fakeUpload = async (path: string): Promise<string> => path;

describe('kyc image validation', () => {
  it('names the types it accepts and rejects the rest', () => {
    expect(kycExtension('image/jpeg')).toBe('jpg');
    expect(kycExtension('image/png')).toBe('png');
    expect(validateKycImage(Buffer.from([1]), 'image/gif')).toMatch(/unsupported/);
    expect(validateKycImage(Buffer.alloc(0), 'image/jpeg')).toMatch(/empty/);
    expect(validateKycImage(Buffer.from([1]), 'image/jpeg')).toBeNull();
  });
});

describe('office uploads a document the driver skipped', () => {
  it('stores the uploaded path on the driver row', async () => {
    const id = await seedDriver(DRIVER_A_PHONE, { approved: false });
    const res = await addKycDocument(id, 'selfie', Buffer.from('fake-image'), 'image/jpeg', fakeUpload);
    expect(res.ok).toBe(true);
    expect((await getDriverById(id))?.kyc_selfie_url).toBeTruthy();
  }, 60000);

  it('rejects an unknown slot, a wrong type and an empty body', async () => {
    const id = await seedDriver(DRIVER_A_PHONE, { approved: false });
    expect((await addKycDocument(id, 'passport', Buffer.from([1]), 'image/jpeg', fakeUpload)).ok).toBe(false);
    expect((await addKycDocument(id, 'selfie', Buffer.from([1]), 'application/pdf', fakeUpload)).ok).toBe(false);
    expect((await addKycDocument(id, 'selfie', Buffer.alloc(0), 'image/jpeg', fakeUpload)).ok).toBe(false);
  }, 60000);
});

describe('office asks the driver to re-send', () => {
  it('re-opens the KYC step and prompts on WhatsApp inside the window', async () => {
    const id = await seedDriver(DRIVER_A_PHONE, {
      approved: false,
      lastReplyAt: new Date().toISOString(),
    });
    const res = await requestKycDocuments(id);
    expect(res.ok).toBe(true);
    expect((await stateOf(DRIVER_A_PHONE))?.state).toBe('awaiting_kyc_aadhaar_front');
    expect(findButtonId('skip_kyc', DRIVER_A_PHONE)).toBeTruthy();
  }, 60000);

  it('refuses outside the 24h window', async () => {
    const id = await seedDriver(DRIVER_A_PHONE, { approved: false, lastReplyAt: null });
    const res = await requestKycDocuments(id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  }, 60000);

  it('refuses for an already-approved driver', async () => {
    const id = await seedDriver(DRIVER_A_PHONE, { approved: true });
    const res = await requestKycDocuments(id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  }, 60000);
});

describe('a re-send never erases a document already on file', () => {
  it('keeps the office upload when the driver skips that step', async () => {
    const id = await seedDriver(DRIVER_A_PHONE, {
      approved: false,
      lastReplyAt: new Date().toISOString(),
    });
    await supabaseAdmin
      .from('drivers')
      .update({ kyc_selfie_url: 'office-upload.jpg' })
      .eq('id', id);

    // Put the driver at the final KYC step and have them skip it.
    await resetSession(DRIVER_A_PHONE, { state: 'awaiting_kyc_selfie', role: 'driver' });
    await driverStep(DRIVER_A_PHONE, { text: 'skip_kyc' });

    expect((await getDriverById(id))?.kyc_selfie_url).toBe('office-upload.jpg');
    expect((await getDriverById(id))?.approval_status).toBe('pending');
  }, 60000);
});
