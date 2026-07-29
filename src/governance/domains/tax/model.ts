// Governance Foundation — Tax domain model (Phase G3.1).
//
// Mirrors the existing `tax_rates` table (id, company_id, name, rate,
// is_default), which G1's audit confirmed IS genuinely single-sourced and
// correctly FK'd from invoices/bills/credit-notes/quotes/products — the one
// example alongside Company Identity of a governance object already built
// correctly. Its only flaw per G1 was discoverability (not surfaced from
// Settings). This domain gives it a typed home; it does not change it.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

export interface TaxRateDomainModel {
  id: string;
  companyId: string;
  name: string;
  rate: number;
  isDefault: boolean;
}

// Validation model
export function validateTaxRate(taxRate: Partial<TaxRateDomainModel>): ValidationResult {
  const errors: string[] = [];
  if (!taxRate.name || taxRate.name.trim().length === 0) errors.push('Tax rate name is required.');
  if (taxRate.rate == null || taxRate.rate < 0) errors.push('Tax rate must be zero or a positive number.');
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const TAX_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'tax.view',
    requiredRole: 'member',
    description: 'View tax rates.',
  },
  edit: {
    action: 'tax.edit',
    requiredRole: 'admin',
    description: 'Create, edit, or delete tax rates.',
  },
};
