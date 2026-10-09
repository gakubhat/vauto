import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { supabaseAdmin } from '../supabase/client';
import { getDriverById } from '../state/queries';
import { resetSession } from '../state/store';
import { send } from './send';
import { inWhatsAppWindow } from './matching';
import { removeObject } from './storage';
import { langOf } from '../whatsapp/i18n';
import * as tpl from '../whatsapp/templates';

/**
 * Office-side KYC recovery.
 *
 * A driver may skip any of the three signup photos, which leaves the matching
 * column null and the driver unable to be verified. The office can then either
 * upload a document it holds, or ask the driver to send it again over WhatsApp.
 */

/** Upload slot -> drivers column. */
export const KYC_SLOTS: Record<string, string> = {
  aadhaar_front: 'kyc_aadhaar_url',
  aadhaar_back: 'kyc_aadhaar_back_url',
  selfie: 'kyc_selfie_url',
};

const MAX_BYTES = 5 * 1024 * 1024;

/** Extension for an accepted image type, or null when it is not accepted. */
export function kycExtension(mimeType: string): string | null {
  if (/^image\/jpe?g$/i.test(mimeType)) return 'jpg';
  if (/^image\/png$/i.test(mimeType)) return 'png';
  if (/^image\/webp$/i.test(mimeType)) return 'webp';
  if (/^image\/hei[cf]$/i.test(mimeType)) return 'heic';
  return null;
}

/** An error string when the image is unusable, or null when it is fine. */
export function validateKycImage(buffer: Buffer, mimeType: string): string | null {
  if (buffer.byteLength === 0) return 'the image is empty';
  if (buffer.byteLength > MAX_BYTES) return 'the image is larger than 5 MB';
  if (!kycExtension(mimeType)) return `unsupported image type ${mimeType || '(none)'}`;
  return null;
}

export type KycUploader = (path: string, buffer: Buffer, mimeType: string) => Promise<string | null>;

/** Store the object in the private kyc bucket; returns its path, or null. */
const storeInKyc: KycUploader = async (path, buffer, mimeType) => {
  const { error } = await supabaseAdmin.storage
    .from(config.storageBucketKyc)
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  return error ? null : path;
};

export type KycResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Add (or replace) one KYC document.
 *
 * `upload` is injectable so the flow is testable without real storage; the
 * route never passes it.
 */
export async function addKycDocument(
  driverId: string,
  slot: string,
  buffer: Buffer,
  mimeType: string,
  upload: KycUploader = storeInKyc,
): Promise<KycResult> {
  const column = KYC_SLOTS[slot];
  if (!column) {
    return { ok: false, status: 400, error: 'slot must be aadhaar_front, aadhaar_back or selfie' };
  }
  const invalid = validateKycImage(buffer, mimeType);
  if (invalid) return { ok: false, status: 400, error: invalid };

  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('*')
    .eq('id', driverId)
    .maybeSingle();
  if (!driver) return { ok: false, status: 404, error: 'Not found' };

  const stored = await upload(`${uuid()}.${kycExtension(mimeType) as string}`, buffer, mimeType);
  if (!stored) return { ok: false, status: 400, error: 'storage upload failed' };

  const previous = (driver as Record<string, unknown>)[column] as string | null;
  const patch: Record<string, unknown> = { [column]: stored };
  const { error } = await supabaseAdmin.from('drivers').update(patch).eq('id', driverId);
  if (error) {
    // Never leave an orphan behind when the row could not be updated.
    await removeObject(stored, config.storageBucketKyc);
    return { ok: false, status: 400, error: error.message };
  }
  // Replace, don't orphan: drop the file the row no longer points at.
  if (previous && previous !== stored) await removeObject(previous, config.storageBucketKyc);
  return { ok: true };
}

/**
 * Ask a driver to (re)send their documents over WhatsApp.
 *
 * Only possible inside the 24h window: a free-form message outside it is
 * rejected by Meta, and there is no registered "send your documents" template.
 * The office can always upload the documents instead.
 */
export async function requestKycDocuments(driverId: string): Promise<KycResult> {
  const driver = await getDriverById(driverId);
  if (!driver) return { ok: false, status: 404, error: 'Not found' };
  if (driver.approval_status === 'approved') {
    return {
      ok: false,
      status: 400,
      error: 'Driver is already approved. Suspend first if documents must be re-collected.',
    };
  }
  if (!inWhatsAppWindow(driver.last_reply_at)) {
    return {
      ok: false,
      status: 409,
      error: "Outside WhatsApp's 24h window - the driver must message us first, or upload the documents instead.",
    };
  }

  const lang = langOf(driver.preferred_language);
  // Full reset so a half-finished earlier attempt cannot leak into this one.
  await resetSession(driver.phone, { state: 'awaiting_kyc_aadhaar_front', role: 'driver' });
  await send(driver.phone, 'driver', tpl.kycPrompt(lang, 'front'), {
    sessionState: 'awaiting_kyc_aadhaar_front',
  });
  return { ok: true };
}
