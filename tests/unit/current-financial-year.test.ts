/**
 * Which financial year is "current" is decided in one place.
 *
 * `financial_years` has no is_active column, so every screen used to infer the
 * current year, and two rules disagreed:
 *
 *   frontend: the open year containing today, else the newest open by end_date
 *   edge:     the first row in start_date DESC whose status is open OR which
 *             contains today -- status alone won, so the dates were never
 *             actually checked
 *
 * A live client has three open years, two of which contain today, so the two
 * rules only happened to agree because of row ordering. The rule now lives in
 * financial_year_current() in the database and arrives on the row as
 * `isCurrent`; this pins that the frontend reads the flag rather than deciding.
 */
import { describe, expect, it } from 'vitest';
import { calendarContextFromYears } from '../../src/lib/enterpriseMasterData/calendar';
import type { FinancialYearDomainModel } from '../../src/governance/domains/financialCalendar/model';

const year = (over: Partial<FinancialYearDomainModel>): FinancialYearDomainModel => ({
  id: 'fy',
  companyId: 'co',
  yearCode: 'FY',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'open',
  previousFinancialYearId: null,
  createdAt: null,
  isCurrent: false,
  ...over,
});

describe('the current financial year', () => {
  it('is whichever year the database flagged', () => {
    const ctx = calendarContextFromYears([
      year({ id: 'a', yearCode: 'FY2025', startDate: '2025-01-01', endDate: '2025-12-31' }),
      year({ id: 'b', yearCode: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' }),
      year({ id: 'c', yearCode: 'FY2027', startDate: '2026-03-01', endDate: '2027-02-28', isCurrent: true }),
    ]);
    expect(ctx.activeYear?.yearCode).toBe('FY2027');
    expect(ctx.startDate).toBe('2026-03-01');
    expect(ctx.endDate).toBe('2027-02-28');
  });

  // The case that made the two rules diverge: several open years contain today,
  // so "the one containing today" is not a single answer.
  it('does not re-decide when several open years contain today', () => {
    const ctx = calendarContextFromYears([
      year({ id: 'b', yearCode: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' }),
      year({ id: 'c', yearCode: 'FY2027', startDate: '2026-03-01', endDate: '2027-02-28', isCurrent: true }),
    ]);
    expect(ctx.activeYear?.id).toBe('c');
  });

  it('honours the flag even when another year looks like a better guess', () => {
    // A newer open year exists, but the database named the older one.
    const ctx = calendarContextFromYears([
      year({ id: 'old', yearCode: 'FY2025', startDate: '2025-01-01', endDate: '2025-12-31', isCurrent: true }),
      year({ id: 'new', yearCode: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' }),
    ]);
    expect(ctx.activeYear?.id).toBe('old');
  });

  it('falls back to the old rule only when no year carries the flag', () => {
    // A response from before the flag existed must not leave the app with no
    // calendar at all.
    const ctx = calendarContextFromYears([
      year({ id: 'a', yearCode: 'FY2020', startDate: '2020-01-01', endDate: '2020-12-31' }),
      year({ id: 'b', yearCode: 'FY2099', startDate: '2099-01-01', endDate: '2099-12-31' }),
    ]);
    expect(ctx.activeYear).not.toBeNull();
  });

  it('reports no calendar when there are no years', () => {
    const ctx = calendarContextFromYears([]);
    expect(ctx.activeYear).toBeNull();
    expect(ctx.startDate).toBeNull();
    expect(ctx.endDate).toBeNull();
  });
});
