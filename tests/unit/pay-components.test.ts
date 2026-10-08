import { describe, expect, it } from 'vitest';
import {
  RULE_SET_2024_2025,
  RULE_SET_2025_2026,
  RULE_SET_2026_2027,
} from '@/lib/statutoryPayrollEngine/registry';
import { executeStatutoryPipeline } from '@/lib/statutoryPayrollEngine/pipeline';
import { calculateAnnualTax, resolveRebate } from '@/lib/statutoryPayrollEngine/utils';
import {
  PayComponentError,
  assemblePayComponents,
  mergePayComponents,
  payslipEditError,
  type StoredPayComponent,
} from '@/lib/payrollRulesEngine/payComponents';
import * as serverPayComponents from '../../supabase/functions/_shared/payrollRulesEngine/payComponents';
import { RULE_SET_2025_2026 as SERVER_RULE_SET_2025_2026, RULE_SET_2026_2027 as SERVER_RULE_SET_2026_2027 } from '../../supabase/functions/_shared/statutoryPayrollEngine/registry/taxYears';
import { executeStatutoryPipeline as serverPipeline } from '../../supabase/functions/_shared/statutoryPayrollEngine/pipeline';
import { previewEmployeePay } from '@/lib/payrollRulesEngine/previewPayComponents';
import {
  buildConsolidatedJournalPosting,
  verifyConsolidatedJournalPosting,
} from '@/lib/payrollJournal';

const PAY_DATE = '2025-04-25';
const BASIC = 25_000;
const rs = RULE_SET_2025_2026;

function project(components: StoredPayComponent[], monthlyBasic = BASIC) {
  return previewEmployeePay({ monthlyBasic, components, payDate: PAY_DATE });
}

const engine = (result: ReturnType<typeof project>['result'], id: string) =>
  result.engineResults.find((e) => e.engineId === id)!;

function payeOn(taxable: number) {
  return executeStatutoryPipeline({
    employee: { id: 'plain', age: 30 },
    period: { payPeriodStart: PAY_DATE, payPeriodEnd: '2025-04-30', payDate: PAY_DATE },
    grossEarnings: taxable,
    taxableEarnings: taxable,
    ruleSet: rs,
    enabledEngines: { paye: true, uif: true, uif_employer: true, sdl: true, medical_tax_credit: true },
    engineConfig: {},
    companyAnnualRemuneration: 600_000,
  }).engineResults.find((result) => result.engineId === 'paye')?.employeeAmount;
}

/** SARS: PAYE on an annual payment = tax(annual equivalent + payment) − tax(annual equivalent), once. */
function sarsAnnualPaymentTax(monthlyPeriodic: number, payment: number) {
  const rebate = resolveRebate(rs.rebates, undefined);
  const base = monthlyPeriodic * 12;
  const without = Math.max(0, calculateAnnualTax(base, rs.brackets) - rebate);
  const withPayment = Math.max(0, calculateAnnualTax(base + payment, rs.brackets) - rebate);
  return withPayment - without;
}

