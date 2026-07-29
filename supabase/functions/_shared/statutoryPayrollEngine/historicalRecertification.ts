/**
 * Historical recalculation certification — verifies immutable tax year results.
 */

import { executeStatutoryPipeline } from './pipeline';
import { RULE_SET_2024_2025, RULE_SET_2025_2026 } from './registry';
import { ENGINE_VERSION } from './utils';

export type HistoricalCase = {
  id: string;
  description: string;
  passed: boolean;
  run1NetPay: number;
  run2NetPay: number;
  taxYear: string;
  ruleVersion: string;
};

export type HistoricalCertificationReport = {
  runAt: string;
  engineVersion: string;
  totalCases: number;
  passed: number;
  failed: number;
  cases: HistoricalCase[];
};

export function runHistoricalCertification(): HistoricalCertificationReport {
  const cases: HistoricalCase[] = [];

  const scenarios = [
    {
      id: 'hist_2024_replay',
      payDate: '2024-06-15',
      ruleSet: RULE_SET_2024_2025,
      gross: 20000,
    },
    {
      id: 'hist_2025_replay',
      payDate: '2025-06-15',
      ruleSet: RULE_SET_2025_2026,
      gross: 25000,
    },
  ];

  for (const s of scenarios) {
    const base = {
      employee: { id: 'hist-emp', age: 35 },
      period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: s.payDate },
      grossEarnings: s.gross,
      enabledEngines: { paye: true, uif: true, uif_employer: true, sdl: true },
      engineConfig: {},
      companyAnnualRemuneration: 600000,
      ruleSet: s.ruleSet,
    };
    const run1 = executeStatutoryPipeline(base);
    const run2 = executeStatutoryPipeline(base);
    cases.push({
      id: s.id,
      description: `Recalculate ${s.ruleSet.taxYearLabel} — identical results`,
      passed: run1.netPay === run2.netPay && run1.taxYear === s.ruleSet.taxYearLabel,
      run1NetPay: run1.netPay,
      run2NetPay: run2.netPay,
      taxYear: run1.taxYear,
      ruleVersion: run1.ruleVersion,
    });
  }

  const crossYear = executeStatutoryPipeline({
    employee: { id: 'hist-emp' },
    period: { payPeriodStart: '2024-06-01', payPeriodEnd: '2024-06-30', payDate: '2024-06-15' },
    grossEarnings: 20000,
    enabledEngines: { paye: true },
    engineConfig: {},
    ruleSet: RULE_SET_2025_2026,
  });
  cases.push({
    id: 'hist_forced_wrong_year',
    description: 'Forced 2025 rule set on 2024 date retains 2025 label (controlled)',
    passed: crossYear.taxYear === '2025/2026',
    run1NetPay: crossYear.netPay,
    run2NetPay: crossYear.netPay,
    taxYear: crossYear.taxYear,
    ruleVersion: crossYear.ruleVersion,
  });

  const passed = cases.filter((c) => c.passed).length;
  return {
    runAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    totalCases: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
  };
}
