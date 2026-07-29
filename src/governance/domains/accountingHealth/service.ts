// Governance — Accounting Health service (ERP Phase 2). Advisory only.

import { supabase } from '@/integrations/supabase/client';
import type { AccountingHealthReport } from './model';

export class AccountingHealthService {
  async getHealth(companyId: string): Promise<AccountingHealthReport> {
    const { data, error } = await supabase.functions.invoke('accounting-health', {
      body: { method: 'GET_HEALTH', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data as AccountingHealthReport;
  }
}

export const accountingHealthService = new AccountingHealthService();
