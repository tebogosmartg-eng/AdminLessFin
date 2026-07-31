import { supabase } from '../integrations/supabase/client';

export type AccountingFilters = {
  financial_year_id?: string;
  accounting_period_id?: string;
  module?: string;
  document_type?: string;
  source?: string;
  status?: string;
  currency?: string;
  account_id?: string;
  date_from?: string;
  date_to?: string;
  journal_number?: string;
  search?: string;
  user?: string;
};

// Certification Blocker 2: supabase.functions.invoke() flattens every
// non-2xx response into the same generic "Edge Function returned a non-2xx
// status code" on error.message — the real, human-readable business message
// the edge function actually sent (via edgeFailure/enterpriseEdgePlatform)
// only exists on error.context, a raw Response whose body must be read
// separately. Without this, every error-state card in the workspace would
// show that one generic sentence no matter what actually went wrong.
async function invokeAccounting<T>(companyId: string, method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('accounting', {
    body: { method, company_id: companyId, ...payload },
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    let realMessage: string | null = null;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        const candidate = body?.businessMessage || body?.technicalMessage || body?.error;
        if (typeof candidate === 'string' && candidate) realMessage = candidate;
      } catch {
        // response body wasn't JSON — fall back to the generic message below
      }
    }
    throw new Error(realMessage || error.message);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export const accountingApi = {
  context: (companyId: string) => invokeAccounting(companyId, 'GET_ENTERPRISE_CONTEXT'),
  dashboard: (companyId: string) => invokeAccounting(companyId, 'GET_ACCOUNTING_DASHBOARD'),
  ledger: (companyId: string, page: number, pageSize: number, filters: AccountingFilters) =>
    invokeAccounting<{ rows: LedgerRow[]; total: number; page: number; page_size: number }>(companyId, 'GET_ENTERPRISE_LEDGER', {
      page,
      page_size: pageSize,
      filters,
    }),
  trialBalance: (companyId: string, startDate: string, endDate: string) =>
    invokeAccounting(companyId, 'GET_TRIAL_BALANCE', { start_date: startDate, end_date: endDate }),
  hierarchicalTrialBalance: (companyId: string, startDate: string, endDate: string) =>
    invokeAccounting(companyId, 'GET_HIERARCHICAL_TRIAL_BALANCE', { start_date: startDate, end_date: endDate }),
  trialBalanceExpand: (companyId: string, accountId: string, startDate: string, endDate: string) =>
    invokeAccounting(companyId, 'GET_TRIAL_BALANCE_EXPAND', { account_id: accountId, start_date: startDate, end_date: endDate }),
  postingRequests: (companyId: string, page: number, pageSize: number, filters: AccountingFilters) =>
    invokeAccounting(companyId, 'GET_POSTING_REQUESTS', { page, page_size: pageSize, filters }),
  postingTimeline: (companyId: string, postingRequestId: string) =>
    invokeAccounting(companyId, 'GET_POSTING_TIMELINE', { posting_request_id: postingRequestId }),
  traceability: (companyId: string, anchors: {
    journal_entry_id?: string;
    posting_request_id?: string;
    account_id?: string;
    document_id?: string;
  }) => invokeAccounting(companyId, 'GET_TRACEABILITY', anchors),
  /**
   * Reporting dates are optional and forwarded to the edge. Passing them makes
   * the inquiry honour the configured financial year instead of the edge's
   * calendar-year fallback; omitting them preserves the previous behaviour.
   */
  accountInquiry: (
    companyId: string,
    accountId: string,
    period?: { start_date?: string | null; end_date?: string | null },
  ) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_INQUIRY', {
      account_id: accountId,
      start_date: period?.start_date ?? undefined,
      end_date: period?.end_date ?? undefined,
    }),
  accountActivity: (companyId: string, accountId: string, opts: {
    page?: number; page_size?: number; start_date?: string; end_date?: string; group_by?: string;
  }) => invokeAccounting(companyId, 'GET_ACCOUNT_ACTIVITY_WORKSPACE', { account_id: accountId, ...opts }),
  accountExplainer: (companyId: string, accountId: string, endDate?: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_BALANCE_EXPLAINER', { account_id: accountId, end_date: endDate }),
  accountAnalytics: (companyId: string, accountId: string, startDate?: string, endDate?: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_ANALYTICS', { account_id: accountId, start_date: startDate, end_date: endDate }),
  accountSourceAnalysis: (companyId: string, accountId: string, startDate?: string, endDate?: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_SOURCE_ANALYSIS', { account_id: accountId, start_date: startDate, end_date: endDate }),
  accountCard: (companyId: string, accountId: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_CARD', { account_id: accountId }),
  accountingTimeline: (companyId: string, page: number, pageSize: number, filters: AccountingFilters = {}) =>
    invokeAccounting(companyId, 'GET_ACCOUNTING_TIMELINE', { page, page_size: pageSize, filters }),
  financialHealth: (companyId: string) => invokeAccounting(companyId, 'GET_FINANCIAL_HEALTH'),
  periodCloseReadiness: (companyId: string) => invokeAccounting(companyId, 'GET_PERIOD_CLOSE_READINESS'),
  exceptions: (companyId: string) => invokeAccounting(companyId, 'GET_EXCEPTIONS'),
  search: (companyId: string, query: string) =>
    invokeAccounting<{ results: SearchResult[] }>(companyId, 'GET_ACCOUNTING_SEARCH', { query }),
  audit: (companyId: string, page: number, pageSize: number, tableName?: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNTING_AUDIT', { page, page_size: pageSize, table_name: tableName }),
  periods: (companyId: string) => invokeAccounting(companyId, 'GET_FINANCIAL_PERIODS'),
  years: (companyId: string) => invokeAccounting(companyId, 'GET_FINANCIAL_YEARS'),

  // Phase 4C — Enterprise Accounting Intelligence (additive read models).
  accountVariance: (companyId: string, accountId: string, asOfDate?: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_VARIANCE', { account_id: accountId, as_of_date: asOfDate }),
  accountDrivers: (companyId: string, accountId: string, startDate?: string, endDate?: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_DRIVERS', { account_id: accountId, start_date: startDate, end_date: endDate }),
  accountInsights: (companyId: string, accountId: string, startDate?: string, endDate?: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_INSIGHTS', { account_id: accountId, start_date: startDate, end_date: endDate }),
  accountComparison: (companyId: string, accountId: string, asOfDate?: string) =>
    invokeAccounting(companyId, 'GET_ACCOUNT_COMPARISON', { account_id: accountId, as_of_date: asOfDate }),
  intelligenceDashboard: (companyId: string, asOfDate?: string) =>
    invokeAccounting(companyId, 'GET_INTELLIGENCE_DASHBOARD', { as_of_date: asOfDate }),
  materialitySettings: (companyId: string) => invokeAccounting(companyId, 'GET_MATERIALITY_SETTINGS'),
  setMaterialitySettings: (companyId: string, percentageThreshold: number, absoluteThreshold: number) =>
    invokeAccounting(companyId, 'SET_MATERIALITY_SETTINGS', { percentage_threshold: percentageThreshold, absolute_threshold: absoluteThreshold }),
};

export type LedgerRow = {
  id: string;
  entry_date: string;
  journal_number: string | null;
  journal_entry_id: string;
  document_type: string | null;
  document_number: string | null;
  document_route: string | null;
  reference: string | null;
  description: string | null;
  account_id: string;
  account_number: number;
  account_name: string;
  debit: number;
  credit: number;
  running_balance: number | null;
  currency: string;
  posting_source: string | null;
  module: string;
  user: string | null;
  status: string;
  company: string | null;
  financial_year: string | null;
  financial_year_id: string | null;
  accounting_period: number | null;
  accounting_period_id: string | null;
  posting_request_id: string | null;
  attachment_url: string | null;
};

export type SearchResult = {
  kind: string;
  id: string;
  label: string;
  subtitle?: string;
  route: string;
  journal_entry_id?: string;
  posting_request_id?: string;
  account_id?: string;
  document_route?: string | null;
};

export const MODULE_OPTIONS = [
  { value: 'all', label: 'All modules' },
  { value: 'manual_journal', label: 'Manual Journals' },
  { value: 'sales_invoice', label: 'Sales' },
  { value: 'accounts_payable', label: 'Purchases' },
  { value: 'banking', label: 'Banking' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'fixed_assets', label: 'Fixed Assets' },
  { value: 'inventory_receipt', label: 'Inventory Receipt' },
  { value: 'inventory_issue', label: 'Inventory Issue' },
];

export const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'committed', label: 'Committed' },
  { value: 'pending', label: 'Pending' },
  { value: 'reversed', label: 'Reversed' },
];
