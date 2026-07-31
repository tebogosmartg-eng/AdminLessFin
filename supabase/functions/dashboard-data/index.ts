// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { format, addDays } from "https://esm.sh/date-fns@3.6.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import {
  buildStatementTotals,
} from '../_shared/accountingEngineTotals.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('dashboard-data', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { company_id, date_from, date_to } = await req.json();
    if (!company_id) {
      throw new Error("Company ID is required.");
    }

    const endDate = date_to ? new Date(date_to) : new Date();
    const startDate = date_from ? new Date(date_from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const asOfDateStr = format(endDate, 'yyyy-MM-dd');
    const startDateStr = format(startDate, 'yyyy-MM-dd');

    // Security Check
    const { data: member, error: memberError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !member) throw new Error("Permission denied.");

    const isAdmin = ['owner', 'admin'].includes(member.role);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Promises common to all roles — every financial RPC receives explicit company_id
    // (never rely on profiles.active_company_id when the UI company switcher is available).
    const promises = [
      userSupabase.rpc('get_customer_ar_balances', { p_company_id: company_id }),
      userSupabase.rpc('get_overdue_invoices', { p_company_id: company_id }),
      supabaseAdmin.from('products').select('id, name, quantity_on_hand').eq('company_id', company_id).eq('type', 'inventory').lte('quantity_on_hand', 5).limit(5),
      
      // ACTION ITEMS
      supabaseAdmin.from('expense_claims').select('id', { count: 'exact', head: true }).eq('company_id', company_id).eq('status', 'draft'),
      supabaseAdmin.from('payroll_runs').select('id', { count: 'exact', head: true }).eq('company_id', company_id).eq('status', 'draft'),
      supabaseAdmin.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', company_id).eq('status', 'draft'),
      supabaseAdmin.from('bills').select('id', { count: 'exact', head: true }).eq('company_id', company_id).eq('status', 'open'),
      supabaseAdmin.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', company_id).eq('status', 'sent').lte('expiry_date', addDays(new Date(), 3).toISOString().split('T')[0]),
      
      // RECENT ACTIVITY
      supabaseAdmin.from('journal_entries').select('id, entry_date, description, created_at').eq('company_id', company_id).order('created_at', { ascending: false }).limit(5),

      // SETUP PROGRESS CHECKS
      supabaseAdmin.from('companies').select('logo_url, address').eq('id', company_id).single(),
      supabaseAdmin.from('customers').select('id').eq('company_id', company_id).limit(1),
      supabaseAdmin.from('vendors').select('id').eq('company_id', company_id).limit(1),
      supabaseAdmin.from('journal_entries').select('id').eq('company_id', company_id).limit(1),
      // Payroll KPIs (admin)
      isAdmin ? supabaseAdmin.from('payroll_runs').select('id, status, pay_date, output_metadata').eq('company_id', company_id).order('pay_date', { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    ];

    // Admin-only financial data promises
    if (isAdmin) {
        // Scope balances to the active company_id — the SAME engine call the
        // Trial Balance / Balance Sheet (reports edge) makes. Without p_company_id
        // the RPC falls back to profiles.active_company_id, which desyncs from the
        // UI-selected company for multi-company users and returns 0/empty balances.
        promises.push(userSupabase.rpc('get_balances_as_of_date', { p_end_date: asOfDateStr, p_company_id: company_id }));
        // Period P&L activity — SAME engine call as Income Statement (reports edge).
        promises.push(userSupabase.rpc('get_period_activity', { p_start_date: startDateStr, p_end_date: asOfDateStr, p_company_id: company_id }));
        // get_monthly_summary (index 16) — NOT fetched. Its result was assigned
        // and then unconditionally overwritten with CFA partitions below, so the
        // round trip was pure waste. Stubbed rather than deleted to keep the
        // positional results[] mapping identical; nothing downstream changes.
        promises.push(Promise.resolve({ data: [] }));
        promises.push(userSupabase.rpc('get_vendor_ap_balances', { p_company_id: company_id }));
        // get_top_expenses (index 18) — NOT fetched, same reason as index 16.
        promises.push(Promise.resolve({ data: [] }));
        // Bank CoA links — Cash Balance / forecast open from the same bank→GL map.
        promises.push(supabaseAdmin.from('bank_accounts').select('chart_of_account_id').eq('company_id', company_id).eq('status', 'active'));
        // CoA metadata for canonical aggregation (roles / categories) — no money math.
        promises.push(supabaseAdmin.from('chart_of_accounts').select('id, account_role, category, subcategory, account_code, tax_treatment, cash_flow_classification').eq('company_id', company_id));
        // Cash flow statement — same RPC as Reports / Financial Statements.
        promises.push(userSupabase.rpc('get_cash_flow_statement', { p_start_date: startDateStr, p_end_date: asOfDateStr, p_company_id: company_id }));
        // Former indices 22–26 (two joined document queries, two
        // recurring-schedule queries and a journal-entry customer join) are
        // gone. Since the CFA convergence they were assigned to locals that no
        // code read: `expectedPayments`/`topCustomers` are [] and the cash
        // forecast is CFA cash. They were briefly kept as no-op stubs to
        // preserve the positional results[] mapping; nothing indexes past 21,
        // so the stubs are removed too.
    }

    const results = await Promise.all(promises);

    // Map base results
    const arBalancesRes = results[0];
    const overdueInvoicesRes = results[1];
    const lowStockRes = results[2];
    const pendingClaimsRes = results[3];
    const draftPayrollRunsRes = results[4];
    const draftInvoicesRes = results[5];
    const openBillsRes = results[6];
    const expiringQuotesRes = results[7];
    const recentActivityRes = results[8];
    const companyRes = results[9];
    const customersCheck = results[10];
    const vendorsCheck = results[11];
    const entriesCheck = results[12];
    const payrollRunsCheck = results[13];

    let accountsRes = { data: [] }, periodActivityRes = { data: [] }, monthlySummaryRes = { data: [] }, apBalancesRes = { data: [] }, topExpensesRes = { data: [] }, bankAccountsRes = { data: [] }, coaMetaRes = { data: [] }, cashFlowRes = { data: [] };
    let forecast = [], topCustomers = [], expectedPayments = [];
    // SINGLE money field. Every monetary figure the Dashboard renders is read
    // from this object; the former per-KPI scalars (periodNetIncome,
    // periodRevenue, periodExpenses, totalAssets, totalLiabilities,
    // totalStoredEquity, totalEquity, cashBalance) were copies of these very
    // properties and are gone — a copy is a second place to drift.
    let statementTotals = null;

    if (isAdmin) {
        accountsRes = results[14];
        periodActivityRes = results[15];
        // 16 and 18 are the retired get_monthly_summary / get_top_expenses
        // slots: still pushed as no-op stubs to hold the positions of 17 and
        // 19–21, but never read — both charts are rebuilt from CFA below.
        apBalancesRes = results[17];
        bankAccountsRes = results[19];
        coaMetaRes = results[20];
        cashFlowRes = results[21];

        // Canonical Financial Aggregation — ONLY money authority for Dashboard KPIs.
        const bankCoaIds = (bankAccountsRes.data || []).map((a) => a.chart_of_account_id).filter(Boolean);
        const accountMeta = coaMetaRes.data || [];
        const retainedEarningsAccountIds = accountMeta
          .filter((r) => r.account_role === 'retained_earnings')
          .map((r) => r.id);
        const totals = buildStatementTotals({
          balancesAsOf: accountsRes.data,
          periodActivity: periodActivityRes.data,
          cashFlowData: cashFlowRes.data,
          accountMeta,
          retainedEarningsAccountIds,
          bankCoaIds,
        });
        statementTotals = totals;

        // Charts: CFA partitions only — no JE / monthly-summary / top-expenses engines.
        monthlySummaryRes = {
          data: [
            {
              month: `${startDateStr}…${asOfDateStr}`,
              income: totals.totalIncome,
              expenses: totals.totalExpenses,
              net: totals.netIncome,
            },
          ],
        };
        topExpensesRes = {
          data: [
            { name: 'Cost of Sales', amount: totals.costOfSales },
            { name: 'Operating Expenses', amount: totals.operatingExpenses },
            { name: 'Finance Costs', amount: totals.financeCosts },
            { name: 'Tax', amount: totals.taxExpense },
          ].filter((r) => Number(r.amount) !== 0),
        };
        topCustomers = [];
        expectedPayments = [];
        // Forecast opening = CFA cash only (no invoice/bill projection sums).
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        forecast = [{ date: todayStr, balance: totals.cash, type: 'actual' }];
    }

    // Payroll KPIs for dashboard
    let payrollKpis = null;
    if (isAdmin && payrollRunsCheck?.data) {
      const runs = payrollRunsCheck.data;
      const draftRuns = runs.filter(r => r.status === 'draft');
      const lastProcessed = runs.find(r => r.status === 'finalized' || r.status === 'paid');
      const upcoming = draftRuns.sort((a, b) => new Date(a.pay_date).getTime() - new Date(b.pay_date).getTime())[0];
      payrollKpis = {
        upcomingPayDate: upcoming?.pay_date ?? null,
        runStatus: upcoming ? 'draft' : lastProcessed ? lastProcessed.status : 'none',
        bankBatchStatus: lastProcessed?.output_metadata?.bank_batch?.status ?? 'not_generated',
        payslipStatus: lastProcessed?.output_metadata?.payslips_generated
          ? `${lastProcessed.output_metadata.payslips_generated} generated`
          : 'none',
        draftRunCount: draftRuns.length,
      };
    }

    const responseData = {
      role: member.role, // Pass role back to UI for rendering logic
      // Raw as-of GL balance rows. NOT a total — consumed only for per-account
      // display (bank account list) and never summed into a KPI.
      accounts: accountsRes.data || [],
      // The ONE canonical money field: buildStatementTotals() output, i.e.
      // buildCanonicalFinancialAggregation() over get_balances_as_of_date +
      // get_period_activity + get_cash_flow_statement. Null for non-admins.
      // Consumers read these figures and must never re-sum or fall back.
      statementTotals,
      reportingPeriod: { from: startDateStr, to: asOfDateStr },
      monthlySummary: monthlySummaryRes.data || [],
      arBalances: arBalancesRes.data || [],
      apBalances: apBalancesRes.data || [],
      overdueInvoices: overdueInvoicesRes.data || [],
      topExpenses: topExpensesRes.data || [],
      topCustomers: topCustomers.slice(0, 5),
      cashFlowForecast: forecast,
      expectedPayments,
      lowStockItems: lowStockRes.data || [],
      actions: {
          pendingClaims: pendingClaimsRes.count || 0,
          draftPayrollRuns: isAdmin ? (draftPayrollRunsRes.count || 0) : 0,
          draftInvoices: draftInvoicesRes.count || 0,
          openBills: openBillsRes.count || 0,
          expiringQuotes: expiringQuotesRes.count || 0
      },
      recentActivity: recentActivityRes.data || [],
      setupStatus: {
          hasLogo: !!companyRes.data?.logo_url,
          hasAddress: !!companyRes.data?.address,
          hasCustomer: (customersCheck.data?.length || 0) > 0,
          hasVendor: (vendorsCheck.data?.length || 0) > 0,
          hasTransaction: (entriesCheck.data?.length || 0) > 0,
          isComplete: !!companyRes.data?.logo_url && !!companyRes.data?.address && (customersCheck.data?.length || 0) > 0 && (vendorsCheck.data?.length || 0) > 0 && (entriesCheck.data?.length || 0) > 0
      },
      payrollKpis,
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
