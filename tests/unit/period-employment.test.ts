import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aggregateEmployeeYtd,
  applyProRata,
  birthDateFromSaId,
  coveredDays,
  employmentProRataFactor,
  estimateCompanyAnnualRemuneration,
  aggregateCompanyRemunerationYtd,
  inclusiveDayCount,
  isEmployeeActiveInPeriod,
  proRatePackageConfig,
  resolveAgeFromSaId,
  resolveEmployeeAge,
  resolveEmployeeAgeDetail,
  snapshotSdlRemuneration,
  taxYearEnd,
} from '@/lib/payrollRulesEngine/periodEmployment';
import { RULE_SET_2026_2027 } from '@/lib/statutoryPayrollEngine/registry';
import { executeStatutoryPipeline } from '@/lib/statutoryPayrollEngine/pipeline';
import { calculateAnnualTax, resolveRebate } from '@/lib/statutoryPayrollEngine/utils';

/** A valid 13-digit SA ID for a birth date (YYMMDD), with a correct Luhn check digit. */
function saId(yymmdd: string, serial = '5800', citizen = '0', race = '8'): string {
  const body = `${yymmdd}${serial}${citizen}${race}`;
  for (let check = 0; check <= 9; check += 1) {
    const candidate = `${body}${check}`;
    let sum = 0;
    for (let i = 0; i < 13; i += 1) {
      let d = Number(candidate[12 - i]);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    if (sum % 10 === 0) return candidate;
  }
  throw new Error('no check digit');
}

const PAY_DATE = '2026-11-30';
const rs = RULE_SET_2026_2027;

function paye(age: number | undefined, monthly: number) {
  return executeStatutoryPipeline({
    employee: { id: 'x', age },
    period: { payPeriodStart: '2026-11-01', payPeriodEnd: PAY_DATE, payDate: PAY_DATE },
    grossEarnings: monthly,
    taxableEarnings: monthly,
    enabledEngines: { paye: true },
    engineConfig: {},
    ruleSet: rs,
  }).engineResults.find((e) => e.engineId === 'paye')!.employeeAmount;
}

describe('age for PAYE rebates', () => {
  it('validates the SA ID check digit and birth date', () => {
    const good = saId('620115');
    expect(birthDateFromSaId(good, PAY_DATE)).toBe('1962-01-15');
    const typo = good.slice(0, 12) + String((Number(good[12]) + 1) % 10);
    expect(birthDateFromSaId(typo, PAY_DATE)).toBeUndefined();
    expect(birthDateFromSaId(saId('620231'), PAY_DATE)).toBeUndefined(); // 31 Feb
    expect(birthDateFromSaId('A1234567', PAY_DATE)).toBeUndefined(); // passport
  });

  it('chooses the century that gives a working-age person', () => {
    expect(birthDateFromSaId(saId('050301'), PAY_DATE)).toBe('2005-03-01');
    expect(birthDateFromSaId(saId('200301'), PAY_DATE)).toBe('1920-03-01');
  });

  it('takes the age on the last day of the tax year (end of February)', () => {
    expect(taxYearEnd('2026-11-30')).toBe('2027-02-28');
    expect(taxYearEnd('2027-02-10')).toBe('2027-02-28');
    expect(taxYearEnd('2027-03-01')).toBe('2028-02-29'); // leap year

    // Turns 65 in January 2027: 64 on the November pay date, 65 by 28 Feb 2027.
    const turning = resolveEmployeeAgeDetail({ id_number: saId('620115') }, PAY_DATE);
    expect(turning).toMatchObject({ age: 65, asAt: '2027-02-28', source: 'id_number' });
    expect(resolveAgeFromSaId(saId('620115'), PAY_DATE)).toBe(64);

    // Turns 65 in March 2027 — the next tax year — so no secondary rebate yet.
    expect(resolveEmployeeAge({ id_number: saId('620315') }, PAY_DATE)).toBe(64);
  });

  it('gives the full secondary rebate in the year the employee turns 65', () => {
    const age = resolveEmployeeAge({ id_number: saId('620115') }, PAY_DATE);
    const monthly = 25_000;
    const expectedAnnual = calculateAnnualTax(monthly * 12, rs.brackets) - resolveRebate(rs.rebates, 65, { secondaryAge: rs.rebateSecondaryAge, tertiaryAge: rs.rebateTertiaryAge });
    expect(paye(age, monthly)).toBeCloseTo(expectedAnnual / 12, 1);
    expect(paye(age, monthly)).toBeLessThan(paye(64, monthly));
  });

  it('prefers a recorded date of birth, then a valid ID, and says why when neither works', () => {
    expect(resolveEmployeeAgeDetail({ date_of_birth: '1950-06-01', id_number: saId('900101') }, PAY_DATE))
      .toMatchObject({ age: 76, source: 'date_of_birth' });
    const bad = resolveEmployeeAgeDetail({ id_number: '6201155800081' }, PAY_DATE);
    expect(bad.age).toBeUndefined();
    expect(bad.warning).toMatch(/not a valid SA ID/);
    expect(resolveEmployeeAgeDetail({}, PAY_DATE).warning).toMatch(/No date of birth/);
  });
});

describe('who is paid and how much of the period', () => {
  const START = '2026-11-01';
  const END = '2026-11-30';

  it('filters by the pay period, not today', () => {
    expect(isEmployeeActiveInPeriod({ start_date: '2024-01-01', end_date: '2026-10-31' }, START, END)).toBe(false);
    expect(isEmployeeActiveInPeriod({ start_date: '2024-01-01', end_date: '2026-11-15' }, START, END)).toBe(true);
    expect(isEmployeeActiveInPeriod({ start_date: '2026-12-01' }, START, END)).toBe(false);
  });

  it('pro-rates joiners and leavers by calendar days', () => {
    expect(inclusiveDayCount(START, END)).toBe(30);
    const joiner = employmentProRataFactor({ start_date: '2026-11-16' }, START, END);
    expect(joiner).toBeCloseTo(15 / 30, 6);
    expect(applyProRata(30_000, joiner)).toBe(15_000);
    expect(employmentProRataFactor({ start_date: '2020-01-01', end_date: '2026-11-10' }, START, END)).toBeCloseTo(10 / 30, 6);
    expect(employmentProRataFactor({ start_date: '2020-01-01' }, START, END)).toBe(1);
  });

  it('pro-rates only package amounts that accrue with time', () => {
    const half = 0.5;
    expect(proRatePackageConfig('travel_allowance', { monthlyAllowance: 5000 }, half)).toEqual({ monthlyAllowance: 2500 });
    expect(proRatePackageConfig('fringe_company_car', { determinedValue: 300_000 }, half)).toEqual({ determinedValue: 150_000 });
    expect(proRatePackageConfig('fringe_low_interest_loan', { loanBalance: 100_000, actualInterestRateAnnual: 0.02 }, half))
      .toEqual({ loanBalance: 50_000, actualInterestRateAnnual: 0.02 });
    expect(proRatePackageConfig('other_cash', { amount: 1000 }, half)).toEqual({ amount: 500 });
    // Not time-based: agreed bonus, actual subsistence, premium actually paid, once-off cash.
    expect(proRatePackageConfig('bonus', { amount: 10_000 }, half)).toEqual({ amount: 10_000 });
    expect(proRatePackageConfig('subsistence', { days: 2, amountPaid: 1000 }, half)).toEqual({ days: 2, amountPaid: 1000 });
    expect(proRatePackageConfig('fringe_employer_insurance', { monthlyPremium: 800 }, half)).toEqual({ monthlyPremium: 800 });
    expect(proRatePackageConfig('other_cash', { amount: 1000, onceOff: true }, half)).toEqual({ amount: 1000, onceOff: true });
    expect(proRatePackageConfig('travel_allowance', { monthlyAllowance: 5000 }, 1)).toEqual({ monthlyAllowance: 5000 });
  });
});

describe('year to date', () => {
  const slip = (employee: string, run: string, payDate: string, taxable: number, payeAmount: number) => ({
    employee_id: employee,
    payroll_run_id: run,
    pay_date: payDate,
    calculation_snapshot: {
      taxable_earnings: taxable,
      gross_earnings: taxable,
      engine_results: [{ engine_id: 'paye', employee_amount: payeAmount }],
    },
  });

  it('sums taxable income and PAYE, counting a supplementary run in the same month once', () => {
    const ytd = aggregateEmployeeYtd([
      slip('e1', 'sep', '2026-09-25', 25_000, 3_000),
      slip('e1', 'oct', '2026-10-25', 25_000, 3_000),
      slip('e1', 'oct-bonus', '2026-10-30', 10_000, 2_600),
      slip('e2', 'oct', '2026-10-25', 9_000, 0),
    ], 'e1');
    expect(ytd).toEqual({ taxableIncome: 60_000, payePaid: 8_600, grossEarnings: 60_000, periodsProcessed: 2 });
  });

  it('feeds the cumulative PAYE method, which corrects earlier under-deduction', () => {
    const base = {
      employee: { id: 'e1', age: 40 },
      period: { payPeriodStart: '2026-11-01', payPeriodEnd: PAY_DATE, payDate: PAY_DATE },
      grossEarnings: 30_000,
      taxableEarnings: 30_000,
      enabledEngines: { paye: true },
      engineConfig: {},
      ruleSet: rs,
    };
    const flat = executeStatutoryPipeline(base).engineResults.find((e) => e.engineId === 'paye')!;
    const underpaid = executeStatutoryPipeline({ ...base, ytd: { taxableIncome: 240_000, payePaid: 0, periodsProcessed: 8 } })
      .engineResults.find((e) => e.engineId === 'paye')!;
    expect(underpaid.employeeAmount).toBeGreaterThan(flat.employeeAmount);
    expect(underpaid.auditTrail.some((s) => s.step === 'ytd_adjustment')).toBe(true);
  });
});

describe('SDL exemption estimate', () => {
  it('counts overlapping periods once', () => {
    expect(coveredDays([
      { pay_period_start: '2026-10-01', pay_period_end: '2026-10-31' },
      { pay_period_start: '2026-10-01', pay_period_end: '2026-10-31' },
      { pay_period_start: '2026-11-01', pay_period_end: '2026-11-30' },
    ])).toBe(61);
  });

  it('annualises a weekly payroll by days, not by run count', () => {
    // Four weekly runs of R10 000 plus this week: R50 000 over 35 days ≈ R521 000 a year — not exempt.
    const weekly = estimateCompanyAnnualRemuneration({
      priorRemuneration: 40_000,
      currentRemuneration: 10_000,
      coveredDays: 35,
    });
    expect(weekly).toBeGreaterThan(rs.sdlExemptionAnnualRemuneration);
    // The previous estimate, (40 000 / 4 runs) × 12 = R120 000, would have exempted it.
    expect((40_000 / 4) * 12).toBeLessThan(rs.sdlExemptionAnnualRemuneration);
  });

  it('exempts a small employer and levies a larger one', () => {
    const run = (annual: number) => executeStatutoryPipeline({
      employee: { id: 'x', age: 30 },
      period: { payPeriodStart: '2026-11-01', payPeriodEnd: PAY_DATE, payDate: PAY_DATE },
      grossEarnings: 20_000,
      taxableEarnings: 20_000,
      enabledEngines: { sdl: true },
      engineConfig: {},
      ruleSet: rs,
      companyAnnualRemuneration: annual,
    }).engineResults.find((e) => e.engineId === 'sdl')!;
    const small = estimateCompanyAnnualRemuneration({ priorRemuneration: 0, currentRemuneration: 20_000, coveredDays: 30 });
    expect(small).toBeCloseTo(243_333.33, 2);
    expect(run(small).skipped).toBe(true);
    expect(run(600_000).employerAmount).toBe(200);
  });

  it('uses the SDL remuneration each payslip recorded, falling back for older payslips', () => {
    expect(snapshotSdlRemuneration({ gross_earnings: 30_000, period_employment: { sdl_remuneration: 34_000 } })).toBe(34_000);
    expect(snapshotSdlRemuneration({ gross_earnings: 30_000, engine_results: [{ engine_id: 'sdl', breakdown: { remuneration: 33_000 } }] })).toBe(33_000);
    expect(snapshotSdlRemuneration({ gross_earnings: 30_000 })).toBe(30_000);
    expect(aggregateCompanyRemunerationYtd([
      { employee_id: 'a', payroll_run_id: 'r', calculation_snapshot: { gross_earnings: 10_000 } },
      { employee_id: 'b', payroll_run_id: 'r', calculation_snapshot: { gross_earnings: 5_000, period_employment: { sdl_remuneration: 6_000 } } },
    ])).toBe(16_000);
  });
});

describe('engine copies', () => {
  it('keeps the server helper identical to the client helper', () => {
    const client = readFileSync('src/lib/payrollRulesEngine/periodEmployment.ts', 'utf8').replace(/\r\n/g, '\n');
    const server = readFileSync('supabase/functions/_shared/payrollRulesEngine/periodEmployment.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(server).toBe(client);
  });
});

describe('pay frequency', () => {
  it('pays a salary per pay period of the run', async () => {
    const { salaryForPayPeriod, periodsPerYearFor, monthlyAmountForPayPeriod } = await import('@/lib/payrollRulesEngine/paye');
    expect(periodsPerYearFor('weekly')).toBe(52);
    expect(periodsPerYearFor('fortnightly')).toBe(26);
    expect(periodsPerYearFor(undefined)).toBe(12);
    expect(salaryForPayPeriod(5000, 'weekly', 52)).toBe(5000); // weekly salary on a weekly run, as is
    expect(salaryForPayPeriod(5000, 'weekly', 12)).toBe(21_666.67); // only on a monthly run
    expect(salaryForPayPeriod(26_000, 'monthly', 26)).toBe(12_000);
    expect(monthlyAmountForPayPeriod(1300, 52)).toBe(300);
    expect(monthlyAmountForPayPeriod(1300, 12)).toBe(1300);
  });

  it('annualises weekly PAYE over 52 weeks (SARS)', () => {
    const weekly = executeStatutoryPipeline({
      employee: { id: 'w', age: 30 },
      period: { payPeriodStart: '2026-11-02', payPeriodEnd: '2026-11-08', payDate: '2026-11-08' },
      grossEarnings: 5000,
      taxableEarnings: 5000,
      enabledEngines: { paye: true },
      engineConfig: {},
      ruleSet: rs,
      periodsPerYear: 52,
    }).engineResults.find((e) => e.engineId === 'paye')!;
    const rebate = resolveRebate(rs.rebates, 30, { secondaryAge: rs.rebateSecondaryAge, tertiaryAge: rs.rebateTertiaryAge });
    const expected = (calculateAnnualTax(5000 * 52, rs.brackets) - rebate) / 52;
    expect(weekly.employeeAmount).toBeCloseTo(expected, 1);
  });

  it('shares the monthly UIF ceiling across the weekly runs of a month', () => {
    const uifFor = (monthToDate: number) => executeStatutoryPipeline({
      employee: { id: 'w', age: 30 },
      period: { payPeriodStart: '2026-11-02', payPeriodEnd: '2026-11-08', payDate: '2026-11-08' },
      grossEarnings: 5000,
      taxableEarnings: 5000,
      uifRemunerationMonthToDate: monthToDate,
      enabledEngines: { uif: true },
      engineConfig: {},
      ruleSet: rs,
      periodsPerYear: 52,
    }).engineResults.find((e) => e.engineId === 'uif')!.employeeAmount;
    const weeks = [uifFor(0), uifFor(5000), uifFor(10_000), uifFor(15_000), uifFor(20_000)];
    expect(weeks).toEqual([50, 50, 50, 27.12, 0]);
    expect(weeks.reduce((s, v) => s + v, 0)).toBeCloseTo(rs.uifCeilingMonthly * rs.uifRate, 2);
  });

  it('reads UIF already counted this month from earlier payslips', async () => {
    const { uifRemunerationMonthToDate } = await import('@/lib/payrollRulesEngine/periodEmployment');
    const slip = (date: string, counted: number) => ({
      employee_id: 'w', payroll_run_id: date, pay_date: date,
      calculation_snapshot: { engine_results: [{ engine_id: 'uif', breakdown: { cappedRemuneration: counted } }] },
    });
    expect(uifRemunerationMonthToDate([slip('2026-11-08', 5000), slip('2026-11-15', 5000), slip('2026-10-31', 5000)], 'w', '2026-11-22')).toBe(10_000);
  });

  it('counts weekly YTD periods by pay date', () => {
    const slips = ['2026-11-06', '2026-11-13', '2026-11-20'].map((d) => ({
      employee_id: 'w', payroll_run_id: d, pay_date: d,
      calculation_snapshot: { taxable_earnings: 5000, gross_earnings: 5000, engine_results: [] },
    }));
    expect(aggregateEmployeeYtd(slips, 'w', 52).periodsProcessed).toBe(3);
    expect(aggregateEmployeeYtd(slips, 'w', 12).periodsProcessed).toBe(1);
  });

  it('converts monthly package amounts to the pay period', async () => {
    const { packageConfigForPayPeriod } = await import('@/lib/payrollRulesEngine/periodEmployment');
    expect(packageConfigForPayPeriod('travel_allowance', { monthlyAllowance: 5200 }, 52)).toEqual({ monthlyAllowance: 1200 });
    expect(packageConfigForPayPeriod('fringe_employer_insurance', { monthlyPremium: 2600 }, 26)).toEqual({ monthlyPremium: 1200 });
    expect(packageConfigForPayPeriod('bonus', { amount: 5000 }, 52)).toEqual({ amount: 5000 });
    expect(packageConfigForPayPeriod('travel_allowance', { monthlyAllowance: 5200 }, 12)).toEqual({ monthlyAllowance: 5200 });
  });
});

describe('working-day pro-rata', () => {
  it('knows the SA public holidays, Easter and the Sunday rule', async () => {
    const { saPublicHolidays } = await import('@/lib/payrollRulesEngine/periodEmployment');
    const h2026 = saPublicHolidays(2026);
    expect(h2026.has('2026-04-03')).toBe(true); // Good Friday (Easter 5 April 2026)
    expect(h2026.has('2026-04-06')).toBe(true); // Family Day
    const h2027 = saPublicHolidays(2027);
    expect(h2027.has('2027-03-26')).toBe(true); // Good Friday (Easter 28 March 2027)
    expect(h2027.has('2027-03-29')).toBe(true); // Family Day
    expect(h2027.has('2027-12-27')).toBe(true); // 26 Dec 2027 is a Sunday, so the Monday is off
  });

  it('counts working days and pro-rates by them when the company chooses to', async () => {
    const { workingDayCount } = await import('@/lib/payrollRulesEngine/periodEmployment');
    expect(workingDayCount('2026-11-01', '2026-11-30')).toBe(21);
    const calendar = employmentProRataFactor({ start_date: '2026-11-16' }, '2026-11-01', '2026-11-30', 'calendar_days');
    const working = employmentProRataFactor({ start_date: '2026-11-16' }, '2026-11-01', '2026-11-30', 'working_days');
    expect(calendar).toBeCloseTo(15 / 30, 6);
    expect(working).toBeCloseTo(11 / 21, 6);
  });
});

describe('leave paid out', () => {
  it('is an earning taxed once as an annual payment, and only as a run input', async () => {
    const { assemblePayComponents, PayComponentError } = await import('@/lib/payrollRulesEngine/payComponents');
    const { previewEmployeePay } = await import('@/lib/payrollRulesEngine/previewPayComponents');
    const byDays = assemblePayComponents([{ componentCode: 'leave_payout', config: { days: 10, dailyRate: 1500 }, source: 'period' }], rs);
    expect(byDays.lines).toEqual([expect.objectContaining({ description: 'Leave Pay (10 days)', amount: 15_000, irp5Code: '3605', type: 'earning' })]);
    expect(byDays.nonPeriodicTaxable).toBe(15_000);
    expect(byDays.remunerationAddition).toBe(15_000);
    expect(() => assemblePayComponents([{ componentCode: 'leave_payout', config: { amount: 1000 }, source: 'package' }], rs)).toThrow(PayComponentError);

    const plain = previewEmployeePay({ monthlyBasic: 30_000, components: [], payDate: PAY_DATE });
    const withLeave = previewEmployeePay({ monthlyBasic: 30_000, periodInputs: [{ componentCode: 'leave_payout', config: { amount: 15_000 } }], payDate: PAY_DATE });
    const rebate = resolveRebate(rs.rebates, undefined, { secondaryAge: rs.rebateSecondaryAge, tertiaryAge: rs.rebateTertiaryAge });
    const sars = (calculateAnnualTax(360_000 + 15_000, rs.brackets) - rebate) - (calculateAnnualTax(360_000, rs.brackets) - rebate);
    const leavePaye = withLeave.result.engineResults.find((e) => e.engineId === 'paye')!.employeeAmount
      - plain.result.engineResults.find((e) => e.engineId === 'paye')!.employeeAmount;
    expect(leavePaye).toBeCloseTo(sars, 1);
  });
});
