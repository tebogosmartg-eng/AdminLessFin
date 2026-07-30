// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { format, subMonths, subYears, startOfMonth, endOfMonth } from "https://esm.sh/date-fns@3.6.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import {
  buildStatementTotals,
  buildComparativeBalanceSheetTotals,
  buildComparativePlMonthTotals,
  buildCanonicalFinancialAggregation,
} from '../_shared/accountingEngineTotals.ts'
import { loadCanonicalAggregation } from '../_shared/loadCanonicalAggregation.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

async function loadCoaAggregationMeta(admin, company_id) {
  const { data, error } = await admin
    .from('chart_of_accounts')
    .select('id, account_role, category, subcategory, account_code, tax_treatment, cash_flow_classification')
    .eq('company_id', company_id);
  if (error) throw error;
  return data || [];
}

async function loadRetainedEarningsAccountIds(admin, company_id) {
  const meta = await loadCoaAggregationMeta(admin, company_id);
  return meta.filter((r) => r.account_role === 'retained_earnings').map((r) => r.id);
}

serve(withEnterprisePlatform('reports', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { company_id, start_date, end_date, prior_date, method } = await req.json();

    if (!company_id) throw new Error("Company ID is required.");

    // Security Check
    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) throw new Error("Permission denied.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // --- Comparative Balance Sheet ---
    if (method === 'GET_COMPARATIVE_BS') {
        const currentDate = end_date;
        const priorDate = format(subYears(new Date(currentDate), 1), 'yyyy-MM-dd');
        // Optional start_date: when provided, CYE = get_period_activity for current & prior-year windows
        // (same Income Statement engine as Reports / Financial Statements).
        const currentStart = start_date || null;
        const priorStart = currentStart
          ? format(subYears(new Date(currentStart), 1), 'yyyy-MM-dd')
          : null;

        const { data: currentBalances, error: currError } = await userSupabase.rpc('get_balances_as_of_date', {
            p_end_date: currentDate,
            p_company_id: company_id
        });
        if (currError) throw currError;

        const { data: priorBalances, error: priorError } = await userSupabase.rpc('get_balances_as_of_date', {
            p_end_date: priorDate,
            p_company_id: company_id
        });
        if (priorError) throw priorError;

        let netIncomeCurrent = 0;
        let netIncomePrior = 0;
        if (currentStart && priorStart) {
            const [currAct, priorAct] = await Promise.all([
                userSupabase.rpc('get_period_activity', {
                    p_start_date: currentStart,
                    p_end_date: currentDate,
                    p_company_id: company_id,
                }),
                userSupabase.rpc('get_period_activity', {
                    p_start_date: priorStart,
                    p_end_date: priorDate,
                    p_company_id: company_id,
                }),
            ]);
            if (currAct.error) throw currAct.error;
            if (priorAct.error) throw priorAct.error;
            netIncomeCurrent = buildCanonicalFinancialAggregation({
              periodActivity: currAct.data,
            }).netProfit;
            netIncomePrior = buildCanonicalFinancialAggregation({
              periodActivity: priorAct.data,
            }).netProfit;
        }

        // Merge logic
        const reportData = {};
        
        [...(currentBalances || []), ...(priorBalances || [])].forEach(acc => {
            if (!reportData[acc.id]) {
                reportData[acc.id] = { 
                    name: acc.name, 
                    type: acc.type, 
                    current: 0, 
                    prior: 0 
                };
            }
        });

        currentBalances?.forEach(acc => { reportData[acc.id].current = acc.balance; });
        priorBalances?.forEach(acc => { reportData[acc.id].prior = acc.balance; });

        const accounts = Object.values(reportData);
        const netIncome = { current: netIncomeCurrent, prior: netIncomePrior };
        const totals = buildComparativeBalanceSheetTotals(accounts, netIncome);

        return new Response(JSON.stringify({ 
            accounts,
            dates: { current: currentDate, prior: priorDate },
            netIncome,
            totals,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // --- Comparative P&L ---
    if (method === 'GET_COMPARATIVE_PL') {
        const monthsCount = 3;
        const months = [];
        for (let i = 0; i < monthsCount; i++) {
            const date = subMonths(new Date(end_date), i);
            months.push({
                start: format(startOfMonth(date), 'yyyy-MM-dd'),
                end: format(endOfMonth(date), 'yyyy-MM-dd'),
                label: format(date, 'MMM yyyy')
            });
        }

        const reportData = {};

        for (const month of months) {
            const { data, error } = await userSupabase.rpc('get_period_activity', {
                p_start_date: month.start,
                p_end_date: month.end,
                p_company_id: company_id,
            });
            if (error) throw error;

            data.forEach(acc => {
                if (!reportData[acc.id]) {
                    reportData[acc.id] = { name: acc.name, type: acc.type, values: {} };
                }
                reportData[acc.id].values[month.label] = acc.activity;
            });
        }

        const accounts = Object.values(reportData);
        const monthTotals = buildComparativePlMonthTotals(
          accounts,
          months.map((m) => m.label),
        );

        return new Response(JSON.stringify({ months, accounts, monthTotals }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // --- (Keep existing methods...) ---
    if (method === 'GET_INVENTORY_VALUATION') {
        const { data: products, error } = await supabaseAdmin
          .from('products')
          .select('*')
          .eq('company_id', company_id)
          .eq('type', 'inventory')
          .order('name');
        if (error) throw error;

        const { data: balances } = await supabaseAdmin
          .from('inv_balances')
          .select('product_id, qty_on_hand, avg_unit_cost')
          .eq('company_id', company_id);

        const byProduct = {};
        for (const b of balances || []) {
          byProduct[b.product_id] = byProduct[b.product_id] || { qty: 0, value: 0 };
          byProduct[b.product_id].qty += Number(b.qty_on_hand || 0);
          byProduct[b.product_id].value += Number(b.qty_on_hand || 0) * Number(b.avg_unit_cost || 0);
        }

        const valuation = (products || []).map((p) => {
          const agg = byProduct[p.id];
          const quantity = agg ? agg.qty : Number(p.quantity_on_hand || 0);
          const cost = agg && agg.qty > 0
            ? agg.value / agg.qty
            : Number(p.cost || p.standard_cost || 0);
          return {
            id: p.id,
            name: p.name,
            quantity,
            cost,
            totalValue: quantity * cost,
          };
        });
        return new Response(JSON.stringify(valuation), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (method === 'GET_PROJECT_PROFITABILITY') {
        // Company money = CFA only. Per-project JE aggregation removed (no parallel P&L engine).
        const { data: projects, error: projError } = await supabaseAdmin
          .from('projects')
          .select('id, name, status, customers(name)')
          .eq('company_id', company_id)
          .order('name');
        if (projError) throw projError;

        const cfa = await loadCanonicalAggregation({
          admin: supabaseAdmin,
          rpc: userSupabase,
          company_id,
          start_date: start_date || null,
          end_date: end_date || format(new Date(), 'yyyy-MM-dd'),
        });

        const rows = (projects || []).map((p) => ({
          id: p.id,
          name: p.name,
          customer: p.customers?.name || '-',
          status: p.status,
          // Project-level allocation is not a CFA output — do not invent from journals.
          revenue: null,
          expenses: null,
          profit: null,
          margin: null,
          money_source: 'canonical_financial_aggregation_company_only',
        }));

        return new Response(JSON.stringify({
          projects: rows,
          company: {
            revenue: cfa.totalIncome,
            expenses: cfa.totalExpenses,
            profit: cfa.netIncome,
            margin: cfa.totalIncome > 0 ? (cfa.netIncome / cfa.totalIncome) * 100 : 0,
          },
          canonicalAggregation: cfa,
          money_source: 'canonical_financial_aggregation',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (method === 'GET_TAX_REPORT') {
        // VAT authority = CFA GL role balances (vatPayable / vatReceivable / vatNet).
        // Rate × base schedule removed — no parallel VAT engine.
        const cfa = await loadCanonicalAggregation({
          admin: supabaseAdmin,
          rpc: userSupabase,
          company_id,
          start_date: start_date || null,
          end_date: end_date || format(new Date(), 'yyyy-MM-dd'),
        });
        return new Response(JSON.stringify({
          money_source: 'canonical_financial_aggregation',
          vatPayable: cfa.vatPayable,
          vatReceivable: cfa.vatReceivable,
          vatNet: cfa.vatNet,
          outputVat: cfa.vatPayable,
          inputVat: cfa.vatReceivable,
          netVatLiability: cfa.vatNet,
          canonicalAggregation: cfa,
          // Empty schedule — CFA is sole monetary authority for this report.
          schedule: [],
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const balancesPromise = end_date
      ? userSupabase.rpc('get_balances_as_of_date', { p_end_date: end_date, p_company_id: company_id })
      : Promise.resolve({ data: null, error: null });
    const periodPromise = start_date && end_date
      ? userSupabase.rpc('get_period_activity', { p_start_date: start_date, p_end_date: end_date, p_company_id: company_id })
      : Promise.resolve({ data: null, error: null });
    const cashFlowPromise = start_date && end_date
      ? userSupabase.rpc('get_cash_flow_statement', { p_start_date: start_date, p_end_date: end_date, p_company_id: company_id })
      : Promise.resolve({ data: null, error: null });
    const openingPromise = prior_date
      ? userSupabase.rpc('get_balances_as_of_date', { p_end_date: prior_date, p_company_id: company_id })
      : Promise.resolve({ data: null, error: null });

    const [
      balancesAsOfRes,
      periodActivityRes,
      cashFlowRes,
      openingBalancesRes,
      agedReceivablesRes,
      agedPayablesRes,
    ] = await Promise.all([
      balancesPromise,
      periodPromise,
      cashFlowPromise,
      openingPromise,
      userSupabase.rpc('get_aged_receivables', { p_company_id: company_id }),
      userSupabase.rpc('get_aged_payables', { p_company_id: company_id }),
    ]);
    if (balancesAsOfRes?.error) throw balancesAsOfRes.error;
    if (periodActivityRes?.error) throw periodActivityRes.error;
    if (cashFlowRes?.error) throw cashFlowRes.error;
    if (openingBalancesRes?.error) throw openingBalancesRes.error;

    const accountMeta = await loadCoaAggregationMeta(supabaseAdmin, company_id);
    const retainedEarningsAccountIds = accountMeta
      .filter((r) => r.account_role === 'retained_earnings')
      .map((r) => r.id);
    const statementTotals = buildStatementTotals({
      balancesAsOf: balancesAsOfRes?.data,
      periodActivity: periodActivityRes?.data,
      cashFlowData: cashFlowRes?.data,
      openingBalances: openingBalancesRes?.data,
      retainedEarningsAccountIds,
      accountMeta,
    });

    return new Response(JSON.stringify({
      balancesAsOf: balancesAsOfRes?.data,
      periodActivity: periodActivityRes?.data,
      cashFlowData: cashFlowRes?.data,
      openingBalances: openingBalancesRes?.data,
      agedReceivables: agedReceivablesRes?.data,
      agedPayables: agedPayablesRes?.data,
      statementTotals,
      canonicalAggregation: statementTotals,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
