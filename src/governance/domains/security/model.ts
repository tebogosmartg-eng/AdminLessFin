// Governance Foundation — Security domain model (Phase G3.1).
//
// Mirrors the existing `company_users` role model (owner/admin/member) found
// in src/components/TeamMembersSettings.tsx and src/components/AdminRoute.tsx.
// G1's audit found role checks reimplemented ad hoc per edge function, with
// one documented production defect (Banking: membership-checked, role-unchecked).
// This domain is where a single, centralized permission check will live once
// a future phase migrates consumers to it — this phase only establishes the
// typed model and a read/mutation proxy to today's existing `settings`
// edge function, unchanged.

import type { GovernanceRole, GovernancePermissionBoundary, ValidationResult } from '../../types';

export interface CompanyMemberDomainModel {
  userId: string;
  role: GovernanceRole;
  fullName: string | null;
  email: string | null;
}

// Validation model
export function validateRoleAssignment(role: string | null | undefined): ValidationResult {
  const errors: string[] = [];
  if (!role || !['owner', 'admin', 'member'].includes(role)) {
    errors.push('role must be one of: owner, admin, member.');
  }
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const SECURITY_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'security.view',
    requiredRole: 'member',
    description: 'View team members and their roles.',
  },
  manage: {
    action: 'security.manage',
    requiredRole: 'admin',
    description: 'Change a member\'s role or remove a member.',
  },
};
