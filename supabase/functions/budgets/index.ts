// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

// ARCHITECTURE NOTE:
// This function acts as a secure API gateway for all budget-related database operations.
serve(withEnterprisePlatform('budgets', 'tenant', async (req, _ctx) => {

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

    const body = await req.json();
    const { method, company_id, budgetData, budgetId } = body;

    if (!company_id) {
      throw new Error("Company ID is required.");
    }
    _ctx.companyId = company_id;

    // Security Check: Verify the user is a member of the company they are trying to access.
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY edge function secret.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey
    );

    // User-impersonated client for RPC calls
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let data, error;

    switch (method) {
      case 'GET_ALL': {
        const rpcResult = await userSupabase.rpc('get_budgets_with_activity', { p_company_id: company_id });
        if (!rpcResult.error) {
          data = rpcResult.data;
          break;
        }

        // Fallback when the RPC is missing or fails — return budgets without computed actuals
        const { data: budgets, error: budgetsError } = await supabaseAdmin
          .from('budgets')
          .select('id, account_id, amount, period, start_date')
          .eq('company_id', company_id);

        if (budgetsError) throw budgetsError;

        const accountIds = [...new Set((budgets || []).map((budget: { account_id: string }) => budget.account_id))];
        let accountMap = new Map<string, string>();

        if (accountIds.length > 0) {
          const { data: accounts, error: accountsError } = await supabaseAdmin
            .from('chart_of_accounts')
            .select('id, name')
            .in('id', accountIds);

          if (accountsError) throw accountsError;
          accountMap = new Map((accounts || []).map((account: { id: string; name: string }) => [account.id, account.name]));
        }

        data = (budgets || []).map((budget: { id: string; account_id: string; amount: number; period: string; start_date: string }) => ({
          id: budget.id,
          account_id: budget.account_id,
          amount: budget.amount,
          period: budget.period,
          start_date: budget.start_date,
          account_name: accountMap.get(budget.account_id) ?? 'Unknown',
          actual_amount: 0,
          period_start_date: budget.start_date,
          period_end_date: budget.start_date,
        }));
        break;
      }

      case 'POST':
        ({ data, error } = await supabaseAdmin
          .from('budgets')
          .insert({ ...budgetData, company_id })
          .select()
          .single());
        break;

      case 'PUT':
        ({ data, error } = await supabaseAdmin
          .from('budgets')
          .update(budgetData)
          .eq('id', budgetId)
          .eq('company_id', company_id) // Extra check for safety
          .select()
          .single());
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('budgets')
          .delete()
          .eq('id', budgetId)
          .eq('company_id', company_id)); // Extra check for safety
        break;

      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
