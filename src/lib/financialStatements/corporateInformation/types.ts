/**
 * V16.1 — Enterprise Corporate Information Model.
 *
 * Canonical enterprise object consumed by all publication formats.
 * Renderers display this model; they never determine content or formatting rules.
 */
import type { DocumentModel } from '../document/documentModel';

/** Field metadata classification for validation and publication gates. */
export type FieldMetadata = 'required' | 'optional' | 'conditional' | 'derived' | 'computed';

/** Enterprise module source identifiers — extensible without provider modification. */
export type CorporateInformationSourceId =
  | 'company_profile'
  | 'governance'
  | 'director_register'
  | 'officer_register'
  | 'address_repository'
  | 'tax_configuration'
  | 'financial_configuration'
  | 'engagement'
  | 'approval_workflow'
  | 'principal_bankers_repository';

/** Wrapped field with metadata and provenance. */
export type CorporateInformationField<T> = {
  value: T;
  metadata: FieldMetadata;
  source: CorporateInformationSourceId;
  /** Pre-formatted display value — formatting rules live in the engine, not renderers. */
  formatted: string | null;
};

export type DirectorClassification =
  | 'executive'
  | 'non_executive'
  | 'independent'
  | 'chairperson';

export type DirectorEntry = {
  name: string;
  role: string | null;
  appointmentDate: string | null;
  resignationDate: string | null;
  classifications: DirectorClassification[];
  active: boolean;
  source: CorporateInformationSourceId;
};

export type GovernanceRole =
  | 'company_secretary'
  | 'auditor'
  | 'independent_reviewer'
  | 'accounting_officer'
  | 'partner'
  | 'manager'
  | 'reviewer'
  | 'preparer'
  | 'authorised_representative';

export type GovernanceEntry = {
  role: GovernanceRole;
  name: string;
  source: CorporateInformationSourceId;
};

export type AddressKind =
  | 'registered_office'
  | 'business_address'
  | 'postal_address'
  | 'physical_address'
  | 'website'
  | 'email'
  | 'telephone';

export type AddressEntry = {
  kind: AddressKind;
  value: string;
  source: CorporateInformationSourceId;
};

export type PrincipalBanker = {
  bankName: string;
  branch: string | null;
  branchCode: string | null;
  accountType: string | null;
  swift: string | null;
  iban: string | null;
  active: boolean;
  source: CorporateInformationSourceId;
};

export type TaxRegistration = {
  kind: string;
  label: string;
  number: string;
  applicable: boolean;
  source: CorporateInformationSourceId;
};

export type LevelOfAssurance =
  | 'independent_audit'
  | 'independent_review'
  | 'compilation_report'
  | 'unaudited_financial_statements';

export type EntityIdentity = {
  registeredName: CorporateInformationField<string | null>;
  tradingName: CorporateInformationField<string | null>;
  registrationNumber: CorporateInformationField<string | null>;
  natureOfBusiness: CorporateInformationField<string | null>;
  countryOfIncorporation: CorporateInformationField<string | null>;
  reportingFramework: CorporateInformationField<string | null>;
  entityType: CorporateInformationField<string | null>;
};

export type EngagementInformation = {
  reportingPeriod: CorporateInformationField<string | null>;
  comparativePeriod: CorporateInformationField<string | null>;
  reportingCurrency: CorporateInformationField<string | null>;
  functionalCurrency: CorporateInformationField<string | null>;
  preparedBy: CorporateInformationField<string | null>;
  reviewedBy: CorporateInformationField<string | null>;
  partner: CorporateInformationField<string | null>;
  approvalDate: CorporateInformationField<string | null>;
  authorisationDate: CorporateInformationField<string | null>;
  issueDate: CorporateInformationField<string | null>;
};

export type CorporateInformationValidationIssue = {
  field: string;
  metadata: FieldMetadata;
  source: CorporateInformationSourceId;
  message: string;
  blocking: boolean;
};

export type CorporateInformationValidationResult = {
  passed: boolean;
  issues: CorporateInformationValidationIssue[];
  requiredMissing: number;
  optionalMissing: number;
};

/**
 * Canonical Corporate Information Model — single object for all publication formats.
 */
export type CorporateInformationModel = {
  version: '16.1';
  entityIdentity: EntityIdentity;
  addresses: AddressEntry[];
  governance: GovernanceEntry[];
  directors: DirectorEntry[];
  principalBankers: PrincipalBanker[];
  taxRegistrations: TaxRegistration[];
  engagement: EngagementInformation;
  levelOfAssurance: CorporateInformationField<LevelOfAssurance>;
  validation: CorporateInformationValidationResult;
  /** Stable fingerprint for regression and certification. */
  modelFingerprint: string;
};

/** Context passed to source adapters — provider never owns data. */
export type CorporateInformationContext = {
  model: DocumentModel;
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
};

/** Partial slice returned by each source adapter. */
export type CorporateInformationSlice = Partial<{
  entityIdentity: Partial<EntityIdentity>;
  addresses: AddressEntry[];
  governance: GovernanceEntry[];
  directors: DirectorEntry[];
  principalBankers: PrincipalBanker[];
  taxRegistrations: TaxRegistration[];
  engagement: Partial<EngagementInformation>;
  levelOfAssurance: LevelOfAssurance;
}>;
