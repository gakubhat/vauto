import { supabaseAdmin } from '../supabase/client';

/**
 * The kyc bucket is private, so its public URLs return 400. Anything that
 * displays a document to office staff must use a signed URL instead.
 */
export function objectPathFromUrl(url: string | null, bucket: string): string | null {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  if (url.includes(marker)) return decodeURIComponent(url.split(marker)[1]);
  // Already a path, or a signed URL we cannot parse.
  if (url.startsWith('http')) return null;
  return url;
}

export async function signedUrl(
  url: string | null,
  bucket: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!url) return null;
  const path = objectPathFromUrl(url, bucket);
  if (!path) return url;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    console.error('[SIGNED URL ERROR]', bucket, path, error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function removeObject(url: string | null, bucket: string): Promise<void> {
  const path = objectPathFromUrl(url, bucket);
  if (!path) return;
  const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
  if (error) console.error('[STORAGE DELETE ERROR]', bucket, path, error.message);
}
