/**
 * Adapter — bridges Payroll Rules Engine to Statutory Payroll Engine.
 * Preserves existing rule contract; delegates statutory calculations.
 */

import type { TaxYearConfig } from '../payrollRulesEngine/types';
import type { StatutoryRuleSet } from './types';
import { mapDbRowToRuleSet } from './registry';

export function taxYearConfigToRuleSet(config: TaxYearConfig): StatutoryRuleSet {
  return mapDbRowToRuleSet({
    id: config.id,
    tax_year_label: config.taxYearLabel,
    effective_from: config.effectiveFrom,
    effective_to: config.effectiveTo,
    country_code: config.countryCode,
    brackets: config.brackets,
    rebates: {
      primary: config.rebates?.primary,
      secondary: config.rebates?.secondary,
      tertiary: config.rebates?.tertiary,
    },
    medical_credits: {
      main_member: config.medicalCredits?.mainMember,
      first_dependant: config.medicalCredits?.firstDependant,
      additional_dependant: config.medicalCredits?.additionalDependant,
    },
    uif_ceiling_monthly: config.uifCeilingMonthly,
    uif_rate: config.uifRate,
    sdl_rate: config.sdlRate,
  });
}
