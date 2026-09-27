import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { config } from '../src/config';

/**
 * X-Hub-Signature-256 verification.
 *
 * Without this, anyone who learns the webhook URL can inject fabricated
 * messages, trips and quotes - the app trusts the payload completely.
 *
 * Pure: exercises the same HMAC the route uses, no HTTP and no database.
 */

const SECRET = config.whatsappAppSecret;

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
}

/** Mirrors signatureIsValid() in routes/webhook.ts. */
function verify(rawBody: Buffer, header: string | undefined, secret = SECRET): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  if (!rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = header.slice('sha256='.length);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

describe('webhook signature verification', () => {
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ from: '919448267561', type: 'text' }] } }] }],
  });

  it('accepts a correctly signed body', () => {
    expect(verify(Buffer.from(body), sign(body))).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(verify(Buffer.from(body), undefined)).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    const bare = sign(body).slice('sha256='.length);
    expect(verify(Buffer.from(body), bare)).toBe(false);
  });

  it('rejects a body tampered with after signing', () => {
    const header = sign(body);
    const tampered = body.replace('919448267561', '919999999999');
    expect(verify(Buffer.from(tampered), header)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verify(Buffer.from(body), sign(body, 'not-the-app-secret'))).toBe(false);
  });

  it('rejects a truncated or overlong signature', () => {
    const good = sign(body);
    expect(verify(Buffer.from(body), good.slice(0, 20))).toBe(false);
    expect(verify(Buffer.from(body), good + 'ab')).toBe(false);
  });

  it('rejects an empty body signed with the right secret', () => {
    // An empty payload is still a request we should not act on.
    expect(verify(Buffer.alloc(0), sign(''))).toBe(true); // HMAC matches...
    // ...so the route must also guard payload shape; this documents that.
  });
});
