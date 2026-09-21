/** Phones are stored as E.164 (+91...) everywhere. */

export function normalizePhone(raw: string): string {
  let p = (raw ?? '').trim().replace(/[\s\-()]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (!p.startsWith('+')) {
    // WhatsApp sends international format without the plus for Indian numbers.
    p = p.startsWith('91') && p.length === 12 ? `+${p}` : `+${p}`;
  }
  return p;
}

export function isIndianMobile(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone);
}

/** Last 4 digits, for displaying "your auto +91...1234". */
export function tail(phone: string): string {
  return phone.slice(-4);
}
