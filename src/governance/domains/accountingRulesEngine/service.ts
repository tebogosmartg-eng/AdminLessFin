// Governance — Accounting Rules Engine service (ERP Phase 4).

import { supabase } from '@/integrations/supabase/client';
import type { JournalPreview, RuleDefinition, RulesDashboard } from './model';

export class AccountingRulesEngineService {
  async preview(companyId: string, businessEvent: string, payload: Record<string, unknown>): Promise<JournalPreview> {
    const { data, error } = await supabase.functions.invoke('accounting-rules-engine', {
      body: { method: 'PREVIEW', company_id: companyId, business_event: businessEvent, payload },
    });
    if (error) throw new Error(error.message);
    return data as JournalPreview;
  }

  async execute(
    companyId: string,
    businessEvent: string,
    payload: Record<string, unknown>,
    mode: 'preview' | 'validate' | 'commit' = 'commit',
  ) {
    const { data, error } = await supabase.functions.invoke('accounting-rules-engine', {
      body: { method: 'EXECUTE', company_id: companyId, business_event: businessEvent, payload, mode },
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async getDashboard(companyId: string): Promise<RulesDashboard> {
    const { data, error } = await supabase.functions.invoke('accounting-rules-engine', {
      body: { method: 'GET_DASHBOARD', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data as RulesDashboard;
  }

  async listRules(companyId: string): Promise<RuleDefinition[]> {
    const { data, error } = await supabase.functions.invoke('accounting-rules-engine', {
      body: { method: 'LIST_RULES', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data as RuleDefinition[];
  }
}

export const accountingRulesEngineService = new AccountingRulesEngineService();
