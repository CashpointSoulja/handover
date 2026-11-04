// Calendar helpers on YYYY-MM-DD strings, in UTC so results never depend on the host clock or zone.

const MS_DAY = 86_400_000;

export function toDay(date: string): number {
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / MS_DAY;
}

export function daysBetween(from: string, to: string): number {
  return toDay(to.slice(0, 10)) - toDay(from.slice(0, 10));
}

export function addDays(date: string, days: number): string {
  return new Date((toDay(date) + days) * MS_DAY).toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const y = +date.slice(0, 4);
  const m = +date.slice(5, 7) - 1 + months;
  const day = +date.slice(8, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "28 Oct" */
export function shortDate(date: string): string {
  return `${+date.slice(8, 10)} ${MONTHS[+date.slice(5, 7) - 1]}`;
}
