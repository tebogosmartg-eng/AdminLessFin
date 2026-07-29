// Governance — Accounting Policy Engine service (ERP Phase 3). Preventive enforcement.

import { supabase } from '@/integrations/supabase/client';
import type { AccountingPolicyDashboard, PolicyDefinition } from './model';

export class AccountingPolicyEngineService {
  async getDashboard(companyId: string): Promise<AccountingPolicyDashboard> {
    const { data, error } = await supabase.functions.invoke('accounting-policy-engine', {
      body: { method: 'GET_DASHBOARD', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data as AccountingPolicyDashboard;
  }

  async listPolicies(companyId: string): Promise<PolicyDefinition[]> {
    const { data, error } = await supabase.functions.invoke('accounting-policy-engine', {
      body: { method: 'LIST_POLICIES', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data as PolicyDefinition[];
  }

  async getAuditLog(companyId: string, limit = 50) {
    const { data, error } = await supabase.functions.invoke('accounting-policy-engine', {
      body: { method: 'GET_AUDIT_LOG', company_id: companyId, limit },
    });
    if (error) throw new Error(error.message);
    return data;
  }
}

export const accountingPolicyEngineService = new AccountingPolicyEngineService();
