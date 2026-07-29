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
} from './registry/types';

export {
  LegislationResolutionError,
  LegislationValidationError,
  statutoryConstant,
  unwrap,
  computePayloadChecksum,
} from './registry/types';

export { computeLegislationChecksum } from './registry/checksum';

export {
  COUNTRY_REGISTRY,
  getCountryRegistration,
  getPackagesForCountry,
  getAllRegisteredPackages,
} from './registry/countryRegistry';

export {
  registerCountryPluginBundle,
  getCountryPluginBundle,
  listCountryPluginBundles,
  resolveCountryCapabilities,
  getStatutoryReturnPlugin,
} from './registry/countryPlugins';

export type { CountryCapabilities } from './registry/countryPlugins';

export {
  resolveLegislation,
  resolveSouthAfricanLegislation,
  requireLegislationByTaxYear,
  getLegislationByTaxYear,
  getAllRegisteredLegislation,
} from './registry/resolveLegislation';

export type { ResolveInput } from './registry/resolveLegislation';

export {
  verifyLegislation,
  validateLegislationRepository,
  assertLegislationRepositoryValid,
} from './registry/verifyLegislation';

export type { VerificationResult as ValidationResult } from './registry/verifyLegislation';

export { legislationToStatutoryRuleSet } from './registry/toStatutoryRuleSet';

export { lookupProvenance, lookupProvenanceForPayDate } from './registry/provenance';

export {
  RULE_SET_2024_2025,
  RULE_SET_2025_2026,
  RULE_SET_2026_2027,
  SOUTH_AFRICA_PACKAGES,
} from './countries/south-africa';

/** Compatibility alias */
export { SOUTH_AFRICA_PACKAGES as REGISTERED_LEGISLATION } from './countries/south-africa';
