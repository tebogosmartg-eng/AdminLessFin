// Governance Foundation — Audit Configuration service (Phase G3.1).
//
// Proxies the EXISTING `settings` edge function method GET_AUDIT_LOGS
// (src/components/AuditLogViewer.tsx is today's caller) and the existing
// `accounting` edge function's GET_ACCOUNTING_AUDIT (accountingApi.audit,
// src/pages/accounting/AccountingAuditTrail.tsx is today's caller). No new
// backend behaviour is introduced. This service is READ-ONLY by design —
// no mutation interface is defined, matching G1's confirmed finding that no
// application code path edits or deletes audit log rows.

import { supabase } from '@/integrations/supabase/client';
import { accountingApi } from '@/lib/accountingWorkspace';
import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { AuditLogEntryDomainModel } from './model';

export interface AuditConfigurationReadAPI {
  getAuditLogs(companyId: string, tableName?: string): Promise<AuditLogEntryDomainModel[]>;
}

// Verified against src/integrations/supabase/database.types.ts's `audit_logs`
// Row type (operation/old_data/new_data), cross-referenced with the actual
// select in supabase/functions/settings/index.ts:147 (`profiles:changed_by
// ( full_name )` join alias).
type RawAuditLogRow = {
  id: string;
  company_id: string;
  table_name: string;
  record_id: string | null;
  operation: string;
  changed_by: string | null;
  profiles?: { full_name: string | null } | null;
  created_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export class AuditConfigurationService implements AuditConfigurationReadAPI {
  async getAuditLogs(companyId: string, tableName?: string): Promise<AuditLogEntryDomainModel[]> {
    assertGovernanceDomainActive('auditConfiguration');
    const { data, error } = await supabase.functions.invoke('settings', {
      body: { method: 'GET_AUDIT_LOGS', company_id: companyId, table_name: tableName ?? 'all' },
    });
    if (error) throw new Error(error.message);
    const rows = (data as RawAuditLogRow[] | null) ?? [];
    return rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      tableName: row.table_name,
      recordId: row.record_id,
      operation: row.operation,
      changedBy: row.changed_by,
      changedByName: row.profiles?.full_name ?? null,
      changedAt: row.created_at,
      oldData: row.old_data,
      newData: row.new_data,
    }));
  }

  // Alternate read path over the same underlying `audit_logs` table, via the
  // Accounting workspace's own audit endpoint (GET_ACCOUNTING_AUDIT) — kept
  // as a second method rather than merged with getAuditLogs above because
  // G1 found these are two independently-built consumers of the same table,
  // not guaranteed to return an identical shape; unifying them is a future
  // migration decision, not this Foundation phase's to make silently.
  async getAccountingAuditTrail(companyId: string, page: number, pageSize: number, tableName?: string) {
    assertGovernanceDomainActive('auditConfiguration');
    return accountingApi.audit(companyId, page, pageSize, tableName);
  }
}

export function createAuditConfigurationService(): AuditConfigurationService {
  return new AuditConfigurationService();
}
