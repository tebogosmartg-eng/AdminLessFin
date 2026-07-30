/**
 * RB-001 REGRESSION VAULT — Malformed date must never white-screen the app.
 *
 * Root cause: date-fns `parseISO` returns a *truthy* Invalid Date for malformed
 * strings, which the reporting provider passed straight into `format()`,
 * throwing `RangeError: Invalid time value` ABOVE every error boundary → the
 * entire application white-screened on every route, unrecoverably.
 *
 * Class-kill: every string→Date conversion at a reporting-authority boundary
 * must go through `parseIsoDateSafe`, which returns `null` (never a truthy
 * Invalid Date) for anything unparseable, so the provider's existing
 * truthiness guards hold and `format()` is never reached with garbage.
 *
 * If this test ever fails, the RB-001 class has regressed. Do not weaken it.
 */
import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { parseIsoDate, parseIsoDateSafe } from '../../src/lib/reportingPeriod/presets';

// The exact inputs proven to crash the app during the release-readiness audit.
const POISON = ['2026-02-30', '2026-13-99', '0000-00-00', 'not-a-date', ''];

describe('RB-001 — invalid-date trust boundary', () => {
  it('demonstrates the original defect: raw parseIsoDate yields a truthy Invalid Date that format() throws on', () => {
    // This is the buggy behaviour the fix routes around. Kept as living evidence.
    const invalid = parseIsoDate('2026-02-30');
    expect(invalid).toBeTruthy(); // truthy → old `!date` guard was a no-op
    expect(Number.isNaN(invalid.getTime())).toBe(true);
    expect(() => format(invalid, 'dd MMM yyyy')).toThrow(/Invalid time value/);
  });

  it('parseIsoDateSafe returns null for every malformed / empty value', () => {
    for (const iso of POISON) {
      expect(parseIsoDateSafe(iso), `expected null for ${JSON.stringify(iso)}`).toBeNull();
    }
    expect(parseIsoDateSafe(null)).toBeNull();
    expect(parseIsoDateSafe(undefined)).toBeNull();
  });

  it('parseIsoDateSafe still parses genuinely valid ISO dates', () => {
    const d = parseIsoDateSafe('2026-03-01');
    expect(d).not.toBeNull();
    expect(format(d as Date, 'yyyy-MM-dd')).toBe('2026-03-01');
  });

  it('the provider guard pattern (!date) is now safe for all poison inputs', () => {
    // Mirrors ReportingPeriodContext: `if (!financialYearStart) return null` then format().
    for (const iso of POISON) {
      const financialYearStart = parseIsoDateSafe(iso);
      const render = () => (!financialYearStart ? null : format(financialYearStart, 'dd MMM yyyy'));
      expect(render, `render must not throw for ${JSON.stringify(iso)}`).not.toThrow();
      expect(render()).toBeNull();
    }
  });
});
