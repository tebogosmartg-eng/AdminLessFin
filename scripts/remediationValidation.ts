/**
 * V3.2.17 — Post-remediation validation for certified payroll run.
 */
import { readFileSync } from 'fs';
import { buildStatutoryEngineConfig } from '../src/lib/payrollRulesEngine/index';
import { executeStatutoryPipeline } from '../src/lib/statutoryPayrollEngine/pipeline';
import { RULE_SET_2026_2027 } from '../src/lib/statutoryPayrollEngine/registry/taxYears';
import { calculateAnnualTax, resolveRebate, roundCurrency } from '../src/lib/statutoryPayrollEngine/utils';

const EMPLOYEE_ID = '6a72f977-35a7-4a15-9559-b58a0dd13d4e';
const MONTHLY_TAXABLE = 35460;
const EXPECTED_PAYE = 6277.35;

function independentSarsPaye(monthlyTaxable: number, ruleSet: typeof RULE_SET_2026_2027) {
  const annual = roundCurrency(monthlyTaxable * 12);
  const tax = calculateAnnualTax(annual, ruleSet.brackets);
  const rebate = resolveRebate(ruleSet.rebates, undefined, {
    secondaryAge: ruleSet.rebateSecondaryAge,
    tertiaryAge: ruleSet.rebateTertiaryAge,
  });
  const liability = Math.max(0, roundCurrency(tax - rebate));
  return roundCurrency(liability / 12);
}

const snap = JSON.parse(readFileSync('scripts/variance-snapshot.json', 'utf8'));
const period = {
  payPeriodStart: snap.run.pay_period_start,
  payPeriodEnd: snap.run.pay_period_end,
  payDate: snap.run.pay_date,
};

const companyRules = {
  medical_aid: { enabled: false, config: { monthly_amount: 500 } },
  paye: { enabled: true, config: {} },
  uif: { enabled: true, config: {} },
  sdl: { enabled: true, config: {} },
  basic_salary: { enabled: true, config: {} },
};

const engineConfig = buildStatutoryEngineConfig(companyRules, {}, {});
const result = executeStatutoryPipeline({
  employee: { id: EMPLOYEE_ID },
  period,
  grossEarnings: MONTHLY_TAXABLE,
  taxableEarnings: MONTHLY_TAXABLE,
  enabledEngines: { paye: true, medical_tax_credit: true, uif: true, sdl: true },
  engineConfig,
  ruleSet: RULE_SET_2026_2027,
});

const paye = result.engineResults.find((e) => e.engineId === 'paye')!;
const med = result.engineResults.find((e) => e.engineId === 'medical_tax_credit')!;
const independent = independentSarsPaye(MONTHLY_TAXABLE, RULE_SET_2026_2027);

console.log('═══════════════════════════════════════════════════════════════');
console.log(' V3.2.17 — POST-REMEDIATION VALIDATION');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Employee:           ${EMPLOYEE_ID}`);
console.log(`Remuneration:       R${MONTHLY_TAXABLE.toFixed(2)}`);
console.log(`Pay date:           ${period.payDate}`);
console.log(`Tax year:           ${result.taxYear}`);
console.log(`Medical credit/mo:  R${(med.breakdown.monthlyCredit ?? 0).toFixed(2)}`);
console.log(`Engine PAYE:        R${paye.employeeAmount.toFixed(2)}`);
console.log(`Independent SARS:   R${independent.toFixed(2)}`);
console.log(`Expected PAYE:      R${EXPECTED_PAYE.toFixed(2)}`);
console.log('');
console.log(`Tax year correct:   ${result.taxYear === '2026/2027' ? 'PASS' : 'FAIL'}`);
console.log(`Medical credit 0:   ${(med.breakdown.monthlyCredit ?? 0) === 0 ? 'PASS' : 'FAIL'}`);
console.log(`Engine = SARS:      ${Math.abs(paye.employeeAmount - independent) < 0.01 ? 'PASS' : 'FAIL'}`);
console.log(`Engine = Expected:  ${Math.abs(paye.employeeAmount - EXPECTED_PAYE) < 0.01 ? 'PASS' : 'FAIL'}`);

const pass =
  result.taxYear === '2026/2027' &&
  (med.breakdown.monthlyCredit ?? 0) === 0 &&
  Math.abs(paye.employeeAmount - EXPECTED_PAYE) < 0.01;

process.exit(pass ? 0 : 1);
