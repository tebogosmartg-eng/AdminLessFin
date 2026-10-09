import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calculateEtiForEmployeeMonth,
  etiFullMonthAmount,
  etiRulesFor,
  nationalMinimumWageHourly,
  payslipOrdinaryHours,
  type EtiEmployeeMonthInput,
} from '@/lib/sars/eti';
import { buildEmp201, employerEtiEligibility, etiBroughtForwardFor, type Emp201Input } from '@/lib/sars/emp201';
import { emp201AmountsFromPayslip, monthBounds, previousMonth, taxYearLabel } from '../../supabase/functions/_shared/statutoryFiling';

const rules = etiRulesFor('2026-11')!;
const base: EtiEmployeeMonthInput = {
  month: '2026-11', ageAtMonthEnd: 24, hasValidSaId: true, employmentDate: '2026-01-05', sezCode: null,
  domesticWorker: false, connectedPerson: false, remuneration: 6_500, hours: 173.33, priorQualifyingMonths: 0,
};

describe('ETI amount (SARS guide rev. 17, section 11, from 1 April 2025)', () => {
  it('follows the table for the first and second 12 months', () => {
    expect(etiFullMonthAmount(2_000, 1, rules)).toBe(1_200); // 60%
    expect(etiFullMonthAmount(2_000, 2, rules)).toBe(600); // 30%
    expect(etiFullMonthAmount(2_500, 1, rules)).toBe(1_500);
    expect(etiFullMonthAmount(5_499.99, 1, rules)).toBe(1_500);
    expect(etiFullMonthAmount(5_499.99, 2, rules)).toBe(750);
    expect(etiFullMonthAmount(6_500, 1, rules)).toBe(750); // 1 500 − 0.75 × 1 000
    expect(etiFullMonthAmount(6_500, 2, rules)).toBe(375); // 750 − 0.375 × 1 000
    expect(etiFullMonthAmount(7_499.99, 1, rules)).toBeCloseTo(0.01, 2);
    expect(etiFullMonthAmount(7_500, 1, rules)).toBe(0); // must be below R7 500
  });

  it('has no rules before April 2025, and the 2026 national minimum wage', () => {
    expect(etiRulesFor('2025-03')).toBeNull();
    expect(nationalMinimumWageHourly('2026-02')).toBe(28.79);
    expect(nationalMinimumWageHourly('2026-03')).toBe(30.23);
  });
});

describe('ETI for an employee and a month', () => {
  it('reproduces the SARS seasonal-worker example: 80 hours, R2 750 → grossed up to R5 500 → R750', () => {
    const r = calculateEtiForEmployeeMonth({ ...base, remuneration: 2_750, hours: 80 });
    expect(r).toMatchObject({ qualifies: true, cycle: 1, monthlyRemuneration160: 5_500, hoursReported: 80, eti: 750 });
  });

  it('reports at most 160 hours and the hourly wage against the hourly minimum wage (BRS 7003/7007/7008)', () => {
    const r = calculateEtiForEmployeeMonth(base);
    expect(r).toMatchObject({ hoursReported: 160, minimumWageHourly: 30.23, wagePaidHourly: 37.5, eti: 750, cycle: 1 });
  });

  it('uses the second-year amount after 12 qualifying months, and stops after 24', () => {
    expect(calculateEtiForEmployeeMonth({ ...base, priorQualifyingMonths: 11 })).toMatchObject({ cycle: 1, eti: 750 });
    expect(calculateEtiForEmployeeMonth({ ...base, priorQualifyingMonths: 12 })).toMatchObject({ cycle: 2, eti: 375 });
    expect(calculateEtiForEmployeeMonth({ ...base, priorQualifyingMonths: 24 })).toMatchObject({ qualifies: false, cycle: 0, eti: 0 });
  });

  it('applies each qualification rule per employee and month', () => {
    const reason = (patch: Partial<EtiEmployeeMonthInput>) => calculateEtiForEmployeeMonth({ ...base, ...patch }).reason ?? '';
    expect(reason({ ageAtMonthEnd: 30 })).toMatch(/outside 18–29/);
    expect(reason({ ageAtMonthEnd: 17 })).toMatch(/outside 18–29/);
    expect(calculateEtiForEmployeeMonth({ ...base, ageAtMonthEnd: 45, sezCode: 'COE' }).eti).toBe(750); // no age limit in an SEZ
    expect(reason({ employmentDate: '2013-09-30' })).toMatch(/1 October 2013/);
    expect(reason({ domesticWorker: true })).toMatch(/Domestic/);
    expect(reason({ connectedPerson: true })).toMatch(/connected person/);
    expect(reason({ hasValidSaId: false })).toMatch(/ID/);
    expect(reason({ hours: 0 })).toMatch(/hours/);
    expect(reason({ remuneration: 5_000 })).toMatch(/below the minimum wage/); // R28.85/h < R30.23
    expect(reason({ remuneration: 7_600 })).toMatch(/not below R7/);
    expect(calculateEtiForEmployeeMonth({ ...base, wageRegulatingMinimumHourly: 40 }).reason).toMatch(/below the minimum wage of R40/);
    expect(calculateEtiForEmployeeMonth({ ...base, month: '2025-03' }).reason).toMatch(/April 2025/);
  });

  it('works out a payslip\'s hours from ordinary hours per week', () => {
    expect(payslipOrdinaryHours(40, 12)).toBeCloseTo(173.3333, 3);
    expect(payslipOrdinaryHours(40, 52)).toBe(40);
    expect(payslipOrdinaryHours(40, 26)).toBe(80);
    expect(payslipOrdinaryHours(40, 12, 0.5)).toBeCloseTo(86.6667, 3);
    expect(payslipOrdinaryHours(null, 12)).toBe(0);
  });
});

