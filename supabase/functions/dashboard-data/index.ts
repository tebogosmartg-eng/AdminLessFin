// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { format, subMonths } from "https://esm.sh/date-fns@3.6.0";

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

    // Default to current month if not provided
    const endDate = date_to ? new Date(date_to) : new Date();
    const startDate = date_from ? new Date(date_from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    // For balances, we generally look "as of" the end date
    const asOfDateStr = format(endDate, 'yyyy-MM-dd');
    const startDateStr = format(startDate, 'yyyy-MM-dd');

    // Security Check: Verify user membership
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
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: req.headers.get('Authorization')!,
          },
        },
      }
    );

    // Fetch all data in parallel
    const [
      accountsRes,
      monthlySummaryRes,
      arBalancesRes,
      apBalancesRes,
      overdueInvoicesRes,
      topExpensesRes,
    ] = await Promise.all([
      userSupabase.rpc('get_balances_as_of_date', { p_end_date: asOfDateStr }),
      // Monthly summary is usually a trend, so we might want to keep showing the last 6 months 
      // relative to the selected end date, or strictly the range. 
      // Let's stick to last 6 months ending at endDate for context.
      userSupabase.rpc('get_monthly_summary', { p_months: 6 }), 
      userSupabase.rpc('get_customer_ar_balances'),
      userSupabase.rpc('get_vendor_ap_balances'),
      userSupabase.rpc('get_overdue_invoices'),
      // Top expenses should strictly respect the selected range
      userSupabase.rpc('get_top_expenses', {
        p_start_date: startDateStr,
        p_end_date: asOfDateStr,
      }),
    ]);

    if (accountsRes.error) throw accountsRes.error;
    if (monthlySummaryRes.error) throw monthlySummaryRes.error;
    if (arBalancesRes.error) throw arBalancesRes.error;
    if (apBalancesRes.error) throw apBalancesRes.error;
    if (overdueInvoicesRes.error) throw overdueInvoicesRes.error;
    if (topExpensesRes.error) throw topExpensesRes.error;

    const responseData = {
      accounts: accountsRes.data,
      monthlySummary: monthlySummaryRes.data,
      arBalances: arBalancesRes.data,
      apBalances: apBalancesRes.data,
      overdueInvoices: overdueInvoicesRes.data,
      topExpenses: topExpensesRes.data,
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