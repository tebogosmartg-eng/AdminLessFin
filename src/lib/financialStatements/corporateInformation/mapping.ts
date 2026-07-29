/**
 * V16.1 — Smart Mapping Registry.
 *
 * Every field has exactly one canonical source. No duplicated storage.
 */
import type { CorporateInformationSourceId } from './types';

export type SmartMappingEntry = {
  field: string;
  source: CorporateInformationSourceId;
  description: string;
};

/** Canonical field → source mapping. Single source of truth per field. */
export const SMART_MAPPING_REGISTRY: SmartMappingEntry[] = [
  { field: 'registeredName', source: 'company_profile', description: 'Registered legal name' },
  { field: 'tradingName', source: 'company_profile', description: 'Trading / business name' },
  { field: 'registrationNumber', source: 'company_profile', description: 'Company registration number' },
  { field: 'natureOfBusiness', source: 'company_profile', description: 'Nature of business' },
  { field: 'countryOfIncorporation', source: 'company_profile', description: 'Country of incorporation' },
  { field: 'entityType', source: 'company_profile', description: 'Entity type classification' },
  { field: 'reportingFramework', source: 'financial_configuration', description: 'Reporting framework' },
  { field: 'registeredOffice', source: 'address_repository', description: 'Registered office address' },
  { field: 'businessAddress', source: 'address_repository', description: 'Business address' },
  { field: 'postalAddress', source: 'address_repository', description: 'Postal address' },
  { field: 'physicalAddress', source: 'address_repository', description: 'Physical address' },
  { field: 'website', source: 'address_repository', description: 'Website' },
  { field: 'email', source: 'address_repository', description: 'Email' },
  { field: 'telephone', source: 'address_repository', description: 'Telephone' },
  { field: 'auditor', source: 'governance', description: 'External auditor' },
  { field: 'companySecretary', source: 'governance', description: 'Company secretary' },
  { field: 'independentReviewer', source: 'governance', description: 'Independent reviewer' },
  { field: 'accountingOfficer', source: 'governance', description: 'Accounting officer' },
  { field: 'directors', source: 'director_register', description: 'Board of directors' },
  { field: 'officers', source: 'officer_register', description: 'Company officers' },
  { field: 'principalBankers', source: 'principal_bankers_repository', description: 'Principal bankers' },
  { field: 'vatNumber', source: 'tax_configuration', description: 'VAT registration' },
  { field: 'incomeTaxNumber', source: 'tax_configuration', description: 'Income tax registration' },
  { field: 'payeNumber', source: 'tax_configuration', description: 'PAYE registration' },
  { field: 'sdlNumber', source: 'tax_configuration', description: 'SDL registration' },
  { field: 'uifNumber', source: 'tax_configuration', description: 'UIF registration' },
  { field: 'reportingPeriod', source: 'engagement', description: 'Reporting period' },
  { field: 'comparativePeriod', source: 'engagement', description: 'Comparative period' },
  { field: 'reportingCurrency', source: 'engagement', description: 'Reporting currency' },
  { field: 'functionalCurrency', source: 'financial_configuration', description: 'Functional currency' },
  { field: 'preparedBy', source: 'engagement', description: 'Prepared by' },
  { field: 'reviewedBy', source: 'engagement', description: 'Reviewed by' },
  { field: 'partner', source: 'engagement', description: 'Engagement partner' },
  { field: 'approvalDate', source: 'approval_workflow', description: 'Approval date' },
  { field: 'authorisationDate', source: 'approval_workflow', description: 'Authorisation date' },
  { field: 'issueDate', source: 'approval_workflow', description: 'Issue date' },
  { field: 'levelOfAssurance', source: 'engagement', description: 'Level of assurance (derived)' },
];

export function smartMappingSummary(): Record<CorporateInformationSourceId, string[]> {
  const summary: Partial<Record<CorporateInformationSourceId, string[]>> = {};
  for (const entry of SMART_MAPPING_REGISTRY) {
    if (!summary[entry.source]) summary[entry.source] = [];
    summary[entry.source]!.push(entry.field);
  }
  return summary as Record<CorporateInformationSourceId, string[]>;
}
