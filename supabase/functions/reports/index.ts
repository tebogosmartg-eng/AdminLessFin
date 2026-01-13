// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

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

    const { company_id, start_date, end_date, prior_date, method } = await req.json();

    if (!company_id) {
      throw new Error("Company ID is required.");
    }

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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: req.headers.get('Authorization')! } }
      }
    );

    if (method === 'GET_TAX_REPORT') {
        // Fetch tax-related journal items
        const { data: taxData, error: taxError } = await supabaseAdmin
          .from('journal_entry_item_tax_rates')
          .select(`
            tax_rates ( name, rate ),
            journal_entry_items!inner (
              amount,
              journal_entries!inner (
                entry_date,
                company_id
              )
            )
          `)
          .eq('journal_entry_items.journal_entries.company_id', company_id)
          .gte('journal_entry_items.journal_entries.entry_date', start_date)
          .lte('journal_entry_items.journal_entries.entry_date', end_date);
        
        if (taxError) throw taxError;
        
        // Aggregate data
        const report = {};
        taxData.forEach((row: any) => {
            const name = row.tax_rates?.name || 'Unknown';
            const rate = row.tax_rates?.rate || 0;
            const netAmount = row.journal_entry_items?.amount || 0;
            const taxAmount = netAmount * (rate / 100);
            
            if (!report[name]) {
                report[name] = { name, rate, netSales: 0, taxCollected: 0 };
            }
            report[name].netSales += netAmount;
            report[name].taxCollected += taxAmount;
        });
        
        return new Response(JSON.stringify(Object.values(report)), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // Default Reports Logic (Financial Statements)
    const promises = [];

    if (end_date) {
      promises.push(userSupabase.rpc('get_balances_as_of_date', { p_end_date: end_date }));
    }
    if (start_date && end_date) {
      promises.push(userSupabase.rpc('get_period_activity', { p_start_date: start_date, p_end_date: end_date }));
      promises.push(userSupabase.rpc('get_cash_flow_statement', { p_start_date: start_date, p_end_date: end_date }));
    }
    if (prior_date) {
        promises.push(userSupabase.rpc('get_balances_as_of_date', { p_end_date: prior_date }));
    }
    
    promises.push(userSupabase.rpc('get_aged_receivables'));
    promises.push(userSupabase.rpc('get_aged_payables'));

    const [
      balancesAsOfRes,
      periodActivityRes,
      cashFlowRes,
      openingBalancesRes,
      agedReceivablesRes,
      agedPayablesRes,
    ] = await Promise.all(promises);

    if (balancesAsOfRes?.error) throw balancesAsOfRes.error;
    if (periodActivityRes?.error) throw periodActivityRes.error;
    if (cashFlowRes?.error) throw cashFlowRes.error;
    if (openingBalancesRes?.error) throw openingBalancesRes.error;
    if (agedReceivablesRes?.error) throw agedReceivablesRes.error;
    if (agedPayablesRes?.error) throw agedPayablesRes.error;

    const responseData = {
      balancesAsOf: balancesAsOfRes?.data,
      periodActivity: periodActivityRes?.data,
      cashFlowData: cashFlowRes?.data,
      openingBalances: openingBalancesRes?.data,
      agedReceivables: agedReceivablesRes?.data,
      agedPayables: agedPayablesRes?.data,
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