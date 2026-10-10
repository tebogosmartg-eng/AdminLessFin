import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  dailyWage,
  hourlyWage,
  hoursPerDay,
  ordinaryHoursWorked,
  salariedMonthlyHours,
  timePayLines,
  timesheetIssues,
  totalHoursWorked,
  uifExemptForHours,
  weeksInPeriod,
  type TimeEmployee,
} from '@/lib/payrollRulesEngine/timePay';
import { payrollRunWarnings } from '@/lib/payrollRulesEngine/runWarnings';
import { RULE_SET_2026_2027 } from '../../supabase/functions/_shared/statutoryPayrollEngine/registry/taxYears';
import { executeStatutoryPipeline } from '../../supabase/functions/_shared/statutoryPayrollEngine/pipeline';
import { publicHolidaysOnWorkingDays } from '../../supabase/functions/payroll/time';

const hourly: TimeEmployee = { pay_basis: 'hourly', pay_rate: 50, ordinary_hours_per_week: 40, work_days_per_week: 5 };

describe('wages under BCEA s35', () => {
  it('a salaried employee: weekly wage ÷ ordinary weekly hours (monthly = 4⅓ × weekly)', () => {
    expect(hourlyWage({ pay_basis: 'salaried', salary_amount: 19_500, salary_period: 'monthly', ordinary_hours_per_week: null })).toBe(100);
    expect(hourlyWage({ pay_basis: 'salaried', salary_amount: 4_000, salary_period: 'weekly', ordinary_hours_per_week: 40 })).toBe(100);
    expect(hourlyWage({ pay_basis: 'salaried', salary_amount: 8_000, salary_period: 'fortnightly', ordinary_hours_per_week: 40 })).toBe(100);
  });
  it('a day is the weekly hours ÷ working days, at most 9 (or 7.5 on a 6-day week)', () => {
    expect(hoursPerDay({ ordinary_hours_per_week: 40, work_days_per_week: 5 })).toBe(8);
    expect(hoursPerDay({ ordinary_hours_per_week: null, work_days_per_week: 5 })).toBe(9);
    expect(hoursPerDay({ ordinary_hours_per_week: 45, work_days_per_week: 6 })).toBe(7.5);
  });
  it('a daily-paid employee: the day rate over the hours in a day', () => {
    const daily: TimeEmployee = { pay_basis: 'daily', pay_rate: 900, ordinary_hours_per_week: 45, work_days_per_week: 5 };
    expect(hourlyWage(daily)).toBe(100);
    expect(dailyWage(daily)).toBe(900);
    expect(dailyWage(hourly)).toBe(400);
  });
});

describe('pay for time worked', () => {
  it('hourly: ordinary hours, overtime 1.5×, Sunday 2×, public holiday 2×, public holiday not worked at the daily wage', () => {
    const pay = timePayLines(hourly, { ordinary_hours: 40, overtime_hours: 5, sunday_hours: 4, public_holiday_hours: 8, public_holiday_days_paid: 1 });
    expect(pay.ordinaryPay).toBe(2000);
    expect(pay.lines.map((l) => [l.code, l.amount, l.irp5Code])).toEqual([
      ['time_public_holiday_paid', 400, '3601'],
      ['time_overtime', 375, '3607'],
      ['time_sunday', 400, '3601'],
      ['time_public_holiday_worked', 800, '3601'],
    ]);
  });
  it('an employee who ordinarily works Sundays gets 1.5× (s16)', () => {
    const pay = timePayLines({ ...hourly, works_sundays: true }, { sunday_hours: 4 });
    expect(pay.lines[0]).toMatchObject({ code: 'time_sunday', multiplier: 1.5, amount: 300 });
  });
  it('daily-paid: days × the day rate', () => {
    const daily: TimeEmployee = { pay_basis: 'daily', pay_rate: 400, ordinary_hours_per_week: 40, work_days_per_week: 5 };
    expect(timePayLines(daily, { days_worked: 3 }).ordinaryPay).toBe(1200);
    expect(ordinaryHoursWorked(daily, { days_worked: 3 })).toBe(24);
  });
  it('salaried: only the premiums (the salary pays ordinary time and public holidays)', () => {
    const salaried: TimeEmployee = { pay_basis: 'salaried', salary_amount: 19_500, salary_period: 'monthly', ordinary_hours_per_week: 45 };
    const pay = timePayLines(salaried, { overtime_hours: 2, public_holiday_days_paid: 1, ordinary_hours: 10 });
    expect(pay.ordinaryPay).toBe(0);
    expect(pay.lines).toEqual([expect.objectContaining({ code: 'time_overtime', amount: 300 })]);
  });
  it('hours worked count every kind of hour', () => {
    expect(totalHoursWorked(hourly, { ordinary_hours: 10, overtime_hours: 2, sunday_hours: 3, public_holiday_hours: 1 })).toBe(16);
    expect(timePayLines(hourly, null)).toEqual({ ordinaryPay: 0, lines: [] });
  });
});

