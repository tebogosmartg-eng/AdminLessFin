// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { format, startOfMonth, endOfMonth } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the user's auth token to verify permissions
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get the authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { company_id } = await req.json();
    if (!company_id) {
      throw new Error("Company ID is required.");
    }

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

    // Use the admin client for database operations to bypass RLS,
    // as we have already performed our security check.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // We need to impersonate the user to call RPC functions that use auth.uid()
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
      supabaseAdmin.from('chart_of_accounts').select('*').eq('company_id', company_id),
      userSupabase.rpc('get_monthly_summary', { p_months: 6 }),
      userSupabase.rpc('get_customer_ar_balances'),
      userSupabase.rpc('get_vendor_ap_balances'),
      userSupabase.rpc('get_overdue_invoices'),
      userSupabase.rpc('get_top_expenses', {
        p_start_date: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        p_end_date: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      }),
    ]);

    // Check for errors in each response
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