describe('EMP201', () => {
  const employer = { claimEti: true, payeReference: '7230767891', sic7Code: '69201' };
  const slip = (employeeId: string, over: Partial<Emp201Input['payslips'][number]> = {}) => ({
    payslipId: `${employeeId}-1`, payrollRunId: 'run-1', employeeId, payDate: '2026-11-30',
    paye: 0, uifEmployee: 65, uifEmployer: 65, sdl: 65, cashRemuneration: 6_500, hours: 173.33, ...over,
  });
  const employee = (id: string, over: Partial<Emp201Input['employees'][number]> = {}) => ({
    id, name: id, employeeNumber: id, ageAtMonthEnd: 24, hasValidSaId: true, employmentDate: '2026-01-05',
    sezCode: null, domesticWorker: false, connectedPerson: false, wageRegulatingMinimumHourly: null, priorQualifyingMonths: 0, ...over,
  });

  it('totals PAYE, SDL and UIF and uses ETI against PAYE only', () => {
    const d = buildEmp201({
      month: '2026-11', employer, etiBroughtForward: 0,
      payslips: [slip('young'), slip('senior', { paye: 4_000, cashRemuneration: 30_000, uifEmployee: 177.12, uifEmployer: 177.12, sdl: 300 })],
      employees: [employee('young'), employee('senior', { ageAtMonthEnd: 45 })],
    });
    expect(d).toMatchObject({ period: '202611', paye: 4_000, sdl: 365, uif: 484.24, employeeCount: 2 });
    expect(d.eti).toMatchObject({ employerEligible: true, calculated: 750, broughtForward: 0, available: 750, utilised: 750, carriedForward: 0 });
    expect(d.totalPayable).toBe(4_000 - 750 + 365 + 484.24);
  });

  it('carries forward ETI that exceeds PAYE, and resets it in March and September', () => {
    const d = buildEmp201({ month: '2026-11', employer, etiBroughtForward: 300, payslips: [slip('young', { paye: 200 })], employees: [employee('young')] });
    expect(d.eti).toMatchObject({ calculated: 750, broughtForward: 300, available: 1_050, utilised: 200, carriedForward: 850 });
    expect(etiBroughtForwardFor('2026-09', 850)).toBe(0);
    expect(etiBroughtForwardFor('2027-03', 850)).toBe(0);
    expect(etiBroughtForwardFor('2026-10', 850)).toBe(850);
  });

  it('adds up weekly payslips into the month (BGR 47)', () => {
    const weeks = [1, 2, 3, 4].map((w) => slip('weekly', { payslipId: `w${w}`, payrollRunId: `run-${w}`, cashRemuneration: 1_625, hours: 40 }));
    const d = buildEmp201({ month: '2026-11', employer, etiBroughtForward: 0, payslips: weeks, employees: [employee('weekly')] });
    const line = d.employees[0];
    expect(line).toMatchObject({ payslips: 4, remuneration: 6_500, hours: 160 });
    expect(line.eti).toMatchObject({ eti: 750, cycle: 1 });
    expect(d.sourcePayrollRunIds).toEqual(['run-1', 'run-2', 'run-3', 'run-4']);
  });

  it('claims no ETI when the employer is not eligible', () => {
    expect(employerEtiEligibility({ ...employer, claimEti: false }).eligible).toBe(false);
    expect(employerEtiEligibility({ ...employer, payeReference: '0001339050' }).reason).toMatch(/registered for PAYE/);
    expect(employerEtiEligibility({ ...employer, sic7Code: '84111' }).reason).toMatch(/does not qualify/);
    const d = buildEmp201({ month: '2026-11', employer: { ...employer, claimEti: false }, etiBroughtForward: 500, payslips: [slip('young')], employees: [employee('young')] });
    expect(d.eti).toMatchObject({ calculated: 0, broughtForward: 0, utilised: 0 });
    expect(d.employees[0].eti).toBeNull();
  });
});

