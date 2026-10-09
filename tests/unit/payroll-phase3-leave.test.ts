import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  annualEntitlementPerCycle,
  cycleContaining,
  dailyRate,
  leaveBalance,
  leaveWorkingDays,
  paidShareAfterUnpaidLeave,
  unpaidLeaveDaysInPeriod,
  type LeaveEmployee,
  type LeaveEntry,
} from '@/lib/payrollRulesEngine/leave';
import { formatLeaveBalances, extractPayslipCertificationFromSnapshot } from '@/lib/payrollDocuments';
import { unpaidLeaveForPayslip, payslipLeaveBalances } from '../../supabase/functions/_shared/leaveRegister';

const employee: LeaveEmployee = { startDate: '2025-01-01', endDate: null, workDaysPerWeek: 5, annualLeaveDaysPerCycle: null };
const taken = (start: string, end: string, days: number, extra: Partial<LeaveEntry> = {}): LeaveEntry => ({
  leaveTypeId: 't', entryType: 'taken', startDate: start, endDate: end, effectiveDate: start, days, status: 'approved', ...extra,
});
const entry = (entryType: LeaveEntry['entryType'], effectiveDate: string, days: number): LeaveEntry => ({
  leaveTypeId: 't', entryType, startDate: null, endDate: null, effectiveDate, days, status: 'approved',
});

describe('working days a leave period uses', () => {
  it('skips weekends and public holidays (BCEA s21)', () => {
    expect(leaveWorkingDays('2026-12-07', '2026-12-11')).toBe(5);
    expect(leaveWorkingDays('2026-12-14', '2026-12-18')).toBe(4); // 16 December is a public holiday
    // 16 December (Wednesday) and 25 December (Friday) are public holidays.
    expect(leaveWorkingDays('2026-12-14', '2026-12-25')).toBe(8);
    expect(leaveWorkingDays('2026-12-19', '2026-12-20')).toBe(0);
  });
  it('a six-day week counts Saturdays', () => {
    expect(leaveWorkingDays('2026-12-14', '2026-12-19', 6)).toBe(5);
    expect(leaveWorkingDays('2026-11-09', '2026-11-14', 6)).toBe(6);
  });
});

describe('annual leave (BCEA s20)', () => {
  it('3 weeks of working days a year, or the contract', () => {
    expect(annualEntitlementPerCycle(employee)).toBe(15);
    expect(annualEntitlementPerCycle({ ...employee, workDaysPerWeek: 6 })).toBe(18);
    expect(annualEntitlementPerCycle({ ...employee, annualLeaveDaysPerCycle: 20 })).toBe(20);
  });
  it('accrues daily from the start date', () => {
    expect(leaveBalance('bcea_annual', employee, [], '2025-12-31').entitled).toBe(15);
    expect(leaveBalance('bcea_annual', employee, [], '2025-07-01').entitled).toBe(7.48);
    expect(leaveBalance('bcea_annual', employee, [], '2024-12-31').note).toMatch(/Not yet employed/);
  });
  it('balance = accrued + opening − taken + adjustments − paid out − forfeited; booked leave is separate', () => {
    const b = leaveBalance('bcea_annual', employee, [
      entry('opening_balance', '2025-01-01', 4),
      taken('2025-06-02', '2025-06-06', 5),
      taken('2026-01-05', '2026-01-06', 2),
      taken('2025-08-04', '2025-08-04', 1, { status: 'cancelled' }),
      entry('adjustment', '2025-09-01', -1.5),
      entry('forfeit', '2025-10-01', 0.5),
    ], '2025-12-31');
    expect(b).toMatchObject({ entitled: 19, taken: 5, booked: 2, adjustments: -1.5, forfeited: 0.5, balance: 12, available: 10 });
    expect(b.cycleStart).toBe('2025-01-01');
    expect(b.cycleEnd).toBe('2025-12-31');
  });
  it('a leaver accrues only to the end date', () => {
    expect(leaveBalance('bcea_annual', { ...employee, endDate: '2025-07-01' }, [], '2025-12-31').entitled).toBe(7.48);
  });
});

describe('sick leave (BCEA s22)', () => {
  const sick = { ...employee, startDate: '2026-01-05' };
  it('first 6 months: 1 day for every 26 days worked', () => {
    const b = leaveBalance('bcea_sick', sick, [], '2026-02-27');
    expect(b.entitled).toBe(1); // 40 working days
    expect(b.note).toMatch(/26 days/);
  });
  it('after 6 months: 6 weeks of working days for the 36-month cycle, less what was taken', () => {
    const b = leaveBalance('bcea_sick', sick, [taken('2026-03-02', '2026-03-03', 2)], '2026-08-01');
    expect(b).toMatchObject({ entitled: 30, taken: 2, balance: 28, cycleStart: '2026-01-05', cycleEnd: '2029-01-04' });
  });
  it('a new cycle starts after 36 months', () => {
    const b = leaveBalance('bcea_sick', sick, [taken('2026-03-02', '2026-03-03', 2)], '2029-01-05');
    expect(b).toMatchObject({ entitled: 30, taken: 0, balance: 30, cycleStart: '2029-01-05' });
  });
});

describe('family responsibility leave (BCEA s27)', () => {
  it('3 days a year after 4 months, for 4+ days a week; not carried over', () => {
    expect(leaveBalance('bcea_family', employee, [], '2025-04-30').entitled).toBe(0);
    expect(leaveBalance('bcea_family', employee, [taken('2025-06-02', '2025-06-02', 1)], '2025-08-01').balance).toBe(2);
    expect(leaveBalance('bcea_family', employee, [taken('2025-06-02', '2025-06-02', 1)], '2026-01-02').balance).toBe(3);
    expect(leaveBalance('bcea_family', { ...employee, workDaysPerWeek: 3 }, [], '2025-08-01').entitled).toBe(0);
  });
});

