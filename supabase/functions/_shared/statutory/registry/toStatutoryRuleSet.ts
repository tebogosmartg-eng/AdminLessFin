/**
 * Adapter — CountryLegislationPackage → StatutoryRuleSet (locked payroll engine).
 */

import type { StatutoryRuleSet } from '../../statutoryPayrollEngine/types.ts';
import type { CountryLegislationPackage } from './types.ts';
import { unwrap } from './types.ts';

export function legislationToStatutoryRuleSet(
  legislation: CountryLegislationPackage
): StatutoryRuleSet {
  const {
    metadata,
    taxBrackets,
    rebates,
    medicalCredits,
    uif,
    sdl,
    retirement,
    travel,
    fringeBenefits,
    thresholds,
  } = legislation;

  return {
    taxYearLabel: metadata.taxYear,
    ruleVersion: metadata.ruleVersion,
    effectiveFrom: metadata.effectiveFrom,
    effectiveTo: metadata.effectiveTo,
    countryCode: metadata.countryCode,
    brackets: taxBrackets.map((b) => unwrap(b)),
    rebates: {
      primary: unwrap(rebates.primary),
      secondary: unwrap(rebates.secondary),
      tertiary: unwrap(rebates.tertiary),
    },
    medicalCredits: {
      mainMember: unwrap(medicalCredits.mainMember),
      firstDependant: unwrap(medicalCredits.firstDependant),
      additionalDependant: unwrap(medicalCredits.additionalDependant),
    },
    uifCeilingMonthly: unwrap(uif.ceilingMonthly),
    uifRate: unwrap(uif.employeeRate),
    sdlRate: unwrap(sdl.rate),
    sdlExemptionAnnualRemuneration: unwrap(sdl.exemptionAnnualRemuneration),
    retirementDeductionCapAnnual: unwrap(retirement.deductionCapAnnual),
    retirementDeductionMaxRate: unwrap(retirement.deductionMaxRate),
    travelPrescribedRatePerKm: unwrap(travel.prescribedRatePerKm),
    travelDeemedTaxableNoLogbook: unwrap(travel.deemedTaxableNoLogbook),
    travelDeemedTaxableMainlyBusiness: unwrap(travel.deemedTaxableMainlyBusiness),
    severanceExemptionLifetime: unwrap(retirement.severanceExemptionLifetime),
    officialInterestRateAnnual: unwrap(fringeBenefits.officialInterestRateAnnual),
    vehicleFringeRateEmployerCosts: unwrap(fringeBenefits.vehicleFringeRateEmployerCosts),
    vehicleFringeRateEmployeeFuel: unwrap(fringeBenefits.vehicleFringeRateEmployeeFuel),
    accommodationAbatementAnnual: unwrap(fringeBenefits.accommodationAbatementAnnual),
    furnishedAccommodationAbatementMultiplier: unwrap(
      fringeBenefits.furnishedAccommodationAbatementMultiplier
    ),
    retirementLumpSumTable: unwrap(retirement.lumpSumTable),
    deathBenefitExemption: unwrap(retirement.deathBenefitExemption),
    rebateSecondaryAge: unwrap(thresholds.secondaryRebateAge),
    rebateTertiaryAge: unwrap(thresholds.tertiaryRebateAge),
    legislationReference: `${metadata.authority}; ${metadata.budgetReference}; ${metadata.gazetteReference}`,
  };
}
