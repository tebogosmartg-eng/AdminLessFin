/**
 * Date engine. Every date is a calendar date ('YYYY-MM-DD') in
 * Africa/Johannesburg. Arithmetic is done on UTC midnights so no host time
 * zone or daylight-saving rule can move a date.
 */

export const COMPLIANCE_TIME_ZONE = 'Africa/Johannesburg';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function parts(iso: string): [number, number, number] {
  if (!isIsoDate(iso)) throw new Error(`Not a calendar date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toUtc(iso: string): number {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d);
}

export function makeDate(year: number, month: number, day: number): string {
  return fromUtc(Date.UTC(year, month - 1, day));
}

/** Today's date in Johannesburg for the given instant. */
export function todayInJohannesburg(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPLIANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * 86_400_000);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLastDayOfMonth(iso: string): boolean {
  const [y, m, d] = parts(iso);
  return d === daysInMonth(y, m);
}

/**
 * Adds calendar months. A month-end anchor stays a month-end (28 Feb + 6
 * months = 31 Aug), and a day that does not exist in the target month is
 * clamped (31 Jan + 1 month = 28/29 Feb).
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const dim = daysInMonth(ty, tm);
  const day = isLastDayOfMonth(iso) ? dim : Math.min(d, dim);
  return makeDate(ty, tm, day);
}

/** The date's anniversary in `year`; 29 February becomes 28 February. */
export function anniversaryIn(iso: string, year: number): string {
  const [, m, d] = parts(iso);
  return makeDate(year, m, Math.min(d, daysInMonth(year, m)));
}

export function yearOf(iso: string): number {
  return parts(iso)[0];
}

export function monthOf(iso: string): number {
  return parts(iso)[1];
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

export type HolidayCalendar = ReadonlySet<string>;

export function isBusinessDay(iso: string, holidays: HolidayCalendar): boolean {
  const wd = weekday(iso);
  return wd !== 0 && wd !== 6 && !holidays.has(iso);
}

/**
 * The date that is `n` business days after `iso` (the start date itself is
 * day 0 and is never counted).
 */
export function addBusinessDays(iso: string, n: number, holidays: HolidayCalendar): string {
  if (n < 0) throw new Error('addBusinessDays counts forward only.');
  let current = iso;
  let counted = 0;
  while (counted < n) {
    current = addDays(current, 1);
    if (isBusinessDay(current, holidays)) counted += 1;
  }
  return current;
}

export function adjustToBusinessDay(
  iso: string,
  adjust: 'none' | 'previous_business_day' | 'next_business_day',
  holidays: HolidayCalendar,
): string {
  if (adjust === 'none') return iso;
  const step = adjust === 'previous_business_day' ? -1 : 1;
  let current = iso;
  for (let guard = 0; guard < 15 && !isBusinessDay(current, holidays); guard++) {
    current = addDays(current, step);
  }
  return current;
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
