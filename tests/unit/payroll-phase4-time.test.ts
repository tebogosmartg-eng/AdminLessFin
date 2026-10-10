import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  attendanceTotals,
  hoursPerDay,
  hoursWorked,
  quantityWorked,
  salariedMonthlyHours,
  timePay,
  timePayDescription,
  timesheetIssues,
  uifExemptForHours,
  type TimeEmployee,
} from '@/lib/payrollRulesEngine/timePay';
import { payrollRunWarnings } from '@/lib/payrollRulesEngine/runWarnings';
import { RULE_SET_2026_2027 } from '../../supabase/functions/_shared/statutoryPayrollEngine/registry/taxYears';
import { executeStatutoryPipeline } from '../../supabase/functions/_shared/statutoryPayrollEngine/pipeline';

const hourly: TimeEmployee = { pay_basis: 'hourly', pay_rate: 50 };
const daily: TimeEmployee = { pay_basis: 'daily', pay_rate: 250 };

describe('pay for time worked: quantity × rate, nothing else', () => {
  it('daily-paid: days × daily rate (2 days at R250 = R500)', () => {
    expect(timePay(daily, { days_worked: 2 })).toBe(500);
    expect(timePay(daily, { days_worked: 2.5 })).toBe(625);
    expect(timePayDescription(daily, { days_worked: 2 })).toBe('Days worked (2 × R250.00)');
  });
  it('hourly-paid: hours × hourly rate', () => {
    expect(timePay(hourly, { ordinary_hours: 24 })).toBe(1200);
    expect(timePayDescription(hourly, { ordinary_hours: 24 })).toBe('Hours worked (24 × R50.00)');
  });
  it("only the employee's own quantity counts (days for daily, hours for hourly)", () => {
    expect(quantityWorked(daily, { days_worked: 3, ordinary_hours: 40 })).toBe(3);
    expect(quantityWorked(hourly, { days_worked: 3, ordinary_hours: 40 })).toBe(40);
    expect(timePay({ pay_basis: 'salaried' }, { days_worked: 3, ordinary_hours: 40 })).toBe(0);
    expect(timePay(daily, null)).toBe(0);
  });
  it("a day is the employee's ordinary hours a day, or 8 when not captured (ETI, UIF 24-hour test)", () => {
    expect(hoursPerDay({})).toBe(8);
    expect(hoursPerDay({ ordinary_hours_per_week: 45, work_days_per_week: 5 })).toBe(9);
    expect(hoursWorked(daily, { days_worked: 2 })).toBe(16);
    expect(hoursWorked(hourly, { ordinary_hours: 10 })).toBe(10);
  });
});

describe('the national minimum wage is advice', () => {
  it('flags a rate below it (R30.23 an hour from March 2026)', () => {
    expect(timesheetIssues({ ...hourly, pay_rate: 29 }, '2026-11-08').map((i) => i.code)).toEqual(['BELOW_MINIMUM_WAGE']);
    expect(timesheetIssues({ ...hourly, pay_rate: 29 }, '2025-11-09')).toEqual([]);
    expect(timesheetIssues(daily, '2026-11-08')).toEqual([]);
    expect(timesheetIssues({ ...daily, pay_rate: 200 }, '2026-11-08')[0].message).toMatch(/8-hour day \(R241\.84\)/);
    expect(timesheetIssues({ pay_basis: 'daily', pay_rate: null }, '2026-11-08').map((i) => i.code)).toEqual(['NO_RATE']);
  });
});

describe('attendance totals', () => {
  it('daily-paid: ticked days, any day of the week (Saturday, Sunday or a public holiday is still a day)', () => {
    expect(attendanceTotals(daily, [
      { date: '2026-10-10', days: 1 }, { date: '2026-10-11', days: 1 }, { date: '2026-12-16', days: 0.5 },
    ])).toEqual({ days_worked: 2.5, ordinary_hours: 0, daysRecorded: 3 });
  });
  it('daily-paid days recorded in hours before ticks count as full days', () => {
    expect(attendanceTotals(daily, [{ date: '2026-10-10', hours: 8 }, { date: '2026-10-11', hours: 24 }]).days_worked).toBe(2);
  });
  it('hourly-paid: the hours, nothing split or topped up', () => {
    expect(attendanceTotals(hourly, [
      { date: '2026-12-14', hours: 10 }, { date: '2026-12-15', hours: 3 }, { date: '2026-12-16', hours: 8 }, { date: '2026-12-20', hours: 5 },
    ])).toEqual({ days_worked: 0, ordinary_hours: 26, daysRecorded: 4 });
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
