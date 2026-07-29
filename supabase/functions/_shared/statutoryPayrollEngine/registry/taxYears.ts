/**
 * Versioned statutory parameters — SARS published values per tax year.
 */

import type { LumpSumTaxBracket, StatutoryRuleSet } from '../types.ts';

const SA_BRACKETS: StatutoryRuleSet['brackets'] = [
  { from: 0, to: 237100, rate: 0.18, base: 0 },
  { from: 237100, to: 370500, rate: 0.26, base: 42678 },
  { from: 370500, to: 512800, rate: 0.31, base: 77362 },
  { from: 512800, to: 673000, rate: 0.36, base: 121475 },
  { from: 673000, to: 857900, rate: 0.39, base: 179147 },
  { from: 857900, to: 1817000, rate: 0.41, base: 251258 },
  { from: 1817000, to: null, rate: 0.45, base: 644489 },
];

const SA_REBATES = { primary: 17235, secondary: 9444, tertiary: 3145 };
const SA_MEDICAL = { mainMember: 364, firstDependant: 364, additionalDependant: 246 };

/** SARS retirement fund lump sum tax table 2024/2025–2025/2026 */
const RETIREMENT_LUMP_SUM_TABLE: LumpSumTaxBracket[] = [
  { from: 0, to: 550000, rate: 0, base: 0 },
  { from: 550000, to: 770000, rate: 0.18, base: 0 },
  { from: 770000, to: 1155000, rate: 0.27, base: 39600 },
  { from: 1155000, to: null, rate: 0.36, base: 143550 },
];

const COMMON_RULE_FIELDS = {
  brackets: SA_BRACKETS,
  rebates: SA_REBATES,
  medicalCredits: SA_MEDICAL,
  uifCeilingMonthly: 17712,
  uifRate: 0.01,
  sdlRate: 0.01,
  sdlExemptionAnnualRemuneration: 500000,
  retirementDeductionCapAnnual: 350000,
  retirementDeductionMaxRate: 0.275,
  travelPrescribedRatePerKm: 4.76,
  travelDeemedTaxableNoLogbook: 0.8,
  travelDeemedTaxableMainlyBusiness: 0.2,
  severanceExemptionLifetime: 500000,
  officialInterestRateAnnual: 0.085,
  vehicleFringeRateEmployerCosts: 0.035,
  vehicleFringeRateEmployeeFuel: 0.0325,
  accommodationAbatementAnnual: 30000,
  retirementLumpSumTable: RETIREMENT_LUMP_SUM_TABLE,
  deathBenefitExemption: 250000,
};

export const RULE_SET_2024_2025: StatutoryRuleSet = {
  taxYearLabel: '2024/2025',
  ruleVersion: '2024.2.0',
  effectiveFrom: '2024-03-01',
  effectiveTo: '2025-02-28',
  countryCode: 'ZA',
  ...COMMON_RULE_FIELDS,
  legislationReference: 'Income Tax Act 58 of 1962; Seventh Schedule; SARS 2024/2025',
};

export const RULE_SET_2025_2026: StatutoryRuleSet = {
  taxYearLabel: '2025/2026',
  ruleVersion: '2025.2.0',
  effectiveFrom: '2025-03-01',
  effectiveTo: '2026-02-28',
  countryCode: 'ZA',
  ...COMMON_RULE_FIELDS,
  legislationReference: 'Income Tax Act 58 of 1962; Seventh Schedule; SARS 2025/2026',
};

const SA_BRACKETS_2026_2027: StatutoryRuleSet['brackets'] = [
  { from: 0, to: 245100, rate: 0.18, base: 0 },
  { from: 245100, to: 383100, rate: 0.26, base: 44118 },
  { from: 383100, to: 530200, rate: 0.31, base: 79998 },
  { from: 530200, to: 695800, rate: 0.36, base: 125599 },
  { from: 695800, to: 887000, rate: 0.39, base: 185215 },
  { from: 887000, to: 1878600, rate: 0.41, base: 259783 },
  { from: 1878600, to: null, rate: 0.45, base: 666339 },
];

const SA_REBATES_2026_2027 = { primary: 17820, secondary: 9765, tertiary: 3249 };
const SA_MEDICAL_2026_2027 = { mainMember: 376, firstDependant: 376, additionalDependant: 254 };

export const RULE_SET_2026_2027: StatutoryRuleSet = {
  taxYearLabel: '2026/2027',
  ruleVersion: '2026.2.0',
  effectiveFrom: '2026-03-01',
  effectiveTo: '2027-02-28',
  countryCode: 'ZA',
  brackets: SA_BRACKETS_2026_2027,
  rebates: SA_REBATES_2026_2027,
  medicalCredits: SA_MEDICAL_2026_2027,
  uifCeilingMonthly: 17712,
  uifRate: 0.01,
  sdlRate: 0.01,
  sdlExemptionAnnualRemuneration: 500000,
  retirementDeductionCapAnnual: 350000,
  retirementDeductionMaxRate: 0.275,
  travelPrescribedRatePerKm: 4.76,
  travelDeemedTaxableNoLogbook: 0.8,
  travelDeemedTaxableMainlyBusiness: 0.2,
  severanceExemptionLifetime: 500000,
  officialInterestRateAnnual: 0.085,
  vehicleFringeRateEmployerCosts: 0.035,
  vehicleFringeRateEmployeeFuel: 0.0325,
  accommodationAbatementAnnual: 30000,
  retirementLumpSumTable: RETIREMENT_LUMP_SUM_TABLE,
  deathBenefitExemption: 250000,
  legislationReference: 'Income Tax Act 58 of 1962; Seventh Schedule; SARS 2026/2027',
};

export const VERSIONED_RULE_SETS: readonly StatutoryRuleSet[] = [
  RULE_SET_2024_2025,
  RULE_SET_2025_2026,
  RULE_SET_2026_2027,
];
