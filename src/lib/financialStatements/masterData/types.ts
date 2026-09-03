/**
 * V16.1 — Company Master Data types.
 * Each module is the single source of truth for its domain.
 */

export type MasterDataModuleId =
  | 'company_profile'
  | 'addresses'
  | 'tax_registrations'
  | 'directors'
  | 'governance'
  | 'officers'
  | 'principal_bankers';

export type CompanyProfileMaster = {
  registered_name?: string | null;
  trading_name?: string | null;
  registration_number?: string | null;
  nature_of_business?: string | null;
  country_of_incorporation?: string | null;
  entity_type?: string | null;
};

export type AddressRepositoryMaster = {
  registered_office?: string | null;
  business_address?: string | null;
  postal_address?: string | null;
  physical_address?: string | null;
  website?: string | null;
  email?: string | null;
  telephone?: string | null;
};

export type TaxRegistrationMaster = {
  vat_number?: string | null;
  income_tax_number?: string | null;
  paye_number?: string | null;
  sdl_number?: string | null;
  uif_number?: string | null;
  custom_tax_registrations?: Array<{ label?: string; number?: string }>;
};

export type DirectorMasterEntry = {
  id?: string;
  name: string;
  role?: string | null;
  appointment_date?: string | null;
  resignation_date?: string | null;
  executive?: boolean;
  non_executive?: boolean;
  independent?: boolean;
  chairperson?: boolean;
};

export type GovernanceMaster = {
  company_secretary?: string | null;
  auditor?: string | null;
  independent_reviewer?: string | null;
  accounting_officer?: string | null;
};

export type OfficerMasterEntry = {
  id?: string;
  role: 'preparer' | 'reviewer' | 'partner' | 'manager' | 'authorised_representative';
  name: string;
  position?: string | null;
};

export type PrincipalBankerMasterEntry = {
  id?: string;
  name: string;
  branch?: string | null;
  branch_code?: string | null;
  account_type?: string | null;
  swift?: string | null;
  iban?: string | null;
  active?: boolean;
};

export type CompanyMasterData = {
  id?: string;
  company_id?: string;
  company_profile: CompanyProfileMaster;
  addresses: AddressRepositoryMaster;
  tax_registrations: TaxRegistrationMaster;
  directors: DirectorMasterEntry[];
  governance: GovernanceMaster;
  officers: OfficerMasterEntry[];
  principal_bankers: PrincipalBankerMasterEntry[];
  /** Set after one-time legacy engagement hydration (V16.1). */
  legacy_migration_completed_at?: string | null;
  updated_at?: string;
};

export const MASTER_DATA_MODULE_LABELS: Record<
  MasterDataModuleId,
  { title: string; description: string }
> = {
  company_profile: {
    title: 'Company Profile',
    description: 'Registered name, trading name, registration and entity classification',
  },
  addresses: {
    title: 'Address Repository',
    description: 'Registered office, business, postal, contact details, and company email',
  },
  tax_registrations: {
    title: 'Tax Configuration',
    description: 'VAT, income tax, PAYE, SDL, UIF and custom registrations',
  },
  directors: {
    title: 'Director Register',
    description: 'Board appointments, classifications and reporting-period status',
  },
  governance: {
    title: 'Governance',
    description: 'Company secretary, auditor, independent reviewer and accounting officer',
  },
  officers: {
    title: 'Officer Register',
    description: 'Preparer, reviewer, partner and authorised representatives',
  },
  principal_bankers: {
    title: 'Principal Bankers',
    description: 'Active principal banking relationships',
  },
};

export function emptyCompanyMasterData(): CompanyMasterData {
  return {
    company_profile: {},
    addresses: {},
    tax_registrations: {},
    directors: [],
    governance: {},
    officers: [],
    principal_bankers: [],
  };
}
