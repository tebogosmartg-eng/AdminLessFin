// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ARCHITECTURE NOTE:
// This function acts as a secure API gateway for all invoice-related database operations.
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

    const body = await req.json();
    const { method, company_id } = body;

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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // User-impersonated client for RPC calls
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let data, error;

    switch (method) {
      case 'GET_ALL':
        ({ data, error } = await supabaseAdmin
          .from('invoices')
          .select(`
            id,
            invoice_number,
            invoice_date,
            due_date,
            status,
            customers ( name ),
            journal_entries (
              journal_entry_items (
                type,
                amount
              )
            )
          `)
          .eq('company_id', company_id)
          .order('invoice_date', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('invoices')
          .select(`
            id,
            invoice_number,
            invoice_date,
            due_date,
            status,
            customers ( name, address, email ),
            journal_entries (
              journal_entry_items (
                id,
                amount,
                type,
                chart_of_accounts ( name ),
                journal_entry_item_tax_rates (
                  tax_rates ( rate )
                )
              )
            )
          `)
          .eq('id', body.invoiceId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'PUT':
        ({ data, error } = await supabaseAdmin
          .from('invoices')
          .update(body.invoiceData)
          .eq('id', body.invoiceId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'VOID':
        ({ error } = await supabaseAdmin.rpc('void_invoice', { p_invoice_id: body.invoiceId }));
        data = { message: 'Invoice voided successfully' };
        break;

      case 'GET_NEXT_INVOICE_NUMBER':
        ({ data, error } = await userSupabase.rpc('get_next_invoice_number_for_user'));
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