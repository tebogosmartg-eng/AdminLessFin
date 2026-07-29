// Governance Foundation — Company domain model (Phase G3.1).
//
// Mirrors the existing `companies` table (id, name, owner_id, address,
// logo_url, tax_id, default_invoice_notes) confirmed in the G1 audit as the
// one governance object today that is genuinely single-sourced. This domain
// exists so that future consumers of company identity data go through one
// typed model instead of reading `activeCompany` shape ad hoc.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

export interface CompanyDomainModel {
  id: string;
  name: string;
  ownerId: string | null;
  address: string | null;
  logoUrl: string | null;
  taxId: string | null;
  defaultInvoiceNotes: string | null;
}

// Validation model
export function validateCompanyProfile(company: Partial<CompanyDomainModel>): ValidationResult {
  const errors: string[] = [];
  // Name is only required when the caller is explicitly updating name.
  // G3.6C: branding-only updates (logo / invoice notes) omit name — enterprise
  // identity lives in Master Data.
  if ('name' in company && (!company.name || company.name.trim().length === 0)) {
    errors.push('Company name is required.');
  }
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const COMPANY_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'company.view',
    requiredRole: 'member',
    description: 'View company profile.',
  },
  edit: {
    action: 'company.edit',
    requiredRole: 'admin',
    description: 'Edit company profile (name, address, tax ID, logo).',
  },
  delete: {
    action: 'company.delete',
    requiredRole: 'owner',
    description: 'Delete the company entirely.',
  },
};