describe('BCEA limits and the national minimum wage', () => {
  it('flags overtime over 10 hours a week and ordinary time over 45', () => {
    expect(weeksInPeriod('2026-11-02', '2026-11-08')).toBe(1);
    const issues = timesheetIssues(hourly, { ordinary_hours: 50, overtime_hours: 12 }, '2026-11-02', '2026-11-08').map((i) => i.code);
    expect(issues).toEqual(['OVERTIME_LIMIT', 'ORDINARY_HOURS_LIMIT']);
    expect(timesheetIssues(hourly, { ordinary_hours: 80, overtime_hours: 20 }, '2026-11-02', '2026-11-15')).toEqual([]);
  });
  it('flags a rate below the national minimum wage (R30.23 from March 2026)', () => {
    expect(timesheetIssues({ ...hourly, pay_rate: 29 }, null, '2026-11-02', '2026-11-08').map((i) => i.code)).toEqual(['BELOW_MINIMUM_WAGE']);
    expect(timesheetIssues({ ...hourly, pay_rate: 29 }, null, '2025-11-03', '2025-11-09')).toEqual([]);
    expect(timesheetIssues({ pay_basis: 'daily', pay_rate: null }, null, '2026-11-02', '2026-11-08').map((i) => i.code)).toEqual(['NO_RATE']);
  });
});

describe('UIF: not for fewer than 24 hours a month (UI Act s3)', () => {
  it('counts the hours in the month', () => {
    expect(uifExemptForHours(23.5)).toBe(true);
    expect(uifExemptForHours(24)).toBe(false);
    expect(uifExemptForHours(null)).toBe(false);
    expect(salariedMonthlyHours({ ordinary_hours_per_week: 5 })).toBe(21.67);
    expect(salariedMonthlyHours({ ordinary_hours_per_week: null })).toBeNull();
  });
});

describe("employees' tax for non-standard employment", () => {
  const run = (taxMethod: 'tables' | 'non_standard', taxable: number) => executeStatutoryPipeline({
    employee: { id: 'casual', age: 30, taxMethod },
    period: { payPeriodStart: '2026-11-02', payPeriodEnd: '2026-11-08', payDate: '2026-11-08' },
    grossEarnings: taxable,
    taxableEarnings: taxable,
    periodsPerYear: 52,
    ruleSet: RULE_SET_2026_2027,
    enabledEngines: { paye: true, uif: true, uif_employer: true, sdl: true, medical_tax_credit: true },
    engineConfig: {},
    companyAnnualRemuneration: 600_000,
  }).engineResults.find((r) => r.engineId === 'paye')!;
  it('is a flat 25% of the remuneration, with no rebates (SARS Guide for Employers)', () => {
    expect(run('non_standard', 1_200).employeeAmount).toBe(300);
    expect(run('non_standard', 1_200).breakdown.flatRate).toBe(0.25);
  });
  it('the tables give no tax below the threshold for the same pay', () => {
    expect(run('tables', 1_200).employeeAmount).toBe(0);
  });
});

describe('run warnings for hourly and daily-paid employees', () => {
  const base = { id: 'h1', first_name: 'Thabo', last_name: 'Casual', salary_amount: null, salary_period: 'weekly' };
  it('no rate, or no hours on the timesheet', () => {
    const w = (extra: object, timesheetEmployeeIds = new Set<string>()) => payrollRunWarnings({
      candidates: [{ ...base, ...extra }], paidEmployeeIds: new Set(), allEmployees: [{ ...base, ...extra }],
      periodInputs: [], payFrequency: 'weekly', timesheetEmployeeIds,
    }).filter((x) => x.category === 'pay').map((x) => x.code);
    expect(w({ pay_basis: 'hourly', pay_rate: null })).toEqual(['NO_SALARY']);
    expect(w({ pay_basis: 'hourly', pay_rate: 50 })).toEqual(['NO_HOURS']);
    expect(w({ pay_basis: 'daily', pay_rate: 400 }, new Set(['h1']))).toEqual(['NOT_ON_RUN']);
  });
});

describe('public holidays on working days', () => {
  it('only holidays on the employee\'s working days, within employment', () => {
    // 16 December 2026 is a Wednesday; 25 and 26 December are Friday and Saturday.
    expect(publicHolidaysOnWorkingDays({ start_date: '2020-01-01', work_days_per_week: 5 }, '2026-12-14', '2026-12-27')).toEqual(['2026-12-16', '2026-12-25']);
    expect(publicHolidaysOnWorkingDays({ start_date: '2020-01-01', work_days_per_week: 6 }, '2026-12-14', '2026-12-27')).toEqual(['2026-12-16', '2026-12-25', '2026-12-26']);
    expect(publicHolidaysOnWorkingDays({ start_date: '2026-12-20', work_days_per_week: 5 }, '2026-12-14', '2026-12-27')).toEqual(['2026-12-25']);
  });
});

