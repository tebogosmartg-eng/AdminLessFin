// Governance Foundation — Corporate Governance domain model (Phase G3.1).
//
// Mirrors the fields G1's audit found stored in `efs_engagement_general_information`
// / `efs_company_master_data` (directors, company secretary, auditor,
// independent reviewer, accounting officer, registered office, share
// information, principal bankers) — today owned exclusively by the Financial
// Statements engine. Per Enterprise Constitution Volume I §3.2, this domain
// is where that data's ownership moves to in a future migration phase; this
// phase only establishes the typed model and a read-only proxy to today's
// existing storage, unchanged.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

export interface DirectorDomainModel {
  name: string;
  role: string | null;
  appointedDate: string | null;
  resignedDate: string | null;
}

export interface CorporateGovernanceDomainModel {
  companyId: string;
  directors: DirectorDomainModel[];
  companySecretary: string | null;
  auditor: string | null;
  independentReviewer: string | null;
  accountingOfficer: string | null;
  registeredOffice: string | null;
  shareInformation: Record<string, unknown> | null;
  principalBankers: unknown[] | null;
}

// Validation model
export function validateDirectorAppointment(director: Partial<DirectorDomainModel>): ValidationResult {
  const errors: string[] = [];
  if (!director.name || director.name.trim().length === 0) {
    errors.push('Director name is required.');
  }
  if (director.appointedDate && director.resignedDate && director.resignedDate < director.appointedDate) {
    errors.push('Resigned date cannot be before appointed date.');
  }
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const CORPORATE_GOVERNANCE_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'corporateGovernance.view',
    requiredRole: 'member',
    description: 'View directors, officers, and governance information.',
  },
  edit: {
    action: 'corporateGovernance.edit',
    requiredRole: 'admin',
    description: 'Edit directors, officers, auditor, or registered office.',
  },
};
