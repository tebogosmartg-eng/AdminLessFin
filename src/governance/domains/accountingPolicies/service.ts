// Governance Foundation — Accounting Policies service.
//
// Phase G3.4 (third production migration) activates this domain as the
// authoritative owner of Accounting Policies. Behaviour identity is
// load-bearing:
//
//   • Materiality proxies the EXISTING `accounting` edge methods
//     GET_/SET_MATERIALITY_SETTINGS via accountingApi — identical network
//     calls to what MaterialitySettingsDialog used before.
//   • Tax default proxies the EXISTING `tax-rates` GET and selects
//     is_default — does NOT activate the Tax governance domain.
//   • Currency / Inventory / Reporting defaults return the CURRENT
//     implicit product defaults (ZAR / weighted_average) as documented
//     pass-throughs — not fabricated persisted stores.
//   • Financial Reporting narrative policy sets proxy the EXISTING
//     `invokeFinancialStatements` LIST/CREATE/UPSERT methods — same
//     wrapper, same payloads, same error semantics.
//   • Depreciation / Default GL Accounts throw clear NOT_IMPLEMENTED
//     stubs (G1: no company-wide SoT).

import { accountingApi } from '@/lib/accountingWorkspace';
import { invokeFinancialStatements } from '@/lib/financialStatements/api';
import { supabase } from '@/integrations/supabase/client';
import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { GovernanceMutationResult } from '@/governance/types';
import {
  validateMaterialitySettings,
  IMPLICIT_DEFAULT_CURRENCY,
  IMPLICIT_INVENTORY_COST_METHOD,
  type MaterialitySettingsDomainModel,
  type CurrencyDefaultDomainModel,
  type TaxDefaultDomainModel,
  type DepreciationDefaultDomainModel,
  type InventoryValuationDefaultDomainModel,
  type DefaultGlAccountsDomainModel,
  type FinancialReportingPolicySetDomainModel,
  type ReportingDefaultsDomainModel,
} from './model';

export interface AccountingPoliciesReadAPI {
  getMaterialitySettings(companyId: string): Promise<MaterialitySettingsDomainModel | null>;
  getCurrencyDefault(companyId: string): Promise<CurrencyDefaultDomainModel>;
  getDefaultTaxTreatment(companyId: string): Promise<TaxDefaultDomainModel | null>;
  getDepreciationDefault(companyId: string): Promise<DepreciationDefaultDomainModel | null>;
  getInventoryValuationDefault(companyId: string): Promise<InventoryValuationDefaultDomainModel>;
  getDefaultGlAccounts(companyId: string): Promise<DefaultGlAccountsDomainModel | null>;
  getReportingDefaults(companyId: string): Promise<ReportingDefaultsDomainModel>;
  listAccountingPolicySets(
    companyId: string,
    workspaceId: string,
  ): Promise<FinancialReportingPolicySetDomainModel[]>;
}

export interface AccountingPoliciesMutationAPI {
  setMaterialitySettings(
    companyId: string,
    percentageThreshold: number,
    absoluteThreshold: number,
  ): Promise<GovernanceMutationResult>;
  createAccountingPolicySet(
    companyId: string,
    workspaceId: string,
    frameworkPackId: string,
    title?: string,
  ): Promise<unknown>;
  upsertAccountingPolicy(
    companyId: string,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
}

type RawMaterialityRow = {
  percentage_threshold: number;
  absolute_threshold: number;
};

type RawTaxRateRow = {
  id: string;
  company_id: string;
  name: string;
  rate: number;
  is_default: boolean;
};

type RawPolicySet = {
  id: string;
  workspace_id?: string;
  title: string;
  status?: string;
  version_no?: number;
  policies?: Array<{
    id: string;
    policy_code: string;
    title: string;
    body?: string;
    sort_order?: number;
    status?: string;
  }>;
};

const NOT_IMPLEMENTED_DEPRECIATION =
  'No company-wide depreciation default exists yet (confirmed by the G1 audit — ' +
  'only per-asset-category values exist today). This method is an explicit stub, ' +
  'not a currently-backed capability. Consumers continue to use per-category defaults.';

const NOT_IMPLEMENTED_DEFAULT_GL_ACCOUNTS =
  'No company-wide default GL accounts object exists yet (confirmed by the G1 audit — ' +
  'only per-category asset GL mappings, payroll_account_mappings, and CoA control-account ' +
  'flags exist today). This method is an explicit stub, not a currently-backed capability.';

function mapPolicySet(raw: RawPolicySet): FinancialReportingPolicySetDomainModel {
  return {
    id: raw.id,
    workspaceId: raw.workspace_id ?? '',
    title: raw.title,
    status: raw.status,
    versionNo: raw.version_no,
    policies: (raw.policies || []).map((p) => ({
      id: p.id,
      policyCode: p.policy_code,
      title: p.title,
      body: p.body,
      sortOrder: p.sort_order,
      status: p.status,
    })),
  };
}

export class AccountingPoliciesService implements AccountingPoliciesReadAPI, AccountingPoliciesMutationAPI {
  async getMaterialitySettings(companyId: string): Promise<MaterialitySettingsDomainModel | null> {
    assertGovernanceDomainActive('accountingPolicies');
    const raw = (await accountingApi.materialitySettings(companyId)) as RawMaterialityRow | null;
    if (!raw) return null;
    return {
      companyId,
      percentageThreshold: raw.percentage_threshold,
      absoluteThreshold: raw.absolute_threshold,
    };
  }

