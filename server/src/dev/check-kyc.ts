#!/usr/bin/env node
/**
 * Proves the KYC image path works end to end:
 *   uploads a throwaway file -> signs it -> fetches the signed URL -> cleans up
 *
 * The kyc bucket is private, so a plain public URL returns 400. If this script
 * reports anything other than 200, office staff will see broken images.
 *
 *   cd server && npm run check:kyc
 */
import { config } from '../config';
import { supabaseAdmin } from '../supabase/client';
import { signedUrl } from '../lib/storage';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

async function main(): Promise<void> {
  const bucket = config.storageBucketKyc;
  const path = `__selftest/${Date.now()}.png`;
  console.log(`bucket : ${bucket}`);

  const { error: upErr } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, PNG, { contentType: 'image/png' });

  if (upErr) {
    console.log(`UPLOAD FAILED: ${upErr.message}`);
    console.log('Check the bucket exists and the service role key has storage access.');
    process.exit(1);
  }
  console.log('upload : ok');

  const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  const publicRes = await fetch(pub.publicUrl).catch(() => null);
  console.log(`public url status : ${publicRes?.status ?? 'fetch failed'} (expected 400 - bucket is private)`);

  const signed = await signedUrl(pub.publicUrl, bucket, 3600);
  if (!signed) {
    console.log('SIGNING FAILED');
    await supabaseAdmin.storage.from(bucket).remove([path]);
    process.exit(1);
  }
  const signedRes = await fetch(signed).catch(() => null);
  console.log(`signed url status : ${signedRes?.status ?? 'fetch failed'} (expected 200)`);

  await supabaseAdmin.storage.from(bucket).remove([path]);
  console.log('cleanup: ok');

  if (signedRes?.status === 200) {
    console.log('\nKYC image path is working.');
    return;
  }
  console.log('\nKYC images will NOT load in the admin. Investigate before onboarding drivers.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
