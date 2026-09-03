import { describe, expect, it } from 'vitest';
import {
  asAtForPeriod,
  isCappedToToday,
  isoDay,
  ledgerStartForPeriod,
} from '../../src/lib/reportingPeriod/asAt';

/**
 * The age analysis takes its as-at date from the shared reporting period, so a
 * period whose closing date has not happened yet would otherwise age every open
 * document by the months in between. That failure is silent — the report still
 * renders, still totals, still reconciles — so it is pinned here.
 */
describe('as-at date for a point-in-time report', () => {
  const TODAY = '2026-09-03';

  it('uses the period end when the period has already closed', () => {
    // Previous month, previous quarter, a closed financial year: the report is
    // drawn up to the period end, which is what an auditor asks for.
    expect(asAtForPeriod('2026-08-31', TODAY)).toBe('2026-08-31');
    expect(asAtForPeriod('2026-02-28', TODAY)).toBe('2026-02-28');
  });

  it('caps at today when the period closes in the future', () => {
    // "Current Financial Year" on a March year-end runs to 28 Feb 2027.
    expect(asAtForPeriod('2027-02-28', TODAY)).toBe(TODAY);
    // And on a calendar with several open years, so can "Previous Financial
    // Year" — the live Spaceman calendar has FY2025, FY2026 and FY2027 all
    // open, which makes its "previous" year end 31 Dec 2026.
    expect(asAtForPeriod('2026-12-31', TODAY)).toBe(TODAY);
  });

  it('treats the period ending today as today', () => {
    expect(asAtForPeriod(TODAY, TODAY)).toBe(TODAY);
    expect(isCappedToToday(TODAY, TODAY)).toBe(false);
  });

  it('falls back to today when there is no period yet', () => {
    expect(asAtForPeriod(null, TODAY)).toBe(TODAY);
    expect(asAtForPeriod(undefined, TODAY)).toBe(TODAY);
    expect(isCappedToToday(null, TODAY)).toBe(false);
  });

  it('reports the cap only when one was applied', () => {
    expect(isCappedToToday('2027-02-28', TODAY)).toBe(true);
    expect(isCappedToToday('2026-08-31', TODAY)).toBe(false);
  });

  it('never returns a date in the future', () => {
    const ends = ['2026-01-01', TODAY, '2026-12-31', '2027-02-28', '2099-01-01'];
    for (const end of ends) {
      expect(asAtForPeriod(end, TODAY) <= TODAY).toBe(true);
    }
  });
});

describe('control account ledger start', () => {
  const AS_OF = '2026-09-03';

  it('opens on the period start', () => {
    expect(ledgerStartForPeriod('2026-03-01', AS_OF)).toBe('2026-03-01');
  });

  it('opens on the as-at date itself', () => {
    expect(ledgerStartForPeriod(AS_OF, AS_OF)).toBe(AS_OF);
  });

  it('runs from inception when there is no period', () => {
    expect(ledgerStartForPeriod(null, AS_OF)).toBeNull();
  });

  it('runs from inception rather than opening after it closes', () => {
    // A future custom range. Asked for one anyway, the live engine produced a
    // closing balance of 52 000.81 against a true control balance of 8 786.44 —
    // a ledger that does not tie. It now refuses; this keeps the page from
    // asking in the first place.
    expect(ledgerStartForPeriod('2027-01-01', AS_OF)).toBeNull();
  });
});

describe('isoDay', () => {
  it('formats in local time, not UTC', () => {
    // A date late in the evening must not roll into tomorrow, which is what
    // toISOString() does for any timezone ahead of UTC.
    const late = new Date(2026, 8, 3, 23, 30, 0);
    expect(isoDay(late)).toBe('2026-09-03');
  });

  it('pads month and day', () => {
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