  /**
   * Pass-through of today's implicit display currency (formatCurrency / EFS
   * wizard defaults). No companies.currency column exists — this does not
   * invent a store.
   */
  async getCurrencyDefault(companyId: string): Promise<CurrencyDefaultDomainModel> {
    assertGovernanceDomainActive('accountingPolicies');
    return {
      companyId,
      defaultCurrency: IMPLICIT_DEFAULT_CURRENCY,
      source: 'implicit_product_default',
    };
  }

  /**
   * Pass-through of tax_rates.is_default via the existing tax-rates edge.
   * Does not activate the Tax governance domain (out of scope for G3.4).
   */
  async getDefaultTaxTreatment(companyId: string): Promise<TaxDefaultDomainModel | null> {
    assertGovernanceDomainActive('accountingPolicies');
    const { data, error } = await supabase.functions.invoke('tax-rates', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    const rows = (data as RawTaxRateRow[] | null) ?? [];
    const def = rows.find((r) => r.is_default) ?? null;
    if (!def) return null;
    return {
      companyId,
      taxRateId: def.id,
      name: def.name,
      rate: def.rate,
      source: 'tax_rates.is_default',
    };
  }

  async getDepreciationDefault(_companyId: string): Promise<DepreciationDefaultDomainModel | null> {
    assertGovernanceDomainActive('accountingPolicies');
    throw new Error(NOT_IMPLEMENTED_DEPRECIATION);
  }

  /**
   * Pass-through of today's implicit inventory cost-method fallback
   * (ProductForm + inventory edge: product.cost_method || 'weighted_average').
   * No company-wide inventory valuation table exists — this does not invent one.
   */
  async getInventoryValuationDefault(companyId: string): Promise<InventoryValuationDefaultDomainModel> {
    assertGovernanceDomainActive('accountingPolicies');
    return {
      companyId,
      defaultCostMethod: IMPLICIT_INVENTORY_COST_METHOD,
      source: 'implicit_product_default',
    };
  }

  async getDefaultGlAccounts(_companyId: string): Promise<DefaultGlAccountsDomainModel | null> {
    assertGovernanceDomainActive('accountingPolicies');
    throw new Error(NOT_IMPLEMENTED_DEFAULT_GL_ACCOUNTS);
  }

  /**
   * Pass-through of today's implicit reporting defaults (same ZAR used by
   * formatCurrency and NewEngagementWizard). No separate reporting-defaults
   * table exists.
   */
  async getReportingDefaults(companyId: string): Promise<ReportingDefaultsDomainModel> {
    assertGovernanceDomainActive('accountingPolicies');
    return {
      companyId,
      reportingCurrency: IMPLICIT_DEFAULT_CURRENCY,
      source: 'implicit_product_default',
    };
  }

  /**
   * Authoritative read of EFS narrative accounting policy sets. Identical
   * call to the pre-migration documentModel / orchestrator path.
   */
  async listAccountingPolicySets(
    companyId: string,
    workspaceId: string,
  ): Promise<FinancialReportingPolicySetDomainModel[]> {
    assertGovernanceDomainActive('accountingPolicies');
    const rows = await invokeFinancialStatements<RawPolicySet[]>(
      companyId,
      'LIST_ACCOUNTING_POLICY_SETS',
      { workspace_id: workspaceId },
    );
    return (rows || []).map(mapPolicySet);
  }

  /**
   * Low-level list returning the RAW edge shape so documentModel / orchestrator
   * can keep their existing mappers unchanged (byte-identical behaviour).
   */
  async listAccountingPolicySetsRaw(companyId: string, workspaceId: string): Promise<RawPolicySet[]> {
    assertGovernanceDomainActive('accountingPolicies');
    return (
      (await invokeFinancialStatements<RawPolicySet[]>(companyId, 'LIST_ACCOUNTING_POLICY_SETS', {
        workspace_id: workspaceId,
      })) || []
    );
  }

  async createAccountingPolicySet(
    companyId: string,
    workspaceId: string,
    frameworkPackId: string,
    title?: string,
  ): Promise<unknown> {
    assertGovernanceDomainActive('accountingPolicies');
    // Payload mirrors pre-migration callers: title is included only when supplied
    // (DisclosurePanel omitted it; documentModel/orchestrator passed 'Accounting Policies').
    const body: Record<string, unknown> = {
      workspace_id: workspaceId,
      framework_pack_id: frameworkPackId,
    };
    if (title !== undefined) body.title = title;
    return invokeFinancialStatements(companyId, 'CREATE_ACCOUNTING_POLICY_SET', body);
  }

  async upsertAccountingPolicy(
    companyId: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    assertGovernanceDomainActive('accountingPolicies');
    return invokeFinancialStatements(companyId, 'UPSERT_ACCOUNTING_POLICY', payload);
  }

  async setMaterialitySettings(
    companyId: string,
    percentageThreshold: number,
    absoluteThreshold: number,
  ): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('accountingPolicies');
    const validation = validateMaterialitySettings({ percentageThreshold, absoluteThreshold });
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };

    try {
      await accountingApi.setMaterialitySettings(companyId, percentageThreshold, absoluteThreshold);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export function createAccountingPoliciesService(): AccountingPoliciesService {
  return new AccountingPoliciesService();
}

// Shared singleton — stateless façade, consumed the same way as
// financialCalendarService / companyService / corporateGovernanceService.
export const accountingPoliciesService = createAccountingPoliciesService();
