// Governance Foundation — Audit Configuration domain model (Phase G3.1).
//
// Mirrors the existing `audit_logs` table, read today via the `audit-logs`
// edge function and via `settings`'s GET_AUDIT_LOGS method (both confirmed
// in the G1 audit). This domain is read-only by design — G1 confirmed no
// application code path can edit or delete audit log rows, and this
// Foundation phase preserves that: there is no mutation interface here.

import type { GovernancePermissionBoundary } from '../../types';

// Field names verified against src/integrations/supabase/database.types.ts's
// `audit_logs` Row type: operation/old_data/new_data, not action/old_values/
// new_values.
export interface AuditLogEntryDomainModel {
  id: string;
  companyId: string;
  tableName: string;
  recordId: string | null;
  operation: string;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}

// Permission boundary — read-only capability, admin-only per G1's confirmed
// finding (supabase/functions/audit-logs/index.ts restricts to owner/admin).
export const AUDIT_CONFIGURATION_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'auditConfiguration.view',
    requiredRole: 'admin',
    description: 'View the audit trail. No edit/delete capability exists — audit logs are immutable by application-layer design.',
  },
};
