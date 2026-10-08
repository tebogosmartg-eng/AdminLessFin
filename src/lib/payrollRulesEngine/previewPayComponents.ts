/**
 * Preview cash gross, taxable earnings, and net pay for a package
 * before payslips are generated. Mirrors generatePayslipsWithRulesEngine:
 * the standing package merged with this run's inputs, the same bases for
 * PAYE, UIF and SDL, and annual payments taxed by the SARS difference method.
 */

import { executeStatutoryPipeline } from '../statutoryPayrollEngine/pipeline';
import { resolveRuleSetForDate } from '../statutoryPayrollEngine/registry';
import { roundCurrency } from '../statutoryPayrollEngine/utils';
import { assemblePayComponents, mergePayComponents, type StoredPayComponent } from './payComponents';

export function previewEmployeePay(input: {
  monthlyBasic: number;
  /** Already merged, or pass package and period separately. */
  components?: StoredPayComponent[];
  packageComponents?: StoredPayComponent[];
  periodInputs?: StoredPayComponent[];
  payDate: string;
}) {
  const ruleSet = resolveRuleSetForDate(input.payDate);
  const rows = input.components
    ?? mergePayComponents(input.packageComponents ?? [], input.periodInputs ?? []);
  const assembly = assemblePayComponents(rows, ruleSet);
  const cashGross = roundCurrency(input.monthlyBasic + assembly.cashGross);
  const taxableEarnings = roundCurrency(input.monthlyBasic + assembly.taxableBaseAddition);
  const remuneration = roundCurrency(input.monthlyBasic + assembly.remunerationAddition);
  const result = executeStatutoryPipeline({
    employee: { id: 'preview' },
    period: {
      payPeriodStart: input.payDate,
      payPeriodEnd: input.payDate,
      payDate: input.payDate,
    },
    grossEarnings: cashGross,
    taxableEarnings,
    nonPeriodicTaxable: assembly.nonPeriodicTaxable,
    uifRemuneration: remuneration,
    sdlRemuneration: remuneration,
    enabledEngines: {
      paye: true,
      uif: true,
      uif_employer: true,
      sdl: true,
      medical_tax_credit: true,
      directors_paye: false,
      ...assembly.enabledEngines,
    },
    engineConfig: {},
    components: assembly.components,
    ruleSet,
    companyAnnualRemuneration: 600_000,
  });

  return { assembly, result, cashGross };
}
