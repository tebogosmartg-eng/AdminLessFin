import { describe, expect, it } from 'vitest';
import {
  calendarYearFallback,
  financialYearQuarters,
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
