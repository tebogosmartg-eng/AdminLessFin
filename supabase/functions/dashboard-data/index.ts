// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { format, addDays } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

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
    ];

    // Admin-only financial data promises
    if (isAdmin) {
        promises.push(userSupabase.rpc('get_balances_as_of_date', { p_end_date: asOfDateStr }));
        promises.push(userSupabase.rpc('get_monthly_summary', { p_months: 6 }));
        promises.push(userSupabase.rpc('get_vendor_ap_balances'));
        promises.push(userSupabase.rpc('get_top_expenses', { p_start_date: startDateStr, p_end_date: asOfDateStr }));
        // Forecast Data
        promises.push(supabaseAdmin.from('invoices').select('due_date, journal_entries(journal_entry_items(amount, type))').eq('company_id', company_id).neq('status', 'paid').neq('status', 'void').gte('due_date', format(new Date(), 'yyyy-MM-dd')).order('due_date', { ascending: true }));
        promises.push(supabaseAdmin.from('bills').select('due_date, journal_entries(journal_entry_items(amount, type))').eq('company_id', company_id).neq('status', 'paid').neq('status', 'void').gte('due_date', format(new Date(), 'yyyy-MM-dd')).order('due_date', { ascending: true }));
        // Revenue Data for Top Customers chart
        promises.push(supabaseAdmin.from('journal_entries').select('customer_id, customers(name), journal_entry_items(amount, type, account_id)').eq('company_id', company_id).gte('entry_date', startDateStr).lte('entry_date', asOfDateStr).not('customer_id', 'is', null));
    }

    const results = await Promise.all(promises);

    // Map base results
    const arBalancesRes = results[0];
    const overdueInvoicesRes = results[1];
    const lowStockRes = results[2];
    const pendingClaimsRes = results[3];
    const draftInvoicesRes = results[4];
    const openBillsRes = results[5];
    const expiringQuotesRes = results[6];
    const recentActivityRes = results[7];
    const companyRes = results[8];
    const customersCheck = results[9];
    const vendorsCheck = results[10];
    const entriesCheck = results[11];

    let accountsRes = { data: [] }, monthlySummaryRes = { data: [] }, apBalancesRes = { data: [] }, topExpensesRes = { data: [] }, futureInvoicesRes = { data: [] }, futureBillsRes = { data: [] }, revenueRes = { data: [] };
    let forecast = [], topCustomers = [];

    if (isAdmin) {
        accountsRes = results[12];
        monthlySummaryRes = results[13];
        apBalancesRes = results[14];
        topExpensesRes = results[15];
        futureInvoicesRes = results[16];
        futureBillsRes = results[17];
        revenueRes = results[18];

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

        // --- Cash Flow Forecast Calculation ---
        const bankKeywords = ['cash', 'bank', 'checking', 'savings'];
        let runningBalance = accountsRes.data
            ?.filter(a => a.type === 'Asset' && bankKeywords.some(k => a.name.toLowerCase().includes(k)))
            .reduce((sum, a) => sum + a.balance, 0) || 0;

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const changesByDate = {};

        (futureInvoicesRes.data || []).forEach(inv => {
            const amount = inv.journal_entries?.journal_entry_items?.filter(i => i.type === 'debit').reduce((s, i) => s + i.amount, 0) || 0;
            changesByDate[inv.due_date] = (changesByDate[inv.due_date] || 0) + amount;
        });
        (futureBillsRes.data || []).forEach(bill => {
            const amount = bill.journal_entries?.journal_entry_items?.filter(i => i.type === 'credit').reduce((s, i) => s + i.amount, 0) || 0;
            changesByDate[bill.due_date] = (changesByDate[bill.due_date] || 0) - amount;
        });

        forecast.push({ date: todayStr, balance: runningBalance, type: 'actual' });
        for (let i = 1; i <= 30; i++) {
            const date = format(addDays(new Date(), i), 'yyyy-MM-dd');
            runningBalance += (changesByDate[date] || 0);
            forecast.push({ date, balance: runningBalance, type: 'projected' });
        }
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
      lowStockItems: lowStockRes.data || [],
      actions: {
          pendingClaims: pendingClaimsRes.count || 0,
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
      }
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})