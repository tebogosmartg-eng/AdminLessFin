import { describe, expect, it } from 'vitest';
import {
  calendarYearFallback,
  financialYearQuarters,
  presetRange,
  REPORTING_PERIOD_PRESET_LABELS,
  REPORTING_PERIOD_PRESET_ORDER,
  resolveReportingPeriodPreset,
  toIsoDate,
} from '../../src/lib/reportingPeriod/presets';

describe('reporting period presets', () => {
  const fyStart = new Date(2025, 2, 1); // 1 Mar 2025
  const fyEnd = new Date(2026, 1, 28); // 28 Feb 2026
  const asOf = new Date(2025, 7, 15); // 15 Aug 2025

  it('defaults current financial year to FY bounds', () => {
    const range = resolveReportingPeriodPreset({
      preset: 'current_financial_year',
      financialYearStart: fyStart,
      financialYearEnd: fyEnd,
      asOf,
    });
    expect(toIsoDate(range.from)).toBe('2025-03-01');
    expect(toIsoDate(range.to)).toBe('2026-02-28');
  });

  it('resolves year to date from FY start through as-of', () => {
    const range = resolveReportingPeriodPreset({
      preset: 'year_to_date',
      financialYearStart: fyStart,
      financialYearEnd: fyEnd,
      asOf,
    });
    expect(toIsoDate(range.from)).toBe('2025-03-01');
    expect(toIsoDate(range.to)).toBe('2025-08-15');
  });

  it('resolves current and previous month', () => {
    const current = resolveReportingPeriodPreset({
      preset: 'current_month',
      financialYearStart: fyStart,
      financialYearEnd: fyEnd,
      asOf,
    });
    expect(toIsoDate(current.from)).toBe('2025-08-01');
    expect(toIsoDate(current.to)).toBe('2025-08-31');

    const previous = resolveReportingPeriodPreset({
      preset: 'previous_month',
      financialYearStart: fyStart,
      financialYearEnd: fyEnd,
      asOf,
    });
    expect(toIsoDate(previous.from)).toBe('2025-07-01');
    expect(toIsoDate(previous.to)).toBe('2025-07-31');
  });

  it('splits FY into four quarters', () => {
    const quarters = financialYearQuarters(fyStart, fyEnd);
    expect(quarters).toHaveLength(4);
    expect(toIsoDate(quarters[0].from)).toBe('2025-03-01');
    expect(toIsoDate(quarters[3].to)).toBe('2026-02-28');
  });

  it('uses custom range only for custom preset', () => {
    const custom = resolveReportingPeriodPreset({
      preset: 'custom',
      financialYearStart: fyStart,
      financialYearEnd: fyEnd,
      customRange: { from: new Date(2025, 5, 1), to: new Date(2025, 5, 30) },
      asOf,
    });
    expect(toIsoDate(custom.from)).toBe('2025-06-01');
    expect(toIsoDate(custom.to)).toBe('2025-06-30');
  });

  it('provides calendar-year fallback', () => {
    const range = calendarYearFallback(new Date(2026, 6, 1));
    expect(toIsoDate(range.from)).toBe('2026-01-01');
    expect(toIsoDate(range.to)).toBe('2026-12-31');
  });
});