describe('cycles and dates', () => {
  it('adds months and finds the cycle', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(cycleContaining('2025-03-15', '2027-04-01', 12)).toEqual({ start: '2027-03-15', end: '2028-03-14', index: 2 });
  });
});

describe('daily rate (BCEA s35) and unpaid leave', () => {
  it('daily rate by pay frequency', () => {
    expect(dailyRate(21_666.67, 'monthly', 5)).toBe(1_000);
    expect(dailyRate(5_000, 'weekly', 5)).toBe(1_000);
    expect(dailyRate(10_000, 'fortnightly', null)).toBe(1_000);
    expect(dailyRate(0, 'monthly', 5)).toBe(0);
  });
  it('unpaid leave spanning two months counts the working days in each', () => {
    const e = [taken('2026-11-30', '2026-12-04', 5)];
    expect(unpaidLeaveDaysInPeriod(e, '2026-11-01', '2026-11-30', 5)).toBe(1);
    expect(unpaidLeaveDaysInPeriod(e, '2026-12-01', '2026-12-31', 5)).toBe(4);
    expect(unpaidLeaveDaysInPeriod([taken('2026-11-30', '2026-12-04', 2.5)], '2026-12-01', '2026-12-31', 5)).toBe(2);
  });
  it('paid share of the salary', () => {
    expect(paidShareAfterUnpaidLeave({ employmentFactor: 1, unpaidDays: 2, workingDaysEmployed: 20 })).toBe(0.9);
    expect(paidShareAfterUnpaidLeave({ employmentFactor: 0.5, unpaidDays: 5, workingDaysEmployed: 10 })).toBe(0.25);
    expect(paidShareAfterUnpaidLeave({ employmentFactor: 1, unpaidDays: 30, workingDaysEmployed: 20 })).toBe(0);
    expect(paidShareAfterUnpaidLeave({ employmentFactor: 1, unpaidDays: 0, workingDaysEmployed: 20 })).toBe(1);
  });
});

describe('payroll reads the register', () => {
  const context = {
    types: [
      { id: 'annual', accrual: 'bcea_annual', paid: true, active: true },
      { id: 'sick', accrual: 'bcea_sick', paid: true, active: true },
      { id: 'family', accrual: 'bcea_family', paid: true, active: true },
      { id: 'unpaid', accrual: 'none', paid: false, active: true },
    ],
    rows: [
      { employee_id: 'e1', leave_type_id: 'unpaid', entry_type: 'taken', start_date: '2026-11-09', end_date: '2026-11-10', effective_date: '2026-11-09', days: 2, status: 'approved' },
      { employee_id: 'e1', leave_type_id: 'annual', entry_type: 'taken', start_date: '2026-11-16', end_date: '2026-11-18', effective_date: '2026-11-16', days: 3, status: 'approved' },
      { employee_id: 'e2', leave_type_id: 'unpaid', entry_type: 'taken', start_date: '2026-11-09', end_date: '2026-11-10', effective_date: '2026-11-09', days: 2, status: 'cancelled' },
    ],
  };
  const e1 = { id: 'e1', start_date: '2025-11-01', end_date: null, work_days_per_week: 5, annual_leave_days_per_cycle: null };
  it('unpaid leave reduces the paid share; paid leave and cancelled entries do not', () => {
    // November 2026 has 21 working days.
    expect(unpaidLeaveForPayslip(e1, context, '2026-11-01', '2026-11-30', 1)).toEqual({ unpaidDays: 2, paidShare: 0.904762 });
    expect(unpaidLeaveForPayslip({ ...e1, id: 'e2' }, context, '2026-11-01', '2026-11-30', 1)).toEqual({ unpaidDays: 0, paidShare: 1 });
  });
  it('balances for the payslip', () => {
    const b = payslipLeaveBalances(e1, context, '2026-11-30') as Record<string, number>;
    expect(b.annual).toBe(Math.round(((15 * 395) / 365 - 3) * 100) / 100);
    expect(b.sick).toBe(30);
    expect(b.family).toBe(3);
    expect(formatLeaveBalances({ ...b, unpaid_this_period: 2 })).toBe(`Annual ${b.annual.toLocaleString('en-ZA', { maximumFractionDigits: 2 })} days · Sick 30 days · Family responsibility 3 days · Unpaid leave this period 2 days`);
  });
  it('the payslip document picks the balances and unpaid days from the snapshot', () => {
    const doc = extractPayslipCertificationFromSnapshot({ leave_balances: { annual: 10, sick: 30 }, period_employment: { unpaid_leave_days: 1.5 } });
    expect(doc.leave_balances).toEqual({ annual: 10, sick: 30, unpaid_this_period: 1.5 });
    expect(extractPayslipCertificationFromSnapshot({}).leave_balances).toBeUndefined();
  });
});

describe('client and server copies', () => {
  it('are identical apart from Deno import extensions', () => {
    for (const file of ['leave.ts', 'runWarnings.ts']) {
      const client = readFileSync(`src/lib/payrollRulesEngine/${file}`, 'utf8').replace(/\r\n/g, '\n');
      const server = readFileSync(`supabase/functions/_shared/payrollRulesEngine/${file}`, 'utf8').replace(/\r\n/g, '\n')
        .replace(/(from '\.{1,2}\/[^']+)\.ts'/g, "$1'");
      expect(server, file).toBe(client);
    }
  });
});
