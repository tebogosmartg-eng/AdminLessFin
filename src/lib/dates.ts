/**
 * Safe date formatting (RB-002).
 *
 * `format(new Date(x))` / `formatDistanceToNow(new Date(x))` throw
 * `RangeError: Invalid time value` when `x` is a malformed-but-truthy value
 * (bad row, import, malformed API). Presence guards like `x ? format(...) : '—'`
 * do NOT protect against this — only a validity check does. These helpers never
 * throw: they return a fallback for any unparseable input.
 *
 * New date rendering MUST use these instead of raw `format(new Date(...))`.
 */
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

/**
 * Coerce an unknown date-ish value to a valid Date, or null.
 * Strings are parsed as ISO via date-fns `parseISO` (which correctly rejects
 * impossible calendar dates like "2026-02-30" — native `new Date` may silently
 * roll them over). Dates and epoch numbers are validated directly.
 */
export function toValidDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === 'string') d = parseISO(value);
  else if (typeof value === 'number') d = new Date(value);
  else return null;
  return isValid(d) ? d : null;
}

/** Format a date value, returning `fallback` (default "—") for invalid input. */
export function safeFormatDate(value: unknown, fmt: string, fallback = '—'): string {
  const d = toValidDate(value);
  if (!d) return fallback;
  try {
    return format(d, fmt);
  } catch {
    return fallback;
  }
}

/** Relative-time format, returning `fallback` (default "—") for invalid input. */
export function safeFormatDistanceToNow(
  value: unknown,
  options?: { addSuffix?: boolean },
  fallback = '—',
): string {
  const d = toValidDate(value);
  if (!d) return fallback;
  try {
    return formatDistanceToNow(d, options);
  } catch {
    return fallback;
  }
}
