/**
 * Statutory Rules Registry — resolves versioned rules for a payroll period.
 */

import type { StatutoryRuleSet } from '../types.ts';
import { VERSIONED_RULE_SETS } from './taxYears.ts';

export { RULE_SET_2024_2025, RULE_SET_2025_2026, RULE_SET_2026_2027, VERSIONED_RULE_SETS } from './taxYears.ts';

export function resolveRuleSetForDate(
  payDate: string,
  ruleSets: readonly StatutoryRuleSet[] = VERSIONED_RULE_SETS
): StatutoryRuleSet | undefined {
  const date = payDate.slice(0, 10);
  return ruleSets.find((r) => date >= r.effectiveFrom && date <= r.effectiveTo);
}

export function getRuleSetByLabel(
  taxYearLabel: string,
  ruleSets: readonly StatutoryRuleSet[] = VERSIONED_RULE_SETS
): StatutoryRuleSet | undefined {
  return ruleSets.find((r) => r.taxYearLabel === taxYearLabel);
}

export function getAllRuleSets(): readonly StatutoryRuleSet[] {
  return VERSIONED_RULE_SETS;
}

/** Map DB payroll_tax_year_config row to statutory rule set (DB values take precedence). */
export function mapDbRowToRuleSet(row: Record<string, unknown>): StatutoryRuleSet {
  const label = row.tax_year_label as string;
  const builtin = getRuleSetByLabel(label);
  return {
    id: row.id as string | undefined,
    taxYearLabel: label,
    ruleVersion: builtin?.ruleVersion ?? `${label}.db`,
    effectiveFrom: row.effective_from as string,
    effectiveTo: row.effective_to as string,
    countryCode: (row.country_code as string) ?? 'ZA',
    brackets: (row.brackets as StatutoryRuleSet['brackets']) ?? builtin?.brackets ?? [],
    rebates: {
      primary: (row.rebates as { primary?: number })?.primary ?? builtin?.rebates.primary ?? 0,
      secondary: (row.rebates as { secondary?: number })?.secondary ?? builtin?.rebates.secondary ?? 0,
      tertiary: (row.rebates as { tertiary?: number })?.tertiary ?? builtin?.rebates.tertiary ?? 0,
    },
    medicalCredits: {
      mainMember:
        (row.medical_credits as { main_member?: number })?.main_member ??
        (row.medical_credits as { mainMember?: number })?.mainMember ??
        builtin?.medicalCredits.mainMember ??
        0,
      firstDependant:
        (row.medical_credits as { first_dependant?: number })?.first_dependant ??
        (row.medical_credits as { firstDependant?: number })?.firstDependant ??
        builtin?.medicalCredits.firstDependant ??
        0,
      additionalDependant:
        (row.medical_credits as { additional_dependant?: number })?.additional_dependant ??
        (row.medical_credits as { additionalDependant?: number })?.additionalDependant ??
        builtin?.medicalCredits.additionalDependant ??
        0,
    },
    uifCeilingMonthly: (row.uif_ceiling_monthly as number) ?? builtin?.uifCeilingMonthly ?? 17712,
    uifRate: (row.uif_rate as number) ?? builtin?.uifRate ?? 0.01,
    sdlRate: (row.sdl_rate as number) ?? builtin?.sdlRate ?? 0.01,
    sdlExemptionAnnualRemuneration: builtin?.sdlExemptionAnnualRemuneration ?? 500000,
    retirementDeductionCapAnnual: builtin?.retirementDeductionCapAnnual ?? 350000,
    retirementDeductionMaxRate: builtin?.retirementDeductionMaxRate ?? 0.275,
    travelPrescribedRatePerKm: builtin?.travelPrescribedRatePerKm ?? 4.76,
    travelDeemedTaxableNoLogbook: builtin?.travelDeemedTaxableNoLogbook ?? 0.8,
    travelDeemedTaxableMainlyBusiness: builtin?.travelDeemedTaxableMainlyBusiness ?? 0.2,
    severanceExemptionLifetime: builtin?.severanceExemptionLifetime ?? 500000,
    officialInterestRateAnnual: builtin?.officialInterestRateAnnual ?? 0.085,
    vehicleFringeRateEmployerCosts: builtin?.vehicleFringeRateEmployerCosts ?? 0.035,
    vehicleFringeRateEmployeeFuel: builtin?.vehicleFringeRateEmployeeFuel ?? 0.0325,
    accommodationAbatementAnnual: builtin?.accommodationAbatementAnnual ?? 30000,
    retirementLumpSumTable: builtin?.retirementLumpSumTable ?? [],
    deathBenefitExemption: builtin?.deathBenefitExemption ?? 250000,
    legislationReference: builtin?.legislationReference ?? 'Income Tax Act 58 of 1962',
  };
}

export function resolveRuleSetForPayroll(
  payDate: string,
  dbRows?: Record<string, unknown>[]
): StatutoryRuleSet {
  const date = payDate.slice(0, 10);
  if (!dbRows?.length) {
    throw new Error(
      `No payroll_tax_year_config rows available for pay date ${date}. Cannot resolve SARS tax year.`
    );
  }
  const dbMatch = dbRows.find(
    (r) => date >= (r.effective_from as string) && date <= (r.effective_to as string)
  );
  if (!dbMatch) {
    throw new Error(
      `No payroll_tax_year_config row matches pay date ${date}. Cannot resolve SARS tax year.`
    );
  }
  return mapDbRowToRuleSet(dbMatch);
}
