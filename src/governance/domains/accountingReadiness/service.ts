// Governance Foundation — Accounting Readiness service (ERP Phase 1A/1B).
// Proxies the `accounting-setup` edge function. Validation Engine is authority.

import { supabase } from '@/integrations/supabase/client';
import type { GovernanceMutationResult } from '@/governance/types';
import type {
  AccountingReadinessSnapshot,
  UpdateAccountingSetupStepInput,
} from './model';
import { validateSetupStepUpdate } from './model';

type RawReadinessRow = {
  company_id: string;
  status: string;
  accounting_ready: boolean;
  current_step: string;
  financial_calendar_complete: boolean;
  chart_of_accounts_complete: boolean;
  tax_configuration_complete: boolean;
  bank_accounts_complete: boolean;
  opening_balances_complete: boolean;
  validation_complete: boolean;
  bank_accounts_skipped: boolean;
  opening_balances_zero_intentional: boolean;
  inventory_enabled: boolean;
  fixed_assets_enabled: boolean;
  payroll_enabled: boolean;
  last_validated_at: string | null;
  progress_percent?: number;
  steps?: AccountingReadinessSnapshot['steps'];
  validation?: AccountingReadinessSnapshot['validation'];
};

function mapSnapshot(row: RawReadinessRow): AccountingReadinessSnapshot {
  return {
    companyId: row.company_id,
    status: row.status as AccountingReadinessSnapshot['status'],
    accountingReady: row.accounting_ready,
    currentStep: row.current_step as AccountingReadinessSnapshot['currentStep'],
    financialCalendarComplete: row.financial_calendar_complete,
    chartOfAccountsComplete: row.chart_of_accounts_complete,
    taxConfigurationComplete: row.tax_configuration_complete,
    bankAccountsComplete: row.bank_accounts_complete,
    openingBalancesComplete: row.opening_balances_complete,
    validationComplete: row.validation_complete,
    bankAccountsSkipped: row.bank_accounts_skipped,
    openingBalancesZeroIntentional: row.opening_balances_zero_intentional,
    inventoryEnabled: row.inventory_enabled,
    fixedAssetsEnabled: row.fixed_assets_enabled,
    payrollEnabled: row.payroll_enabled,
    lastValidatedAt: row.last_validated_at,
    progressPercent: row.progress_percent ?? 0,
    steps: row.steps ?? ({} as AccountingReadinessSnapshot['steps']),
    validation: row.validation ?? {
      activeFinancialYear: false,
      chartOfAccountsExists: false,
      mandatoryControlAccounts: false,
      coaIntegrity: false,
      taxConfigurationExists: false,
      bankAccountOrSkipped: false,
      openingBalancesComplete: false,
      controlAccounts: {} as AccountingReadinessSnapshot['validation']['controlAccounts'],
      missingControlAccounts: [],
      coaIntegrityErrors: [],
      errors: [],
    },
  };
}

export class AccountingReadinessService {
  async getStatus(companyId: string): Promise<AccountingReadinessSnapshot> {
    const { data, error } = await supabase.functions.invoke('accounting-setup', {
      body: { method: 'GET_STATUS', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return mapSnapshot(data as RawReadinessRow);
  }

  async evaluate(companyId: string): Promise<AccountingReadinessSnapshot> {
    const { data, error } = await supabase.functions.invoke('accounting-setup', {
      body: { method: 'EVALUATE', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return mapSnapshot(data as RawReadinessRow);
  }

  /** Record intent flags only (skip banking, zero OB, module toggles). */
  async updateIntent(
    companyId: string,
    input: UpdateAccountingSetupStepInput,
  ): Promise<GovernanceMutationResult & { snapshot?: AccountingReadinessSnapshot }> {
    const validation = validateSetupStepUpdate(input);
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };

    const { data, error } = await supabase.functions.invoke('accounting-setup', {
      body: {
        method: 'UPDATE_STEP',
        company_id: companyId,
        bank_accounts_skipped: input.bankAccountsSkipped,
        opening_balances_zero_intentional: input.openingBalancesZeroIntentional,
        inventory_enabled: input.inventoryEnabled,
        fixed_assets_enabled: input.fixedAssetsEnabled,
        payroll_enabled: input.payrollEnabled,
      },
    });
    if (error) return { success: false, error: error.message };
    return { success: true, snapshot: mapSnapshot(data as RawReadinessRow) };
  }

  /** @deprecated Phase 1B — use updateIntent. Kept as alias for callers. */
  async updateStep(
    companyId: string,
    input: UpdateAccountingSetupStepInput,
  ): Promise<GovernanceMutationResult & { snapshot?: AccountingReadinessSnapshot }> {
    return this.updateIntent(companyId, input);
  }
}

export const accountingReadinessService = new AccountingReadinessService();
