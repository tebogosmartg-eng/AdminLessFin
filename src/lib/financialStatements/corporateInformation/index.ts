/**
 * V16.1 — Enterprise Corporate Information Engine.
 *
 * Canonical enterprise object for all publication formats.
 * PDF, DOCX, Preview, and future HTML consume CorporateInformationModel.
 */
export {
  provideCorporateInformation,
  corporateInformationToNarratives,
} from './provider';

export {
  corporateDisplayFromEntity,
  corporateDisplayFromModel,
  corporateFilenameSlug,
} from './accessors';
export type { CorporateDisplayValues } from './accessors';

export {
  validateCorporateInformation,
  corporateInformationValidationReport,
} from './validation';

export {
  registerCorporateInformationSource,
  getCorporateInformationSources,
  buildCorporateInformationContext,
  companyProfileSource,
  governanceSource,
  directorRegisterSource,
  officerRegisterSource,
  addressRepositorySource,
  taxConfigurationSource,
  financialConfigurationSource,
  engagementSource,
  approvalWorkflowSource,
  principalBankersSource,
} from './sources';

export {
  SMART_MAPPING_REGISTRY,
  smartMappingSummary,
} from './mapping';

export {
  formatSingleValue,
  formatNameList,
  formatDirectorName,
  formatDirectorsList,
  formatBanker,
  formatBankersList,
  formatTaxRegistrations,
  levelOfAssuranceLabel,
  buildCorporateInformationNarratives,
} from './formatting';

export {
  buildCorporateInformationPresentation,
  presentationToNarratives,
} from './presentation';

export { determineLevelOfAssurance } from './levelOfAssurance';

export type {
  CorporateInformationPresentation,
  CorporateInformationPresentationRow,
} from './presentationTypes';

export type {
  CorporateInformationModel,
  CorporateInformationField,
  CorporateInformationSourceId,
  CorporateInformationContext,
  CorporateInformationSlice,
  CorporateInformationValidationResult,
  CorporateInformationValidationIssue,
  DirectorEntry,
  DirectorClassification,
  GovernanceEntry,
  GovernanceRole,
  AddressEntry,
  AddressKind,
  PrincipalBanker,
  TaxRegistration,
  LevelOfAssurance,
  EntityIdentity,
  EngagementInformation,
  FieldMetadata,
} from './types';