describe('every preset stays inside the selected financial year', () => {
  // FY2026 runs 1 Mar 2025 – 28 Feb 2026; FY2027 runs 1 Mar 2026 – 28 Feb 2027.
  const fy26 = { start: new Date(2025, 2, 1), end: new Date(2026, 1, 28) };
  const fy27 = { start: new Date(2026, 2, 1), end: new Date(2027, 1, 28) };
  const today = new Date(2026, 8, 22); // 22 Sep 2026, inside FY2027
  const presets = [
    'current_financial_year', 'year_to_date', 'current_quarter', 'previous_quarter',
    'current_month', 'previous_month', 'month_to_date', 'custom',
  ] as const;

  it.each(presets)('%s, viewing a past year, never reaches into the year after it', (preset) => {
    const range = presetRange({
      preset,
      financialYearStart: fy26.start,
      financialYearEnd: fy26.end,
      customRange: { from: new Date(2026, 0, 15), to: new Date(2026, 5, 30) }, // straddles the year end
      asOf: today,
    });
    if (range) {
      expect(toIsoDate(range.from) >= '2025-03-01').toBe(true);
      expect(toIsoDate(range.to) <= '2026-02-28').toBe(true);
    }
  });

  it.each(presets)('%s, viewing the current year, never reaches back into the year before', (preset) => {
    const range = presetRange({
      preset,
      financialYearStart: fy27.start,
      financialYearEnd: fy27.end,
      customRange: { from: new Date(2026, 0, 1), to: new Date(2026, 3, 30) }, // starts in FY2026
      asOf: new Date(2026, 2, 10), // 10 Mar 2026, first month of FY2027
    });
    if (range) {
      expect(toIsoDate(range.from) >= '2026-03-01').toBe(true);
      expect(toIsoDate(range.to) <= '2027-02-28').toBe(true);
    }
  });

  it('"current month" of a past year is its last month, not today\'s month', () => {
    const range = presetRange({ preset: 'current_month', financialYearStart: fy26.start, financialYearEnd: fy26.end, asOf: today });
    expect(range && toIsoDate(range.from)).toBe('2026-02-01');
    expect(range && toIsoDate(range.to)).toBe('2026-02-28');
  });

  it('"year to date" of a past year is the whole year', () => {
    const range = presetRange({ preset: 'year_to_date', financialYearStart: fy26.start, financialYearEnd: fy26.end, asOf: today });
    expect(range && toIsoDate(range.from)).toBe('2025-03-01');
    expect(range && toIsoDate(range.to)).toBe('2026-02-28');
  });

  it('"previous quarter" and "previous month" in the first month have no range in the year', () => {
    const asOf = new Date(2026, 2, 10);
    expect(presetRange({ preset: 'previous_quarter', financialYearStart: fy27.start, financialYearEnd: fy27.end, asOf })).toBeNull();
    expect(presetRange({ preset: 'previous_month', financialYearStart: fy27.start, financialYearEnd: fy27.end, asOf })).toBeNull();
  });

  it('a preset with no range resolves to the full selected year, never another year', () => {
    const range = resolveReportingPeriodPreset({
      preset: 'previous_month', financialYearStart: fy27.start, financialYearEnd: fy27.end, asOf: new Date(2026, 2, 10),
    });
    expect(toIsoDate(range.from)).toBe('2026-03-01');
    expect(toIsoDate(range.to)).toBe('2027-02-28');
  });

  it('an accounting period resolves to its own dates, and one from another year to nothing', () => {
    const sep = presetRange({
      preset: 'accounting_period', financialYearStart: fy27.start, financialYearEnd: fy27.end,
      accountingPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' },
    });
    expect(sep && toIsoDate(sep.from)).toBe('2026-09-01');
    expect(sep && toIsoDate(sep.to)).toBe('2026-09-30');
    expect(presetRange({
      preset: 'accounting_period', financialYearStart: fy27.start, financialYearEnd: fy27.end,
      accountingPeriod: { startDate: '2025-09-01', endDate: '2025-09-30' },
    })).toBeNull();
  });

  it('a custom range is cut to the year', () => {
    const range = presetRange({
      preset: 'custom', financialYearStart: fy27.start, financialYearEnd: fy27.end,
      customRange: { from: new Date(2026, 0, 1), to: new Date(2026, 3, 30) },
    });
    expect(range && toIsoDate(range.from)).toBe('2026-03-01');
    expect(range && toIsoDate(range.to)).toBe('2026-04-30');
  });

  it('there is no "previous financial year" preset: another year is chosen in the header', () => {
    expect(Object.keys(REPORTING_PERIOD_PRESET_LABELS)).not.toContain('previous_financial_year');
    expect(REPORTING_PERIOD_PRESET_ORDER).not.toContain('previous_financial_year' as never);
  });
});