describe('EMP201 data from a finalised payslip', () => {
  it('takes PAYE from the 4102 lines, UIF and SDL from the engines, and the stamped hours', () => {
    const amounts = emp201AmountsFromPayslip({
      id: 'p1', payroll_run_id: 'r1', employee_id: 'e1', total_earnings: 34_000,
      calculation_snapshot: {
        gross_earnings: 34_000,
        engine_results: [
          { engine_id: 'paye', employee_amount: 4_928 },
          { engine_id: 'uif', employee_amount: 177.12 },
          { engine_id: 'uif_employer', employer_amount: 177.12 },
          { engine_id: 'sdl', employer_amount: 332 },
          { engine_id: 'bonus_tax', employee_amount: 999, skipped: true },
        ],
        period_employment: { ordinary_hours: 173.3333, periods_per_year: 12 },
      },
      payslip_items: [{ type: 'deduction', amount: 4_928, irp5_code: '4102' }],
    }, '2026-03-31', 45);
    expect(amounts).toMatchObject({ paye: 4_928, uifEmployee: 177.12, uifEmployer: 177.12, sdl: 332, cashRemuneration: 34_000, hours: 173.3333 });
  });

  it('works out hours from the employee for payslips generated before hours were stamped', () => {
    const amounts = emp201AmountsFromPayslip({
      id: 'p1', payroll_run_id: 'r1', employee_id: 'e1', total_earnings: 6_500,
      calculation_snapshot: { engine_results: [], period_employment: { periods_per_year: 12, pro_rata_factor: 1 } },
    }, '2026-03-31', 40);
    expect(amounts.hours).toBeCloseTo(173.3333, 3);
    expect(amounts.cashRemuneration).toBe(6_500);
  });

  it('has the right month and tax-year helpers', () => {
    expect(monthBounds('2027-02')).toEqual({ start: '2027-02-01', end: '2027-02-28' });
    expect(previousMonth('2027-01')).toBe('2026-12');
    expect(taxYearLabel('2027-02')).toBe('2026-2027');
    expect(taxYearLabel('2027-03')).toBe('2027-2028');
    expect(() => monthBounds('2027-13')).toThrow();
  });
});

describe('client and server copies', () => {
  it('are identical apart from Deno import extensions', () => {
    for (const file of ['eti.ts', 'emp201.ts']) {
      const client = readFileSync(`src/lib/sars/${file}`, 'utf8').replace(/\r\n/g, '\n');
      const server = readFileSync(`supabase/functions/_shared/sars/${file}`, 'utf8').replace(/\r\n/g, '\n')
        .replace(/(from '\.{1,2}\/[^']+)\.ts'/g, "$1'");
      expect(server, file).toBe(client);
    }
  });
});
