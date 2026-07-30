/**
 * Edge loader for Canonical Financial Aggregation.
 * Does not calculate money — only fetches GL/TB RPC payloads and delegates to CFA.
 */
// @ts-nocheck
import { buildStatementTotals } from './accountingEngineTotals.ts';

export async function loadCanonicalAggregation(params: {
  admin: any;
  rpc: any;
  company_id: string;
  start_date?: string | null;
  end_date?: string | null;
  prior_date?: string | null;
  bankCoaIds?: string[] | null;
}) {
  const { admin, rpc, company_id, start_date, end_date, prior_date, bankCoaIds } = params;

  const [balancesRes, periodRes, cashFlowRes, openingRes, coaRes] = await Promise.all([
    end_date
      ? rpc.rpc('get_balances_as_of_date', { p_end_date: end_date, p_company_id: company_id })
      : Promise.resolve({ data: null, error: null }),
    start_date && end_date
      ? rpc.rpc('get_period_activity', {
          p_start_date: start_date,
          p_end_date: end_date,
          p_company_id: company_id,
        })
      : Promise.resolve({ data: null, error: null }),
    start_date && end_date
      ? rpc.rpc('get_cash_flow_statement', {
          p_start_date: start_date,
          p_end_date: end_date,
          p_company_id: company_id,
        })
      : Promise.resolve({ data: null, error: null }),
    prior_date
      ? rpc.rpc('get_balances_as_of_date', { p_end_date: prior_date, p_company_id: company_id })
      : Promise.resolve({ data: null, error: null }),
    admin
      .from('chart_of_accounts')
      .select(
        'id, account_role, category, subcategory, account_code, tax_treatment, cash_flow_classification',
      )
      .eq('company_id', company_id),
  ]);

  if (balancesRes?.error) throw balancesRes.error;
  if (periodRes?.error) throw periodRes.error;
  if (cashFlowRes?.error) throw cashFlowRes.error;
  if (openingRes?.error) throw openingRes.error;
  if (coaRes?.error) throw coaRes.error;

  const accountMeta = coaRes.data || [];
  return buildStatementTotals({
    balancesAsOf: balancesRes?.data,
    periodActivity: periodRes?.data,
    cashFlowData: cashFlowRes?.data,
    openingBalances: openingRes?.data,
    accountMeta,
    retainedEarningsAccountIds: accountMeta
      .filter((r) => r.account_role === 'retained_earnings')
      .map((r) => r.id),
    bankCoaIds: bankCoaIds || null,
  });
}