describe('pay components', () => {
  it('pays a travel allowance in full, taxes 80 percent, and levies UIF/SDL on 80 percent', () => {
    const { assembly, result, cashGross } = project([
      { componentCode: 'travel_allowance', config: { monthlyAllowance: 5000, method: 'deemed_80' } },
    ]);

    expect(assembly.lines).toEqual([
      expect.objectContaining({ description: 'Travel Allowance', type: 'earning', amount: 5000, irp5Code: '3701' }),
    ]);
    expect(cashGross).toBe(BASIC + 5000);
    expect(result.taxableEarnings).toBe(BASIC + 4000);
    expect(engine(result, 'paye').employeeAmount).toBe(payeOn(BASIC + 4000));
    // Fourth Schedule para (cA): 80% of the allowance is remuneration for SDL and UIF.
    expect(engine(result, 'sdl').employerAmount).toBe(290);
    expect(result.netPay).toBeCloseTo(cashGross - result.totalEmployeeDeductions, 2);

    const posting = buildConsolidatedJournalPosting(cashGross, result.netPay, result.totalEmployeeDeductions);
    expect(verifyConsolidatedJournalPosting(posting)).toBe(true);
    expect(posting.wagesDebit).toBe(cashGross);
  });

  it('uses 20 percent for a mainly-business travel allowance and refuses a payroll logbook', () => {
    const { result } = project([
      { componentCode: 'travel_allowance', config: { monthlyAllowance: 5000, method: 'deemed_20' } },
    ]);
    expect(result.taxableEarnings).toBe(BASIC + 1000);
    expect(engine(result, 'sdl').employerAmount).toBe(260);
    expect(() => project([
      { componentCode: 'travel_allowance', config: { monthlyAllowance: 5000, method: 'logbook' } },
    ])).toThrow(/logbook is applied on assessment/);
  });

  it('shows a company car at its full value and taxes 80 percent of it (20 percent at 80%+ business use)', () => {
    const plain = project([]);
    const withCar = project([
      { componentCode: 'fringe_company_car', config: { determinedValue: 100_000 } },
    ]);

    expect(withCar.assembly.lines).toEqual([
      expect.objectContaining({ type: 'taxable_benefit', amount: 3500, irp5Code: '3802' }),
    ]);
    expect(withCar.assembly.lines.some((line) => line.type === 'earning')).toBe(false);
    expect(withCar.cashGross).toBe(BASIC);
    expect(withCar.result.taxableEarnings).toBe(BASIC + 2800);
    expect(engine(withCar.result, 'sdl').employerAmount).toBe(278);
    expect(withCar.result.netPay).toBeLessThan(plain.result.netPay);
    const posting = buildConsolidatedJournalPosting(
      withCar.cashGross,
      withCar.result.netPay,
      withCar.result.totalEmployeeDeductions
    );
    expect(verifyConsolidatedJournalPosting(posting)).toBe(true);
    expect(posting.wagesDebit).toBe(BASIC);

    const business = project([
      { componentCode: 'fringe_company_car', config: { determinedValue: 100_000, mainlyBusinessUse: true, maintenancePlan: true } },
    ]);
    expect(business.assembly.lines[0].amount).toBe(3250);
    expect(business.result.taxableEarnings).toBe(BASIC + 650);
  });

  it('includes other fringe benefits in full for PAYE, UIF and SDL', () => {
    const { result } = project([
      { componentCode: 'fringe_employer_insurance', config: { monthlyPremium: 2000 } },
    ]);
    expect(result.taxableEarnings).toBe(BASIC + 2000);
    expect(engine(result, 'sdl').employerAmount).toBe(270);
  });

  it('exempts subsistence inside the SARS deemed amount and taxes only the excess', () => {
    const basic = 10_000;
    const inside = project([
      { componentCode: 'subsistence', config: { days: 3, amountPaid: 3 * 570 } },
    ], basic);
    expect(inside.assembly.lines[0]).toEqual(expect.objectContaining({ type: 'earning', amount: 1710 }));
    expect(inside.result.taxableEarnings).toBe(basic);
    expect(engine(inside.result, 'uif').breakdown.cappedRemuneration).toBe(basic);

    const above = project([
      { componentCode: 'subsistence', config: { days: 2, amountPaid: 1600 } },
    ], basic);
    expect(above.assembly.lines[0].amount).toBe(1600);
    expect(above.result.taxableEarnings).toBe(basic + 460);
    expect(engine(above.result, 'uif').breakdown.cappedRemuneration).toBe(basic + 460);

    const incidentalOnly = project([
      { componentCode: 'subsistence', config: { days: 2, amountPaid: 1600, incidentalOnly: true } },
    ], basic);
    expect(incidentalOnly.result.taxableEarnings).toBe(basic + 1600 - 2 * 176);
  });

  it('loads the SARS subsistence amounts for each tax year, in both engine copies', () => {
    expect([RULE_SET_2024_2025, RULE_SET_2025_2026, RULE_SET_2026_2027].map((set) => [
      set.subsistenceDomesticDaily,
      set.subsistenceIncidentalDaily,
    ])).toEqual([[548, 169], [570, 176], [595, 184]]);
    expect([SERVER_RULE_SET_2025_2026, SERVER_RULE_SET_2026_2027].map((set) => [
      set.subsistenceDomesticDaily,
      set.subsistenceIncidentalDaily,
    ])).toEqual([[570, 176], [595, 184]]);
  });

  for (const [basic, bonus] of [[25_000, 25_000], [25_000, 100_000], [40_000, 40_000], [5_000, 30_000]]) {
    it(`taxes a R${bonus} bonus on R${basic}/month once, by the SARS difference method`, () => {
      const plain = project([], basic);
      const withBonus = project([{ componentCode: 'bonus', config: { amount: bonus } }], basic);
      const bonusPaye = engine(withBonus.result, 'paye').employeeAmount - engine(plain.result, 'paye').employeeAmount;
      expect(bonusPaye).toBeCloseTo(sarsAnnualPaymentTax(basic, bonus), 1);
      expect(withBonus.result.taxableEarnings).toBe(basic + bonus);
      // One PAYE line at most (none when the year stays under the tax threshold).
      expect(withBonus.result.payslipLines.filter((line) => line.description === 'PAYE'))
        .toHaveLength(engine(withBonus.result, 'paye').employeeAmount > 0 ? 1 : 0);
      expect(withBonus.result.payslipLines.some((line) => line.description === 'Bonus PAYE')).toBe(false);
      expect(withBonus.assembly.lines).toEqual([
        expect.objectContaining({ description: 'Bonus', type: 'earning', amount: bonus, irp5Code: '3605' }),
      ]);
    });
  }

  it('taxes a once-off run input as an annual payment and a monthly package allowance as periodic', () => {
    const onceOff = assemblePayComponents(
      mergePayComponents([], [{ componentCode: 'other_cash', config: { amount: 12_000 } }]),
      rs
    );
    expect(onceOff.nonPeriodicTaxable).toBe(12_000);
    expect(onceOff.lines[0].irp5Code).toBe('3713');

    const monthly = assemblePayComponents(
      mergePayComponents([{ componentCode: 'other_cash', config: { amount: 12_000 } }], []),
      rs
    );
    expect(monthly.nonPeriodicTaxable).toBe(0);

    const nonTaxable = assemblePayComponents(
      [{ componentCode: 'other_cash', config: { amount: 500, taxable: false } }],
      rs
    );
    expect(nonTaxable.lines[0].irp5Code).toBe('3714');
    expect(nonTaxable.remunerationAddition).toBe(0);

    const preview = previewEmployeePay({
      monthlyBasic: BASIC,
      periodInputs: [{ componentCode: 'other_cash', config: { amount: 12_000 } }],
      payDate: PAY_DATE,
    });
    const plain = project([]);
    expect(engine(preview.result, 'paye').employeeAmount - engine(plain.result, 'paye').employeeAmount)
      .toBeCloseTo(sarsAnnualPaymentTax(BASIC, 12_000), 1);
  });

  it('lets a run input replace the package component and previews both together', () => {
    const merged = mergePayComponents(
      [
        { componentCode: 'travel_allowance', config: { monthlyAllowance: 5000 } },
        { componentCode: 'bonus', config: { amount: 1000 } },
      ],
      [{ componentCode: 'bonus', config: { amount: 9000 } }]
    );
    expect(merged.map((row) => [row.componentCode, row.source])).toEqual([
      ['travel_allowance', 'package'],
      ['bonus', 'period'],
    ]);
    const preview = previewEmployeePay({
      monthlyBasic: BASIC,
      packageComponents: [{ componentCode: 'travel_allowance', config: { monthlyAllowance: 5000 } }],
      periodInputs: [{ componentCode: 'bonus', config: { amount: 9000 } }],
      payDate: PAY_DATE,
    });
    expect(preview.cashGross).toBe(BASIC + 5000 + 9000);
  });

  it('refuses entries that cannot be calculated instead of dropping them', () => {
    const bad: Array<[StoredPayComponent, RegExp]> = [
      [{ componentCode: 'bonus', config: { amount: -500 } }, /cannot be negative/],
      [{ componentCode: 'bonus', config: { amount: 'abc' } }, /must be a number/],
      [{ componentCode: 'subsistence', config: { days: 2.5, amountPaid: 1000 } }, /whole number/],
      [{ componentCode: 'subsistence', config: { days: 40, amountPaid: 1000 } }, /whole number/],
      [{ componentCode: 'subsistence', config: { days: 2 } }, /amount paid/],
      [{ componentCode: 'fringe_low_interest_loan', config: { loanBalance: 1000, actualInterestRateAnnual: 5 } }, /fraction/],
      [{ componentCode: 'mystery', config: {} }, /Unknown pay component/],
      [{ componentCode: 'subsistence', config: { days: 2, amountPaid: 1000, domestic: false } }, /Foreign subsistence/],
    ];
    for (const [row, message] of bad) {
      expect(() => assemblePayComponents([row], rs), JSON.stringify(row)).toThrow(PayComponentError);
      expect(() => assemblePayComponents([row], rs)).toThrow(message);
    }
    expect(() => assemblePayComponents(
      [{ componentCode: 'subsistence', config: { days: 2, amountPaid: 1000 } }],
      { ...rs, subsistenceDomesticDaily: 0 }
    )).toThrow(/not loaded/);
  });

  it('leaves pay without components exactly as before', () => {
    const { result, assembly } = project([]);
    expect(assembly.lines).toEqual([]);
    expect(assembly.nonPeriodicTaxable).toBe(0);
    expect(engine(result, 'paye').employeeAmount).toBe(payeOn(BASIC));
    expect(engine(result, 'sdl').employerAmount).toBe(250);
  });

  it('gives the same answer from the server engine copy', () => {
    const rows: StoredPayComponent[] = [
      { componentCode: 'travel_allowance', config: { monthlyAllowance: 5000 } },
      { componentCode: 'bonus', config: { amount: 20_000 } },
      { componentCode: 'fringe_company_car', config: { determinedValue: 300_000 } },
      { componentCode: 'subsistence', config: { days: 4, amountPaid: 3000 } },
    ];
    const client = assemblePayComponents(rows, rs);
    const server = serverPayComponents.assemblePayComponents(rows, SERVER_RULE_SET_2025_2026);
    expect(server).toEqual(client);

    const run = (pipeline: typeof executeStatutoryPipeline, ruleSet: typeof rs, assembly: typeof client) => pipeline({
      employee: { id: 'x', age: 40 },
      period: { payPeriodStart: PAY_DATE, payPeriodEnd: PAY_DATE, payDate: PAY_DATE },
      grossEarnings: BASIC + assembly.cashGross,
      taxableEarnings: BASIC + assembly.taxableBaseAddition,
      nonPeriodicTaxable: assembly.nonPeriodicTaxable,
      uifRemuneration: BASIC + assembly.remunerationAddition,
      sdlRemuneration: BASIC + assembly.remunerationAddition,
      enabledEngines: { paye: true, uif: true, uif_employer: true, sdl: true, ...assembly.enabledEngines },
      engineConfig: {},
      components: assembly.components,
      ruleSet,
      companyAnnualRemuneration: 600_000,
    });
    const a = run(executeStatutoryPipeline, rs, client);
    const b = run(serverPipeline as typeof executeStatutoryPipeline, SERVER_RULE_SET_2025_2026, server);
    expect(b.netPay).toBe(a.netPay);
    expect(b.totalEmployeeDeductions).toBe(a.totalEmployeeDeductions);
    expect(b.totalEmployerContributions).toBe(a.totalEmployerContributions);
  });

  it('is idempotent and refuses a direct PAYE edit', () => {
    const first = assemblePayComponents([{ componentCode: 'bonus', config: { amount: 10_000 } }], rs);
    const second = assemblePayComponents([{ componentCode: 'bonus', config: { amount: 10_000 } }], rs);
    expect(second).toEqual(first);

    const existing = [
      { description: 'Basic Salary', type: 'earning', amount: BASIC },
      { description: 'PAYE', type: 'deduction', amount: 3119.08 },
    ];
    expect(payslipEditError(existing, existing)).toBeNull();
    expect(payslipEditError(existing, [
      existing[0],
      { description: 'PAYE', type: 'deduction', amount: 1 },
    ])).toMatch(/read-only/);
  });
});
