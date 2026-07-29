// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { format, addDays } from "https://esm.sh/date-fns@3.6.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


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

    // Promises common to all roles
    const promises = [
      userSupabase.rpc('get_customer_ar_balances'), // AR is operational, needed for sales
      userSupabase.rpc('get_overdue_invoices'), // Operational
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
        promises.push(userSupabase.rpc('get_balances_as_of_date', { p_end_date: asOfDateStr }));
        promises.push(userSupabase.rpc('get_monthly_summary', { p_months: 6 }));
        promises.push(userSupabase.rpc('get_vendor_ap_balances'));
        promises.push(userSupabase.rpc('get_top_expenses', { p_start_date: startDateStr, p_end_date: asOfDateStr }));
        // Forecast Data: Current Open Payables/Receivables (enriched for Expected Payments Explorer)
        promises.push(supabaseAdmin.from('invoices').select('id, invoice_number, due_date, status, customer_id, customers(name, payment_terms, email), journal_entries!journal_entry_id(journal_entry_items(amount, type))').eq('company_id', company_id).neq('status', 'paid').neq('status', 'void').gte('due_date', format(new Date(), 'yyyy-MM-dd')).order('due_date', { ascending: true }));
        promises.push(supabaseAdmin.from('bills').select('due_date, journal_entries!journal_entry_id(journal_entry_items(amount, type))').eq('company_id', company_id).neq('status', 'paid').neq('status', 'void').gte('due_date', format(new Date(), 'yyyy-MM-dd')).order('due_date', { ascending: true }));
        // Forecast Data: Future Recurring Payables/Receivables
        promises.push(supabaseAdmin.from('recurring_invoices').select('next_run_date, recurring_invoice_items(quantity, unit_price)').eq('company_id', company_id).eq('status', 'active').lte('next_run_date', format(addDays(new Date(), 30), 'yyyy-MM-dd')));
        promises.push(supabaseAdmin.from('recurring_bills').select('next_run_date, recurring_bill_items(quantity, unit_cost)').eq('company_id', company_id).eq('status', 'active').lte('next_run_date', format(addDays(new Date(), 30), 'yyyy-MM-dd')));
        // Revenue Data for Top Customers chart
        promises.push(supabaseAdmin.from('journal_entries').select('customer_id, customers(name), journal_entry_items(amount, type, account_id)').eq('company_id', company_id).gte('entry_date', startDateStr).lte('entry_date', asOfDateStr).not('customer_id', 'is', null));
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

    let accountsRes = { data: [] }, monthlySummaryRes = { data: [] }, apBalancesRes = { data: [] }, topExpensesRes = { data: [] }, futureInvoicesRes = { data: [] }, futureBillsRes = { data: [] }, futureRecInvRes = { data: [] }, futureRecBillsRes = { data: [] }, revenueRes = { data: [] };
    let forecast = [], topCustomers = [], expectedPayments = [];

    if (isAdmin) {
        accountsRes = results[14];
        monthlySummaryRes = results[15];
        apBalancesRes = results[16];
        topExpensesRes = results[17];
        futureInvoicesRes = results[18];
        futureBillsRes = results[19];
        futureRecInvRes = results[20];
        futureRecBillsRes = results[21];
        revenueRes = results[22];

        // --- Top Customers Calculation ---
        const incomeAccountIds = new Set(accountsRes.data?.filter(a => a.type === 'Income').map(a => a.id) || []);
        const customerRevenue = {};
        (revenueRes.data || []).forEach(entry => {
            const name = entry.customers?.name || 'Unknown';
            entry.journal_entry_items.forEach(item => {
                if (item.type === 'credit' && incomeAccountIds.has(item.account_id)) {
                customerRevenue[name] = (customerRevenue[name] || 0) + item.amount;
                }
            });
        });
        topCustomers = Object.keys(customerRevenue).map(name => ({ name, amount: customerRevenue[name] }));
        topCustomers.sort((a, b) => b.amount - a.amount);

        // --- Cash Flow Forecast Calculation (cash equivalents by subcategory metadata) ---
        const { data: cashMeta } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', company_id)
          .eq('type', 'Asset')
          .eq('subcategory', 'Cash and Cash Equivalents');
        const cashIds = new Set((cashMeta || []).map((a) => a.id));
        let runningBalance = accountsRes.data
            ?.filter((a) => cashIds.has(a.id))
            .reduce((sum, a) => sum + a.balance, 0) || 0;

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const changesByDate = {};

        // 1. Current Open Invoices & Bills (+ Expected Payments Explorer rows)
        const horizon = format(addDays(new Date(), 30), 'yyyy-MM-dd');
        (futureInvoicesRes.data || []).forEach(inv => {
            const amount = inv.journal_entries?.journal_entry_items?.filter(i => i.type === 'debit').reduce((s, i) => s + i.amount, 0) || 0;
            changesByDate[inv.due_date] = (changesByDate[inv.due_date] || 0) + amount;
            if (inv.due_date <= horizon) {
              expectedPayments.push({
                id: inv.id,
                invoice_number: inv.invoice_number,
                customer_id: inv.customer_id || null,
                customer_name: inv.customers?.name || 'Unknown',
                due_date: inv.due_date,
                amount,
                status: inv.status || 'sent',
                payment_terms: inv.customers?.payment_terms ?? null,
                email: inv.customers?.email ?? null,
              });
            }
        });
        (futureBillsRes.data || []).forEach(bill => {
            const amount = bill.journal_entries?.journal_entry_items?.filter(i => i.type === 'credit').reduce((s, i) => s + i.amount, 0) || 0;
            changesByDate[bill.due_date] = (changesByDate[bill.due_date] || 0) - amount;
        });

        // 2. Future Recurring Invoices & Bills (Predictive)
        (futureRecInvRes.data || []).forEach(inv => {
            // Estimate total (ignoring tax for simplicity in forecast to keep fast)
            const amount = inv.recurring_invoice_items?.reduce((s, i) => s + (i.quantity * i.unit_price), 0) || 0;
            // Assume Net 30 for recurring forecast cash arrival
            const estimatedDueDate = format(addDays(new Date(inv.next_run_date), 30), 'yyyy-MM-dd');
            changesByDate[estimatedDueDate] = (changesByDate[estimatedDueDate] || 0) + amount;
        });
        (futureRecBillsRes.data || []).forEach(bill => {
            const amount = bill.recurring_bill_items?.reduce((s, i) => s + (i.quantity * i.unit_cost), 0) || 0;
            const estimatedDueDate = format(addDays(new Date(bill.next_run_date), 30), 'yyyy-MM-dd');
            changesByDate[estimatedDueDate] = (changesByDate[estimatedDueDate] || 0) - amount;
        });

        forecast.push({ date: todayStr, balance: runningBalance, type: 'actual' });
        for (let i = 1; i <= 30; i++) {
            const date = format(addDays(new Date(), i), 'yyyy-MM-dd');
            runningBalance += (changesByDate[date] || 0);
            forecast.push({ date, balance: runningBalance, type: 'projected' });
        }
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
      accounts: accountsRes.data || [],
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
