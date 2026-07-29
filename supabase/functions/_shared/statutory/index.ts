/**
 * AdminLess Fin — Statutory Framework (V3.4.2)
 * Country-agnostic legislative governance.
 */

export type {
  CountryLegislationPackage,
  SouthAfricanLegislation,
  LegislationPackageMetadata,
  LegislationStatus,
  StatutoryConstant,
  ProvenanceFields,
  TaxBracket,
  LumpSumTaxBracket,
  DocumentCatalogueEntry,
  CountryCode,
  RebatesBlock,
  MedicalCreditsBlock,
  UifBlock,
  SdlBlock,
  RetirementBlock,
  TravelBlock,
  FringeBenefitsBlock,
  ThresholdsBlock,
  AllowancesBlock,
  DeductionsBlock,
  Irp5Block,
  Emp201Block,
  ValidationRulesBlock,
} from './registry/types.ts';

export {
  LegislationResolutionError,
  LegislationValidationError,
  statutoryConstant,
  unwrap,
  computePayloadChecksum,
} from './registry/types.ts';

export { computeLegislationChecksum } from './registry/checksum.ts';

export {
  COUNTRY_REGISTRY,
  getCountryRegistration,
  getPackagesForCountry,
  getAllRegisteredPackages,
} from './registry/countryRegistry.ts';

export {
  resolveLegislation,
  resolveSouthAfricanLegislation,
  requireLegislationByTaxYear,
  getLegislationByTaxYear,
  getAllRegisteredLegislation,
} from './registry/resolveLegislation.ts';

export type { ResolveInput } from './registry/resolveLegislation.ts';

export {
  verifyLegislation,
  validateLegislationRepository,
  assertLegislationRepositoryValid,
} from './registry/verifyLegislation.ts';

export type { VerificationResult as ValidationResult } from './registry/verifyLegislation.ts';

export { legislationToStatutoryRuleSet } from './registry/toStatutoryRuleSet.ts';

export { lookupProvenance, lookupProvenanceForPayDate } from './registry/provenance.ts';

export {
  RULE_SET_2024_2025,
  RULE_SET_2025_2026,
  RULE_SET_2026_2027,
  SOUTH_AFRICA_PACKAGES,
} from './countries/south-africa.ts';

/** Compatibility alias */
export { SOUTH_AFRICA_PACKAGES as REGISTERED_LEGISLATION } from './countries/south-africa.ts';
