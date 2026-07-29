// Governance Foundation — Document Configuration domain model (Phase G3.1).
//
// Document numbering was named in Enterprise Constitution Volume I §3.7 as a
// governance domain, but G1's audit did not investigate it — whether a
// centralized numbering configuration already exists anywhere in this
// codebase is Not Verified, not confirmed absent the way Currencies or
// Workflow were. This domain is therefore scaffolded per Volume I's target
// shape only, with no proxy call attempted, so as not to fabricate a backing
// implementation that may or may not exist.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

export type DocumentType = 'invoice' | 'quote' | 'bill' | 'purchase_order' | 'credit_note' | 'journal_entry';

export interface DocumentNumberingConfigDomainModel {
  companyId: string;
  documentType: DocumentType;
  prefix: string;
  nextNumber: number;
  numberFormat: string;
}

// Validation model
export function validateDocumentNumberingConfig(
  config: Partial<DocumentNumberingConfigDomainModel>
): ValidationResult {
  const errors: string[] = [];
  if (!config.documentType) errors.push('documentType is required.');
  if (config.nextNumber != null && config.nextNumber < 1) {
    errors.push('nextNumber must be a positive integer.');
  }
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const DOCUMENT_CONFIGURATION_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'documentConfiguration.view',
    requiredRole: 'member',
    description: 'View document numbering configuration.',
  },
  edit: {
    action: 'documentConfiguration.edit',
    requiredRole: 'owner',
    description: 'Change numbering sequences or formats — high-impact, owner-only, since it affects issued-document immutability guarantees.',
  },
};
