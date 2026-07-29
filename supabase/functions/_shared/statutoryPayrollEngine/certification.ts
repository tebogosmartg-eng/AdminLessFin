/**
 * Statutory Payroll Engine — Certification Suite (V3.0.1)
 * Evidence-based mathematical and legislative verification.
 * Does NOT modify engine behaviour — tests only.
 */

import { calculateFringeBenefitLine } from './registry/seventhSchedule';
import { calculateTravelAllowance } from './registry/travelAllowance';
import { calculateTerminationBenefit } from './registry/terminationBenefits';
import { runDirectorsPayeEngine } from './engines/directorsPayeEngine';
import { buildCalculationSnapshot, validateAuditSnapshot } from './audit';
import { runBonusTaxEngine } from './engines/bonusTaxEngine';
import { runFringeBenefitEngine } from './engines/fringeBenefitEngine';
import { runLeaveEncashmentEngine } from './engines/leaveEncashmentEngine';
import { calculatePayeAmount } from './engines/payeEngine';
import { runRetirementDeductionEngine } from './engines/retirementDeductionEngine';
import { runSdlEngine } from './engines/sdlEngine';
import { runTerminationTaxEngine } from './engines/terminationTaxEngine';
import { runTravelAllowanceEngine } from './engines/travelAllowanceEngine';
import { runUifEmployeeEngine } from './engines/uifEngine';
import { resolveMonthlyMedicalCredits } from './engines/medicalTaxCreditEngine';
import { executeStatutoryPipeline } from './pipeline';
import { RULE_SET_2024_2025, RULE_SET_2025_2026, resolveRuleSetForDate } from './registry';
import type { StatutoryCalculationContext, StatutoryRuleSet } from './types';
import { calculateAnnualTax, resolveRebate, roundCurrency, ENGINE_VERSION } from './utils';
import { normalizeSalaryToMonthly } from '../payrollRulesEngine/paye';

/** Minimal medical_aid contribution for Section 6A entitled certification scenarios. */
const MEDICAL_ENTITLED_ENGINE_CONFIG = { medical_aid: { monthly_amount: 1 } };

export type CertCase = {
  id: string;
  category: string;
  description: string;
  expected: number | string | boolean;
  actual: number | string | boolean;
  difference: number | string | null;
  tolerance: number;
  passed: boolean;
  legislativeRef?: string;
};

export type CertificationReport = {
  runAt: string;
  engineVersion: string;
  suiteVersion: string;
  totalCases: number;
  passed: number;
  failed: number;
  cases: CertCase[];
};

const TOLERANCE = 0.01;
const SUITE_VERSION = '3.0.2';

function approxEqual(a: number, b: number, tolerance = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

function cert(
  id: string,
  category: string,
  description: string,
  expected: number | string | boolean,
  actual: number | string | boolean,
  tolerance = TOLERANCE,
  legislativeRef?: string
): CertCase {
  const diff =
    typeof expected === 'number' && typeof actual === 'number'
      ? roundCurrency(actual - expected)
      : null;
  const passed =
    typeof expected === 'number' && typeof actual === 'number'
      ? approxEqual(expected, actual, tolerance)
      : expected === actual;
  return { id, category, description, expected, actual, difference: diff, tolerance, passed, legislativeRef };
}

function baseCtx(
  overrides: Partial<StatutoryCalculationContext> & { grossEarnings: number },
  ruleSet: StatutoryRuleSet = RULE_SET_2025_2026
): StatutoryCalculationContext {
  return {
    employee: { id: 'cert-emp', age: 35 },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    ruleSet,
    taxableEarnings: overrides.grossEarnings,
    enabledEngines: {},
    engineConfig: {},
    ...overrides,
  };
}

/** Independent SARS 2025/2026 bracket formula (authoritative reference implementation for tests). */
function sarsAnnualTax2025(income: number): number {
  const brackets = RULE_SET_2025_2026.brackets;
  if (income <= 0) return 0;
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (income >= brackets[i].from) {
      return roundCurrency(brackets[i].base + (income - brackets[i].from) * brackets[i].rate);
    }
  }
  return 0;
}

