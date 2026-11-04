// UK money formatting: pence only when they matter.

export function money(amount: number): string {
  const abs = Math.abs(amount);
  const pence = Math.round(abs * 100);
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;
}

/** Totals are rounded to whole pounds. */
export function moneyRounded(amount: number): string {
  return `£${Math.round(Math.abs(amount)).toLocaleString('en-GB')}`;
}

export function pence(amount: number): string {
  return String(Math.round(Math.abs(amount) * 100)).padStart(3, '0');
}
