import { useState } from 'react';

/**
 * KYC documents live in a private bucket, so they are only reachable via a
 * signed URL that expires. A plain <img> fails silently to a broken icon, so
 * handle the error and tell the operator what to do instead.
 */
export function KycImage({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src) return null;

  if (failed) {
    return (
      <span className="badge bad" style={{ marginRight: 8 }}>
        {alt}: could not load. Reload the page for a fresh link.
      </span>
    );
  }

  return (
    <img
      className="kyc"
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ cursor: 'pointer' }}
      onClick={() => window.open(src, '_blank')}
    />
  );
}
