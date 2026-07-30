/**
 * RB-002 REGRESSION VAULT — date formatting must never throw on malformed input,
 * and the raw `format(new Date(...))` class must not spread.
 *
 * Root cause: `format(new Date(x))` throws `RangeError: Invalid time value` for a
 * malformed-but-truthy value; presence guards (`x ? ... : '—'`) don't help.
 *
 * Two protections:
 *  1. Unit-prove the safe helpers return a fallback instead of throwing.
 *  2. A RATCHET: the count of raw `format(new Date(` / `formatDistanceToNow(new
 *     Date(` under src/ must never exceed the locked baseline. New code must use
 *     the safe helpers; each legacy migration lowers the baseline. The count can
 *     only go DOWN.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { safeFormatDate, safeFormatDistanceToNow, toValidDate } from '../../src/lib/dates';

const POISON = ['2026-02-30', '2026-13-99', '0000-00-00', 'not-a-date', '', null, undefined];

describe('RB-002 — safe date helpers never throw', () => {
  it('safeFormatDate returns fallback for every malformed value', () => {
    for (const v of POISON) {
      expect(() => safeFormatDate(v, 'dd MMM yyyy')).not.toThrow();
      expect(safeFormatDate(v, 'dd MMM yyyy')).toBe('—');
    }
  });

  it('safeFormatDate formats valid values', () => {
    expect(safeFormatDate('2026-03-01', 'yyyy-MM-dd')).toBe('2026-03-01');
    expect(safeFormatDate(new Date(2026, 2, 1), 'yyyy-MM-dd')).toBe('2026-03-01');
  });

  it('safeFormatDistanceToNow returns fallback for malformed values and never throws', () => {
    for (const v of POISON) {
      expect(() => safeFormatDistanceToNow(v, { addSuffix: true })).not.toThrow();
      expect(safeFormatDistanceToNow(v, { addSuffix: true })).toBe('—');
    }
  });

  it('toValidDate returns null for garbage and a Date for valid input', () => {
    expect(toValidDate('2026-02-30')).toBeNull();
    expect(toValidDate('2026-03-01')).toBeInstanceOf(Date);
  });
});

// --- Ratchet -------------------------------------------------------------
const SRC = resolve(__dirname, '../../src');
// Locked baselines (excluding the helper's own docstring). LOWER these as sites
// migrate to safeFormatDate/safeFormatDistanceToNow. NEVER raise them.
const BASELINE_FORMAT = 178;
const BASELINE_DISTANCE = 6;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry) && !p.includes('dates.ts')) out.push(p);
  }
  return out;
}

function countMatches(re: RegExp): number {
  let n = 0;
  for (const f of walk(SRC)) n += (readFileSync(f, 'utf8').match(re) ?? []).length;
  return n;
}

describe('RB-002 — raw date-format ratchet (count may only decrease)', () => {
  it(`has no more than ${BASELINE_FORMAT} raw format(new Date( sites`, () => {
    expect(countMatches(/format\(new Date\(/g)).toBeLessThanOrEqual(BASELINE_FORMAT);
  });

  it(`has no more than ${BASELINE_DISTANCE} raw formatDistanceToNow(new Date( sites`, () => {
    expect(countMatches(/formatDistanceToNow\(new Date\(/g)).toBeLessThanOrEqual(BASELINE_DISTANCE);
  });
});
