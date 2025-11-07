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

    const { method, body } = await req.json();
    const { company_id } = body;

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
      throw new Error("Permission denied.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let data, error;

    switch (method) {
      case 'GET_LEDGER_ENTRIES':
        ({ data, error } = await supabaseAdmin
          .from('journal_entry_items')
          .select(`
            amount,
            type,
            journal_entries (
              id,
              entry_date,
              description
            )
          `)
          .eq('account_id', body.account_id)
          .order('entry_date', { foreignTable: 'journal_entries', ascending: true }));
        break;

      case 'GET_BANK_ACCOUNTS':
        ({ data, error } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('*')
          .eq('company_id', company_id)
          .eq('type', 'Asset')
          .order('name'));
        break;

      case 'GET_RECONCILIATION_TRANSACTIONS':
        ({ data, error } = await supabaseAdmin
          .from('journal_entry_items')
          .select(`
            id,
            amount,
            type,
            journal_entries (
              entry_date,
              description
            )
          `)
          .eq('account_id', body.account_id)
          .eq('reconciled', false)
          .lte('journal_entries.entry_date', body.statement_end_date));
        break;

      case 'GET_BOOK_BALANCE':
        ({ data, error } = await userSupabase.rpc('get_balances_as_of_date', {
          p_end_date: body.statement_end_date,
        }));
        if (!error) {
            data = data.find(acc => acc.id === body.account_id);
        }
        break;

      case 'FINISH_RECONCILIATION':
        ({ data, error } = await supabaseAdmin
          .from('journal_entry_items')
          .update({ reconciled: true, reconciled_at: new Date().toISOString() })
          .in('id', body.cleared_ids));
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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})