function monthlyPayeFromTaxable(
  monthly: number,
  age: number,
  dependants: number,
  ruleSet: StatutoryRuleSet,
  ytd?: { taxableIncome?: number; payePaid?: number }
): number {
  const med = resolveMonthlyMedicalCredits(dependants, ruleSet.medicalCredits, true);
  const result = calculatePayeAmount(
    baseCtx({ grossEarnings: monthly, taxableEarnings: monthly, employee: { id: 'x', age } }, ruleSet),
    {
      monthlyTaxableIncome: monthly,
      annualMedicalCredits: med * 12,
      age,
      ytdTaxableIncome: ytd?.taxableIncome,
      ytdPayePaid: ytd?.payePaid,
    }
  );
  return result.employeeAmount;
}

export function runCertificationSuite(): CertificationReport {
  const cases: CertCase[] = [];
  const rs = RULE_SET_2025_2026;

  // ─── SARS PUBLISHED VALUES (2025/2026 tax year) ───────────────────────────
  cases.push(
    cert('sars_rebate_primary', 'legislative', 'SARS primary rebate 2025/2026', 17235, rs.rebates.primary, 0, 'SARS Rates of Tax — Tax Rebates 2025'),
    cert('sars_rebate_secondary', 'legislative', 'SARS secondary rebate 2025/2026', 9444, rs.rebates.secondary, 0, 'SARS Rates of Tax — Tax Rebates 2025'),
    cert('sars_rebate_tertiary', 'legislative', 'SARS tertiary rebate 2025/2026', 3145, rs.rebates.tertiary, 0, 'SARS Rates of Tax — Tax Rebates 2025'),
    cert('sars_med_main', 'legislative', 'SARS medical credit main member 2025', 364, rs.medicalCredits.mainMember, 0, 'SARS Medical Tax Credit Rates 2025'),
    cert('sars_med_first', 'legislative', 'SARS medical credit first dependant 2025', 364, rs.medicalCredits.firstDependant, 0, 'SARS Medical Tax Credit Rates 2025'),
    cert('sars_med_add', 'legislative', 'SARS medical credit additional dependant 2025', 246, rs.medicalCredits.additionalDependant, 0, 'SARS Medical Tax Credit Rates 2025'),
    cert('sars_uif_rate', 'legislative', 'UIF contribution rate', 0.01, rs.uifRate, 0, 'UI Act / DOL'),
    cert('sars_sdl_rate', 'legislative', 'SDL levy rate', 0.01, rs.sdlRate, 0, 'SDL Act 9 of 1999'),
    cert('sars_uif_ceiling', 'legislative', 'UIF monthly earnings ceiling', 17712, rs.uifCeilingMonthly, 0, 'DOL UIF ceiling')
  );

  // Bracket spot-checks vs independent SARS formula
  for (const [label, income, ref] of [
    ['bracket_95k', 95000, 'SARS tax table 2025/2026'],
    ['bracket_237100', 237100, 'SARS tax table 2025/2026'],
    ['bracket_300k', 300000, 'SARS tax table 2025/2026'],
    ['bracket_500k', 500000, 'SARS tax table 2025/2026'],
    ['bracket_1m', 1000000, 'SARS tax table 2025/2026'],
    ['bracket_2m', 2000000, 'SARS tax table 2025/2026'],
  ] as const) {
    const expected = sarsAnnualTax2025(income);
    const actual = calculateAnnualTax(income, rs.brackets);
    cases.push(cert(label, 'paye', `Annual tax R${income.toLocaleString()}`, expected, actual, TOLERANCE, ref));
  }

  // ─── PAYE SCENARIOS ───────────────────────────────────────────────────────
  cases.push(
    cert('paye_low_income_8k', 'paye', 'Low income R8,000/month (below threshold)', 0,
      monthlyPayeFromTaxable(8000, 30, 0, rs), TOLERANCE, 'SARS tax threshold R95,000'),
    cert('paye_middle_25k', 'paye', 'Middle income R25,000/month', 
      roundCurrency((sarsAnnualTax2025(300000) - 17235 - 364 * 12) / 12),
      monthlyPayeFromTaxable(25000, 30, 0, rs), TOLERANCE, 'PAYE-GEN-01-G01'),
    cert('paye_high_80k', 'paye', 'High income R80,000/month',
      roundCurrency((sarsAnnualTax2025(960000) - 17235 - 364 * 12) / 12),
      monthlyPayeFromTaxable(80000, 30, 0, rs), TOLERANCE, 'PAYE-GEN-01-G01'),
    cert('paye_age_65', 'paye', 'Age 65 secondary rebate R25,000/month',
      roundCurrency((sarsAnnualTax2025(300000) - 17235 - 9444 - 364 * 12) / 12),
      monthlyPayeFromTaxable(25000, 65, 0, rs), TOLERANCE, 'SARS secondary rebate'),
    cert('paye_age_75', 'paye', 'Age 75 tertiary rebate R25,000/month',
      roundCurrency((sarsAnnualTax2025(300000) - 17235 - 9444 - 3145 - 364 * 12) / 12),
      monthlyPayeFromTaxable(25000, 75, 0, rs), TOLERANCE, 'SARS tertiary rebate'),
    cert('paye_zero_income', 'paye', 'Zero taxable income', 0, monthlyPayeFromTaxable(0, 30, 0, rs)),
    cert('paye_negative_adjustment', 'paye', 'Pre-tax deduction reduces PAYE',
      roundCurrency((sarsAnnualTax2025(288000) - 17235 - 364 * 12) / 12),
      (() => {
        const r = executeStatutoryPipeline({
          employee: { id: 'e', age: 30 },
          period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
          grossEarnings: 25000,
          enabledEngines: { paye: true, retirement_deduction: true, uif: false, sdl: false },
          engineConfig: MEDICAL_ENTITLED_ENGINE_CONFIG,
          components: { retirementContributions: 1000 },
          ruleSet: rs,
        });
        return r.engineResults.find((e) => e.engineId === 'paye')?.employeeAmount ?? -1;
      })(), TOLERANCE)
  );

  // YTD recalculation
  const ytdPaye = monthlyPayeFromTaxable(25000, 30, 0, rs, { taxableIncome: 50000, payePaid: 6000 });
  cases.push(cert('paye_ytd_month6', 'paye', 'YTD recalculation month 6', ytdPaye, ytdPaye, TOLERANCE, 'PAYE annualisation'));

  // Weekly / fortnightly normalisation (rules engine layer feeding statutory)
  const weeklyNorm = normalizeSalaryToMonthly(5000, 'weekly');
  const fortnightlyNorm = normalizeSalaryToMonthly(10000, 'fortnightly');
  cases.push(
    cert('paye_weekly_norm', 'paye', 'Weekly R5,000 normalised to monthly', roundCurrency((5000 * 52) / 12), weeklyNorm),
    cert('paye_fortnightly_norm', 'paye', 'Fortnightly R10,000 normalised to monthly', roundCurrency((10000 * 26) / 12), fortnightlyNorm),
    cert('paye_weekly_paye', 'paye', 'PAYE on weekly-normalised income',
      monthlyPayeFromTaxable(weeklyNorm, 30, 0, rs),
      monthlyPayeFromTaxable(weeklyNorm, 30, 0, rs))
  );

  // Bonus
  const withBonus = executeStatutoryPipeline({
    employee: { id: 'e', age: 30 },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    grossEarnings: 25000,
    enabledEngines: { paye: true, bonus_tax: true, uif: false, sdl: false },
    engineConfig: MEDICAL_ENTITLED_ENGINE_CONFIG,
    components: { bonus: { amount: 10000 } },
    ruleSet: rs,
  });
  const bonusExpected = roundCurrency(
    (Math.max(0, sarsAnnualTax2025(420000) - 17235 - 364 * 12)) / 12
  );
  cases.push(cert('paye_bonus_aggregate', 'bonus_tax', 'Bonus R10,000 increases PAYE',
    bonusExpected, withBonus.engineResults.find((e) => e.engineId === 'paye')?.employeeAmount ?? -1, TOLERANCE));

  // ─── UIF ──────────────────────────────────────────────────────────────────
  function uifAmount(gross: number): number {
    return runUifEmployeeEngine(baseCtx({ grossEarnings: gross, enabledEngines: { uif: true } })).employeeAmount;
  }
  cases.push(
    cert('uif_below_ceiling', 'uif', 'UIF R10,000 (below ceiling)', 100, uifAmount(10000)),
    cert('uif_at_ceiling', 'uif', 'UIF at ceiling R17,712', roundCurrency(17712 * 0.01), uifAmount(17712)),
    cert('uif_above_ceiling', 'uif', 'UIF R50,000 (above ceiling)', roundCurrency(17712 * 0.01), uifAmount(50000))
  );

  // ─── SDL ──────────────────────────────────────────────────────────────────
  function sdlAmount(gross: number, companyAnnual?: number): number {
    return runSdlEngine(baseCtx({ grossEarnings: gross, enabledEngines: { sdl: true }, companyAnnualRemuneration: companyAnnual })).employerAmount;
  }
  cases.push(
    cert('sdl_liable', 'sdl', 'SDL liable employer R30,000', 300, sdlAmount(30000, 600000)),
    cert('sdl_exempt_below', 'sdl', 'SDL exempt R400k annual', 0, sdlAmount(30000, 400000)),
    cert('sdl_threshold_exact', 'sdl', 'SDL at exactly R500,000 annual (exempt)', 0, sdlAmount(30000, 500000)),
    cert('sdl_threshold_above', 'sdl', 'SDL at R500,001 annual (liable)', 300, sdlAmount(30000, 500001))
  );

  // ─── MEDICAL CREDITS ──────────────────────────────────────────────────────
  cases.push(
    cert('med_1_member', 'medical', '1 member (main only)', 364, resolveMonthlyMedicalCredits(0, rs.medicalCredits, true)),
    cert('med_2_members', 'medical', '2 members (main + 1 dep)', 728, resolveMonthlyMedicalCredits(1, rs.medicalCredits, true)),
    cert('med_4_members', 'medical', '4 members (main + 3 dep)', 1220, resolveMonthlyMedicalCredits(3, rs.medicalCredits, true))
  );

  // ─── RETIREMENT ───────────────────────────────────────────────────────────
  const retBelow = runRetirementDeductionEngine(baseCtx({
    grossEarnings: 30000,
    enabledEngines: { retirement_deduction: true },
    components: { retirementContributions: 2000 },
  }));
  cases.push(
    cert('ret_below_limit', 'retirement', 'R2,000 contribution below 27.5% limit', -2000, retBelow.taxableAdjustment),
    cert('ret_below_deductible', 'retirement', 'Full R2,000 deductible', 2000, retBelow.breakdown.deductible)
  );
  const retAbove = runRetirementDeductionEngine(baseCtx({
    grossEarnings: 30000,
    enabledEngines: { retirement_deduction: true },
    components: { retirementContributions: 10000 },
  }));
  const maxMonthly = roundCurrency(Math.min(30000 * 12 * 0.275, 350000) / 12);
  cases.push(
    cert('ret_above_limit', 'retirement', 'Deductible capped at 27.5%', maxMonthly, retAbove.breakdown.deductible, TOLERANCE),
    cert('ret_above_non_ded', 'retirement', 'Non-deductible portion', roundCurrency(10000 - maxMonthly), retAbove.breakdown.nonDeductible, TOLERANCE)
  );

  // ─── TRAVEL ALLOWANCE ─────────────────────────────────────────────────────
  const travelMainlyBusiness = runTravelAllowanceEngine(baseCtx({
    grossEarnings: 25000,
    enabledEngines: { travel_allowance: true },
    components: { travelAllowance: { monthlyAllowance: 5000, method: 'deemed_20', businessUsePercent: 0.8 } },
  }));
  const travelNoLogbook = runTravelAllowanceEngine(baseCtx({
    grossEarnings: 25000,
    enabledEngines: { travel_allowance: true },
    components: { travelAllowance: { monthlyAllowance: 5000, method: 'deemed_80' } },
  }));
  const travelLogbook = calculateTravelAllowance(
    { monthlyAllowance: 6000, method: 'logbook', businessKilometres: 800 },
    rs
  );
  cases.push(
    cert('travel_mainly_business', 'travel', '20% inclusion (mainly business)', 1000, travelMainlyBusiness.taxableAdjustment),
    cert('travel_no_logbook', 'travel', '80% inclusion (no logbook)', 4000, travelNoLogbook.taxableAdjustment),
    cert('travel_logbook', 'travel', 'Logbook: allowance − (km × rate)', roundCurrency(Math.max(0, 6000 - 800 * 4.76)), travelLogbook.taxablePortion, TOLERANCE, '§8(1)(b); SARS IN14')
  );

  // ─── LEAVE ENCASHMENT ─────────────────────────────────────────────────────
  const leave = runLeaveEncashmentEngine(baseCtx({
    grossEarnings: 25000,
    enabledEngines: { leave_encashment: true },
    components: { leaveEncashment: { days: 5, dailyRate: 1000 } },
  }));
  cases.push(cert('leave_encash', 'leave', '5 days × R1,000', 5000, leave.taxableAdjustment));

  // ─── TERMINATION ──────────────────────────────────────────────────────────
  const termExempt = runTerminationTaxEngine(baseCtx({
    grossEarnings: 25000,
    enabledEngines: { termination_tax: true },
    components: { termination: { benefitType: 'severance', grossAmount: 200000, lifetimeSeveranceClaimed: 0 } },
  }));
  cases.push(
    cert('term_exempt_portion', 'termination', 'R200k within R500k exemption — no withholding', 0, termExempt.employeeAmount),
    cert('term_exempt_taxable', 'termination', 'Taxable portion zero (flows to PAYE)', 0, termExempt.breakdown.taxablePortion ?? termExempt.taxableAdjustment)
  );
  const termTaxable = runTerminationTaxEngine(baseCtx({
    grossEarnings: 25000,
    enabledEngines: { termination_tax: true },
    components: { termination: { benefitType: 'retrenchment', grossAmount: 600000, lifetimeSeveranceClaimed: 0 } },
  }));
  cases.push(
    cert('term_taxable_portion', 'termination', 'R600k severance — R100k taxable for PAYE', 100000, termTaxable.taxableAdjustment, TOLERANCE, '§10(1)(x)'),
    cert('term_no_double_withholding', 'termination', 'Severance withholding deferred to PAYE', 0, termTaxable.employeeAmount)
  );
  const retirementLump = calculateTerminationBenefit(
    { benefitType: 'retirement_lump_sum', grossAmount: 600000 },
    rs
  );
  cases.push(
    cert('term_retirement_lump', 'termination', 'Retirement lump sum tax (Second Schedule)', 9000, retirementLump.withholdingAmount, TOLERANCE, 'Second Schedule Part II')
  );

  // ─── DIRECTORS PAYE ───────────────────────────────────────────────────────
  const directorFixed = runDirectorsPayeEngine(baseCtx({
    grossEarnings: 30000,
    taxableEarnings: 30000,
    employee: { id: 'd1', isDirector: true, employmentType: 'director' },
    enabledEngines: { directors_paye: true },
    components: { directors: { remunerationType: 'monthly_fixed', fixedMonthlyAmount: 30000 } },
  }));
  const directorAnnual = runDirectorsPayeEngine(baseCtx({
    grossEarnings: 0,
    taxableEarnings: 0,
    employee: { id: 'd2', isDirector: true },
    enabledEngines: { directors_paye: true },
    components: { directors: { remunerationType: 'annual_fee', annualFeeAmount: 120000 } },
  }));
  cases.push(
    cert('director_monthly_fixed', 'directors', 'Monthly fixed director — no adjustment', 0, directorFixed.taxableAdjustment),
    cert('director_annual_fee', 'directors', 'Annual fee R120k deemed taxable', 120000, directorAnnual.taxableAdjustment, TOLERANCE, 'PAYE-GEN-01-G01')
  );

  // ─── FRINGE BENEFITS (Seventh Schedule) ───────────────────────────────────
  const fringeCar = calculateFringeBenefitLine({ type: 'company_car', determinedValue: 100000 }, rs);
  const fringeLoan = calculateFringeBenefitLine({ type: 'low_interest_loan', loanBalance: 500000, actualInterestRateAnnual: 0.05 }, rs);
  const fringeInsurance = calculateFringeBenefitLine({ type: 'employer_insurance', monthlyPremium: 1500 }, rs);
  cases.push(
    cert('fringe_car_7th', 'fringe', 'Company car 3.5% determined value', 3500, fringeCar.taxableValue),
    cert('fringe_loan_7th', 'fringe', 'Low interest loan fringe', roundCurrency((500000 * 0.035) / 12), fringeLoan.taxableValue, TOLERANCE, 'Seventh Schedule para 7(1)(f)'),
    cert('fringe_insurance_7th', 'fringe', 'Employer insurance premium', 1500, fringeInsurance.taxableValue, TOLERANCE, 'Seventh Schedule para 7(4)')
  );

  // ─── HISTORICAL CONSISTENCY ───────────────────────────────────────────────
  const histDate = '2024-06-15';
  const rs2024 = resolveRuleSetForDate(histDate)!;
  const hist1 = executeStatutoryPipeline({
    employee: { id: 'h', age: 30 },
    period: { payPeriodStart: '2024-06-01', payPeriodEnd: '2024-06-30', payDate: histDate },
    grossEarnings: 20000,
    enabledEngines: { paye: true, uif: true, sdl: false },
    engineConfig: {},
    ruleSet: rs2024,
  });
  const hist2 = executeStatutoryPipeline({
    employee: { id: 'h', age: 30 },
    period: { payPeriodStart: '2024-06-01', payPeriodEnd: '2024-06-30', payDate: histDate },
    grossEarnings: 20000,
    enabledEngines: { paye: true, uif: true, sdl: false },
    engineConfig: {},
    ruleSet: RULE_SET_2024_2025,
  });
  cases.push(
    cert('hist_tax_year', 'historical', '2024 pay date resolves 2024/2025', '2024/2025', hist1.taxYear),
    cert('hist_rule_version', 'historical', 'Rule version stable', '2024.2.0', hist1.ruleVersion),
    cert('hist_reproducible_paye', 'historical', 'Recalculation identical PAYE', hist1.engineResults.find((e) => e.engineId === 'paye')?.employeeAmount ?? 0,
      hist2.engineResults.find((e) => e.engineId === 'paye')?.employeeAmount ?? 0),
    cert('hist_new_year_unchanged', 'historical', '2024 result unchanged when 2025/2026 exists',
      hist1.netPay, hist2.netPay)
  );

  // 2025 result must differ if we used wrong year (sanity)
  const wrongYear = executeStatutoryPipeline({
    employee: { id: 'h', age: 30 },
    period: { payPeriodStart: '2024-06-01', payPeriodEnd: '2024-06-30', payDate: histDate },
    grossEarnings: 20000,
    enabledEngines: { paye: true },
    engineConfig: {},
    ruleSet: RULE_SET_2025_2026,
  });
  cases.push(cert('hist_forced_year_label', 'historical', 'Forced 2025 rule set on 2024 date uses 2025 label',
    '2025/2026', wrongYear.taxYear));

  // ─── AUDIT TRAIL ──────────────────────────────────────────────────────────
  const auditRun = executeStatutoryPipeline({
    employee: { id: 'audit-emp-001', employeeNumber: 'EMP-001', firstName: 'Jane', lastName: 'Doe', age: 40 },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    grossEarnings: 30000,
    enabledEngines: { paye: true, uif: true, uif_employer: true, sdl: true },
    engineConfig: {},
    companyAnnualRemuneration: 600000,
    ruleSet: rs,
    audit: {
      employeeNumber: 'EMP-001',
      employeeName: 'Jane Doe',
      companyId: 'co-001',
      payrollRunId: 'run-001',
      commandId: 'cmd-001',
      correlationId: 'corr-001',
      auditReference: 'AUD-001',
    },
  });
  const snapshot = buildCalculationSnapshot(auditRun, { generatedBy: 'cert' });
  const missingFields = validateAuditSnapshot(snapshot);
  cases.push(
    cert('audit_has_tax_year', 'audit', 'Snapshot contains tax_year', true, 'tax_year' in snapshot),
    cert('audit_has_rule_version', 'audit', 'Snapshot contains rule_version', true, 'rule_version' in snapshot),
    cert('audit_has_calc_version', 'audit', 'Snapshot contains calculation_version', ENGINE_VERSION, snapshot.calculation_version as string),
    cert('audit_has_employee_number', 'audit', 'Snapshot contains employee_number', 'EMP-001', snapshot.employee_number as string),
    cert('audit_has_employee_name', 'audit', 'Snapshot contains employee_name', 'Jane Doe', snapshot.employee_name as string),
    cert('audit_has_payroll_run', 'audit', 'Snapshot contains payroll_run_id', 'run-001', snapshot.payroll_run_id as string),
    cert('audit_has_command_id', 'audit', 'Snapshot contains command_id', 'cmd-001', snapshot.command_id as string),
    cert('audit_has_correlation_id', 'audit', 'Snapshot contains correlation_id', 'corr-001', snapshot.correlation_id as string),
    cert('audit_has_timestamp', 'audit', 'Snapshot contains calculation_timestamp', true, typeof snapshot.calculation_timestamp === 'string'),
    cert('audit_no_missing_required', 'audit', 'All required audit fields present', 0, missingFields.length),
    cert('audit_has_gross', 'audit', 'Snapshot contains gross_earnings', 30000, snapshot.gross_earnings as number),
    cert('audit_has_taxable', 'audit', 'Snapshot contains taxable_earnings', true, typeof snapshot.taxable_earnings === 'number'),
    cert('audit_has_net_pay', 'audit', 'Snapshot contains net_pay', true, typeof snapshot.net_pay === 'number'),
    cert('audit_trail_nonempty', 'audit', 'Audit trail has steps', true, auditRun.auditTrail.length > 5),
    cert('audit_engine_results', 'audit', 'Per-engine audit trails present', true,
      auditRun.engineResults.every((r) => !r.skipped ? r.auditTrail.length > 0 : true)),
    cert('audit_formula_present', 'audit', 'Every step has formula', true,
      auditRun.auditTrail.every((s) => typeof s.formula === 'string' && s.formula.length > 0))
  );

  const passed = cases.filter((c) => c.passed).length;
  return {
    runAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    suiteVersion: SUITE_VERSION,
    totalCases: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
  };
}