describe('client and server copies', () => {
  it('are identical apart from Deno import extensions', () => {
    for (const file of ['payrollRulesEngine/timePay.ts', 'payrollRulesEngine/runWarnings.ts', 'statutoryPayrollEngine/types.ts']) {
      const client = readFileSync(`src/lib/${file}`, 'utf8').replace(/\r\n/g, '\n');
      const server = readFileSync(`supabase/functions/_shared/${file}`, 'utf8').replace(/\r\n/g, '\n')
        .replace(/(from '\.{1,2}\/[^']+)\.ts'/g, "$1'");
      expect(server, file).toBe(client);
    }
  });
});

describe('a reversed payroll run paid nobody', () => {
  it('is not in effect; a run reopened and finalised again is', async () => {
    const { isRunInEffect, isRunReversed } = await import('../../supabase/functions/_shared/payrollRunState');
    const finalised = { status: 'finalized', output_metadata: { processed_at: '2026-10-01T10:00:00Z' } };
    const reversed = { status: 'finalized', output_metadata: { processed_at: '2026-10-01T10:00:00Z', reversed_at: '2026-10-02T10:00:00Z' } };
    const refinalised = { status: 'finalized', output_metadata: { reversed_at: '2026-10-02T10:00:00Z', processed_at: '2026-10-03T10:00:00Z' } };
    expect(isRunInEffect(finalised)).toBe(true);
    expect(isRunReversed(reversed)).toBe(true);
    expect(isRunInEffect(reversed)).toBe(false);
    expect(isRunInEffect(refinalised)).toBe(true);
    expect(isRunInEffect({ status: 'draft', output_metadata: {} })).toBe(false);
    expect(isRunInEffect({ status: 'paid', output_metadata: { cancelled: true } })).toBe(false);
  });
});

describe('attendance register totals (per day)', () => {
  const week = [
    { date: '2026-12-14', hours: 10 }, // Monday: 8 ordinary + 2 overtime
    { date: '2026-12-15', hours: 3 },  // Tuesday: under the 4-hour minimum shift
    { date: '2026-12-16', hours: 8 },  // Wednesday: Day of Reconciliation
    { date: '2026-12-20', hours: 5 },  // Sunday
  ];
  it('hourly: ordinary up to the ordinary day, the rest overtime; Sunday and public holiday hours apart; short shifts topped up', async () => {
    const { attendanceTotals } = await import('@/lib/payrollRulesEngine/timePay');
    expect(attendanceTotals(hourly, week)).toMatchObject({
      ordinary_hours: 12, overtime_hours: 2, sunday_hours: 5, public_holiday_hours: 8, days_worked: 0, shiftTopUpHours: 1, daysRecorded: 4,
    });
  });
  it('the minimum shift can be switched off', async () => {
    const { attendanceTotals, BCEA_TIME_POLICY } = await import('@/lib/payrollRulesEngine/timePay');
    expect(attendanceTotals(hourly, week, { ...BCEA_TIME_POLICY, minimumShiftHours: 0 })).toMatchObject({ ordinary_hours: 11, shiftTopUpHours: 0 });
  });
  it('daily-paid: a full ordinary day is 1, half a day 0.5, extra hours overtime', async () => {
    const { attendanceTotals } = await import('@/lib/payrollRulesEngine/timePay');
    const daily: TimeEmployee = { pay_basis: 'daily', pay_rate: 400, ordinary_hours_per_week: 40, work_days_per_week: 5 };
    expect(attendanceTotals(daily, [
      { date: '2026-12-14', hours: 8 }, { date: '2026-12-15', hours: 4 }, { date: '2026-12-17', hours: 10 },
    ])).toMatchObject({ days_worked: 2.5, overtime_hours: 2, ordinary_hours: 0 });
  });
  it('salaried: only overtime, Sunday and public holiday hours', async () => {
    const { attendanceTotals } = await import('@/lib/payrollRulesEngine/timePay');
    const salaried: TimeEmployee = { pay_basis: 'salaried', salary_amount: 19_500, salary_period: 'monthly', ordinary_hours_per_week: 40, work_days_per_week: 5 };
    expect(attendanceTotals(salaried, week)).toMatchObject({ ordinary_hours: 0, days_worked: 0, overtime_hours: 2, sunday_hours: 5, public_holiday_hours: 8, shiftTopUpHours: 0 });
  });
});

describe('company pay rules', () => {
  it('the company multipliers are used; rules below the BCEA are advice, not refused', async () => {
    const { timePayLines, timePolicyFrom, policyBelowBcea, BCEA_TIME_POLICY } = await import('@/lib/payrollRulesEngine/timePay');
    const policy = timePolicyFrom({ overtime_multiplier: 2, sunday_multiplier: 1.5, public_holiday_multiplier: 3 });
    const pay = timePayLines(hourly, { overtime_hours: 2, sunday_hours: 2, public_holiday_hours: 1 }, policy);
    expect(pay.lines.map((l) => [l.code, l.amount])).toEqual([['time_overtime', 200], ['time_sunday', 150], ['time_public_holiday_worked', 150]]);
    expect(policyBelowBcea(policy)).toEqual(['Sunday work below 2× (BCEA s16)']);
    expect(policyBelowBcea(BCEA_TIME_POLICY)).toEqual([]);
    expect(timePolicyFrom(null)).toEqual(BCEA_TIME_POLICY);
  });
});
