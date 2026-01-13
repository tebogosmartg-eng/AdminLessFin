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

    // Dates
    const endDate = date_to ? new Date(date_to) : new Date();
    const startDate = date_from ? new Date(date_from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const asOfDateStr = format(endDate, 'yyyy-MM-dd');
    const startDateStr = format(startDate, 'yyyy-MM-dd');

    // Security Check
    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) {
      throw new Error("Permission denied: User is not a member of this company.");
    }

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
      }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // --- Parallel Data Fetching ---
    const promises = [
      userSupabase.rpc('get_balances_as_of_date', { p_end_date: asOfDateStr }),
      userSupabase.rpc('get_monthly_summary', { p_months: 6 }),
      userSupabase.rpc('get_customer_ar_balances'),
      userSupabase.rpc('get_vendor_ap_balances'),
      userSupabase.rpc('get_overdue_invoices'),
      userSupabase.rpc('get_top_expenses', { p_start_date: startDateStr, p_end_date: asOfDateStr }),
      
      // Future Invoices (Inflows)
      supabaseAdmin
        .from('invoices')
        .select('due_date, journal_entries(journal_entry_items(amount, type))')
        .eq('company_id', company_id)
        .neq('status', 'paid')
        .neq('status', 'void')
        .gte('due_date', new Date().toISOString().split('T')[0])
        .order('due_date', { ascending: true }),

      // Future Bills (Outflows)
      supabaseAdmin
        .from('bills')
        .select('due_date, journal_entries(journal_entry_items(amount, type))')
        .eq('company_id', company_id)
        .neq('status', 'paid')
        .gte('due_date', new Date().toISOString().split('T')[0])
        .order('due_date', { ascending: true }),

      // Top Customers (Revenue)
      supabaseAdmin
        .from('journal_entries')
        .select('customer_id, customers(name), journal_entry_items(amount, type, account_id)')
        .eq('company_id', company_id)
        .gte('entry_date', startDateStr)
        .lte('entry_date', asOfDateStr)
        .not('customer_id', 'is', null),

      // Low Stock Items
      supabaseAdmin
        .from('products')
        .select('id, name, quantity_on_hand')
        .eq('company_id', company_id)
        .eq('type', 'inventory')
        .lte('quantity_on_hand', 5)
        .order('quantity_on_hand', { ascending: true })
        .limit(5)
    ];

    const [
      accountsRes,
      monthlySummaryRes,
      arBalancesRes,
      apBalancesRes,
      overdueInvoicesRes,
      topExpensesRes,
      futureInvoicesRes,
      futureBillsRes,
      revenueRes,
      lowStockRes
    ] = await Promise.all(promises);

    // Error Handling
    if (accountsRes.error) throw accountsRes.error;
    if (monthlySummaryRes.error) throw monthlySummaryRes.error;
    if (arBalancesRes.error) throw arBalancesRes.error;
    if (apBalancesRes.error) throw apBalancesRes.error;
    if (overdueInvoicesRes.error) throw overdueInvoicesRes.error;
    if (topExpensesRes.error) throw topExpensesRes.error;
    if (futureInvoicesRes.error) throw futureInvoicesRes.error;
    if (futureBillsRes.error) throw futureBillsRes.error;
    if (revenueRes.error) throw revenueRes.error;
    if (lowStockRes.error) throw lowStockRes.error;

    // --- 1. Top Customers Calculation ---
    const incomeAccountIds = new Set(
      accountsRes.data.filter((a: any) => a.type === 'Income').map((a: any) => a.id)
    );

    const customerRevenue: Record<string, { name: string, amount: number }> = {};
    
    revenueRes.data.forEach((entry: any) => {
      const customerName = entry.customers?.name || 'Unknown';
      entry.journal_entry_items.forEach((item: any) => {
        if (item.type === 'credit' && incomeAccountIds.has(item.account_id)) {
          if (!customerRevenue[customerName]) {
            customerRevenue[customerName] = { name: customerName, amount: 0 };
          }
          customerRevenue[customerName].amount += item.amount;
        }
      });
    });

    const topCustomers = Object.values(customerRevenue)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);


    // --- 2. Cash Flow Forecast Calculation ---
    const bankKeywords = ['cash', 'bank', 'checking', 'savings'];
    let currentCash = accountsRes.data
      .filter((a: any) => a.type === 'Asset' && bankKeywords.some(k => a.name.toLowerCase().includes(k)))
      .reduce((sum: number, a: any) => sum + a.balance, 0);

    const forecast = [];
    const today = new Date();
    let runningBalance = currentCash;
    const changesByDate: Record<string, number> = {};
    
    forecast.push({ date: format(today, 'yyyy-MM-dd'), balance: runningBalance, type: 'actual' });

    futureInvoicesRes.data.forEach((inv: any) => {
      const amount = inv.journal_entries?.journal_entry_items
        .filter((i: any) => i.type === 'debit') 
        .reduce((sum: number, i: any) => sum + i.amount, 0) || 0;
      changesByDate[inv.due_date] = (changesByDate[inv.due_date] || 0) + amount;
    });

    futureBillsRes.data.forEach((bill: any) => {
      const amount = bill.journal_entries?.journal_entry_items
        .filter((i: any) => i.type === 'credit')
        .reduce((sum: number, i: any) => sum + i.amount, 0) || 0;
      changesByDate[bill.due_date] = (changesByDate[bill.due_date] || 0) - amount;
    });

    for (let i = 1; i <= 30; i++) {
      const d = addDays(today, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dailyChange = changesByDate[dateStr] || 0;
      runningBalance += dailyChange;
      forecast.push({ date: dateStr, balance: runningBalance, type: 'projected' });
    }

    const responseData = {
      accounts: accountsRes.data,
      monthlySummary: monthlySummaryRes.data,
      arBalances: arBalancesRes.data,
      apBalances: apBalancesRes.data,
      overdueInvoices: overdueInvoicesRes.data,
      topExpenses: topExpensesRes.data,
      topCustomers: topCustomers,
      cashFlowForecast: forecast,
      lowStockItems: lowStockRes.data,
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