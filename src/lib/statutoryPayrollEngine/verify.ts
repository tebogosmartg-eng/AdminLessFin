/**
 * SARS verification cases — validates engine against published examples.
 */

import { RULE_SET_2024_2025, RULE_SET_2025_2026 } from './registry';
import { executeStatutoryPipeline } from './pipeline';
import { calculateAnnualTax, resolveRebate, roundCurrency } from './utils';
import { resolveMonthlyMedicalCredits } from './engines/medicalTaxCreditEngine';

/** Minimal medical_aid contribution for Section 6A entitled certification scenarios. */
const MEDICAL_ENTITLED_ENGINE_CONFIG = { medical_aid: { monthly_amount: 1 } };

export type VerificationCase = {
  id: string;
  description: string;
  passed: boolean;
  expected: number | string;
  actual: number | string;
  tolerance?: number;
};

export type VerificationReport = {
  runAt: string;
  engineVersion: string;
  taxYear: string;
  totalCases: number;
  passed: number;
  failed: number;
  cases: VerificationCase[];
};

function approxEqual(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function runStatutoryVerification(): VerificationReport {
  const cases: VerificationCase[] = [];
  const ruleSet = RULE_SET_2025_2026;

  // Case 1: Tax bracket — R300,000 annual (26% bracket)
  const tax300k = calculateAnnualTax(300000, ruleSet.brackets);
  cases.push({
    id: 'bracket_300k',
    description: 'Annual tax on R300,000 taxable income',
    expected: 59032,
    actual: tax300k,
    passed: approxEqual(tax300k, 59032),
  });

  // Case 2: Tax bracket — R500,000 annual (31% bracket)
  const tax500k = calculateAnnualTax(500000, ruleSet.brackets);
  cases.push({
    id: 'bracket_500k',
    description: 'Annual tax on R500,000 taxable income',
    expected: 117507,
    actual: tax500k,
    passed: approxEqual(tax500k, 117507),
  });

  // Case 3: Primary rebate
  const rebateAges = {
    secondaryAge: ruleSet.rebateSecondaryAge,
    tertiaryAge: ruleSet.rebateTertiaryAge,
  };
  const rebate = resolveRebate(ruleSet.rebates, 30, rebateAges);
  cases.push({
    id: 'rebate_primary',
    description: 'Primary rebate (under 65)',
    expected: 17235,
    actual: rebate,
    passed: rebate === 17235,
  });

  // Case 4: Secondary rebate (65+)
  const rebate65 = resolveRebate(ruleSet.rebates, 65, rebateAges);
  cases.push({
    id: 'rebate_secondary',
    description: 'Primary + secondary rebate (65+)',
    expected: 26679,
    actual: rebate65,
    passed: rebate65 === 26679,
  });

  // Case 5: Medical credits — 0 dependants
  const med0 = resolveMonthlyMedicalCredits(0, ruleSet.medicalCredits, true);
  cases.push({
    id: 'medical_0_dep',
    description: 'Monthly medical credit — main member only',
    expected: 364,
    actual: med0,
    passed: med0 === 364,
  });

  // Case 6: Medical credits — 2 dependants
  const med2 = resolveMonthlyMedicalCredits(2, ruleSet.medicalCredits, true);
  cases.push({
    id: 'medical_2_dep',
    description: 'Monthly medical credit — main + 2 dependants',
    expected: 974,
    actual: med2,
    passed: med2 === 974,
  });

  // Case 7: PAYE — R25,000/month, age 30 (main member medical credit applies)
  const paye25k = executeStatutoryPipeline({
    employee: { id: 'v1', age: 30 },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    grossEarnings: 25000,
    enabledEngines: { paye: true, uif: false, uif_employer: false, sdl: false },
    engineConfig: MEDICAL_ENTITLED_ENGINE_CONFIG,
    ruleSet,
  });
  const annualTax25k = calculateAnnualTax(300000, ruleSet.brackets);
  const monthlyMed = resolveMonthlyMedicalCredits(0, ruleSet.medicalCredits, true);
  const expectedPaye25k = roundCurrency(
    (annualTax25k - ruleSet.rebates.primary - monthlyMed * 12) / 12
  );
  cases.push({
    id: 'paye_25k_monthly',
    description: 'Monthly PAYE on R25,000 taxable (under 65, main member medical credit)',
    expected: expectedPaye25k,
    actual: paye25k.engineResults.find((r) => r.engineId === 'paye')?.employeeAmount ?? 0,
    passed: approxEqual(
      paye25k.engineResults.find((r) => r.engineId === 'paye')?.employeeAmount ?? 0,
      expectedPaye25k
    ),
  });

  // Case 8: UIF — R15,000 gross (below R17,712 ceiling)
  const uif15k = executeStatutoryPipeline({
    employee: { id: 'v2' },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    grossEarnings: 15000,
    enabledEngines: { paye: false, uif: true, uif_employer: true, sdl: false },
    engineConfig: {},
    ruleSet,
  });
  cases.push({
    id: 'uif_15k',
    description: 'UIF employee on R15,000 (1% below ceiling)',
    expected: 150,
    actual: uif15k.engineResults.find((r) => r.engineId === 'uif')?.employeeAmount ?? 0,
    passed: approxEqual(uif15k.engineResults.find((r) => r.engineId === 'uif')?.employeeAmount ?? 0, 150),
  });

  // Case 9: UIF ceiling — R25,000 gross (above R17,712 ceiling)
  const uifCeiling = executeStatutoryPipeline({
    employee: { id: 'v3' },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    grossEarnings: 25000,
    enabledEngines: { paye: false, uif: true, uif_employer: false, sdl: false },
    engineConfig: {},
    ruleSet,
  });
  cases.push({
    id: 'uif_ceiling',
    description: 'UIF capped at R17,712 ceiling',
    expected: 177.12,
    actual: uifCeiling.engineResults.find((r) => r.engineId === 'uif')?.employeeAmount ?? 0,
    passed: approxEqual(
      uifCeiling.engineResults.find((r) => r.engineId === 'uif')?.employeeAmount ?? 0,
      177.12
    ),
  });

  // Case 10: SDL — R30,000 gross
  const sdl30k = executeStatutoryPipeline({
    employee: { id: 'v4' },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    grossEarnings: 30000,
    enabledEngines: { paye: false, uif: false, uif_employer: false, sdl: true },
    engineConfig: {},
    companyAnnualRemuneration: 600000,
    ruleSet,
  });
  cases.push({
    id: 'sdl_30k',
    description: 'SDL 1% on R30,000 remuneration',
    expected: 300,
    actual: sdl30k.engineResults.find((r) => r.engineId === 'sdl')?.employerAmount ?? 0,
    passed: approxEqual(sdl30k.engineResults.find((r) => r.engineId === 'sdl')?.employerAmount ?? 0, 300),
  });

  // Case 11: SDL exemption
  const sdlExempt = executeStatutoryPipeline({
    employee: { id: 'v5' },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    grossEarnings: 30000,
    enabledEngines: { sdl: true },
    engineConfig: {},
    companyAnnualRemuneration: 400000,
    ruleSet,
  });
  cases.push({
    id: 'sdl_exemption',
    description: 'SDL exempt when company annual remuneration ≤ R500,000',
    expected: 0,
    actual: sdlExempt.engineResults.find((r) => r.engineId === 'sdl')?.employerAmount ?? 0,
    passed: (sdlExempt.engineResults.find((r) => r.engineId === 'sdl')?.employerAmount ?? 0) === 0,
  });

  // Case 12: Historical tax year resolution
  const historical = executeStatutoryPipeline({
    employee: { id: 'v6', age: 30 },
    period: { payPeriodStart: '2024-06-01', payPeriodEnd: '2024-06-30', payDate: '2024-06-25' },
    grossEarnings: 20000,
    enabledEngines: { paye: true, uif: false, sdl: false },
    engineConfig: {},
    ruleSet: RULE_SET_2024_2025,
  });
  cases.push({
    id: 'historical_2024_2025',
    description: '2024/2025 tax year resolved for June 2024 pay date',
    expected: '2024/2025',
    actual: historical.taxYear,
    passed: historical.taxYear === '2024/2025',
  });

  const passed = cases.filter((c) => c.passed).length;
  return {
    runAt: new Date().toISOString(),
    engineVersion: '3.0.0',
    taxYear: ruleSet.taxYearLabel,
    totalCases: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
  };
}
