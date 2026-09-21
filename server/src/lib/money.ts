/** Money is integer paise everywhere. Never float. */

export type Paise = number;

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}

export function formatRupees(paise: Paise): string {
  const rupees = Math.round(paise / 100);
  return `Rs ${rupees}`;
}

/** Parse a driver's typed quote. Returns null if it is not a sane amount. */
export function parseAmount(text: string): Paise | null {
  const cleaned = (text ?? '').trim().replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  if (value < 10 || value > 10000) return null;
  return rupeesToPaise(value);
}
