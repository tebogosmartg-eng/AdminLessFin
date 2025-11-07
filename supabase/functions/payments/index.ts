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

    // User-impersonated client for RPC calls
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let data, error;

    switch (method) {
      case 'GET_AR_BALANCES':
        ({ data, error } = await userSupabase.rpc('get_customer_ar_balances'));
        break;

      case 'GET_AP_BALANCES':
        ({ data, error } = await userSupabase.rpc('get_vendor_ap_balances'));
        break;

      case 'RECORD_CUSTOMER_PAYMENT':
        const { customerId, paymentData } = body;
        const { data: entry, error: entryError } = await supabaseAdmin
          .from('journal_entries')
          .insert({
            company_id: company_id,
            entry_date: paymentData.payment_date,
            description: paymentData.description,
            customer_id: customerId,
          })
          .select('id')
          .single();
        if (entryError) throw entryError;

        const customerJournalItems = [
          { journal_entry_id: entry.id, account_id: paymentData.deposit_account_id, type: 'debit', amount: paymentData.amount },
          { journal_entry_id: entry.id, account_id: paymentData.accounts_receivable_id, type: 'credit', amount: paymentData.amount },
        ];
        ({ data, error } = await supabaseAdmin.from('journal_entry_items').insert(customerJournalItems));
        break;

      case 'RECORD_VENDOR_PAYMENT':
        const { vendorId, paymentData: vendorPaymentData } = body;
        const { data: vendorEntry, error: vendorEntryError } = await supabaseAdmin
          .from('journal_entries')
          .insert({
            company_id: company_id,
            entry_date: vendorPaymentData.payment_date,
            description: vendorPaymentData.description,
            vendor_id: vendorId,
          })
          .select('id')
          .single();
        if (vendorEntryError) throw vendorEntryError;

        const vendorJournalItems = [
          { journal_entry_id: vendorEntry.id, account_id: vendorPaymentData.accounts_payable_id, type: 'debit', amount: vendorPaymentData.amount },
          { journal_entry_id: vendorEntry.id, account_id: vendorPaymentData.payment_account_id, type: 'credit', amount: vendorPaymentData.amount },
        ];
        ({ data, error } = await supabaseAdmin.from('journal_entry_items').insert(vendorJournalItems));
        break;

      case 'RECORD_INVOICE_PAYMENT':
        ({ data, error } = await userSupabase.rpc('record_invoice_payment', {
          p_invoice_id: body.invoice_id,
          p_payment_date: body.payment_date,
          p_asset_account_id: body.asset_account_id,
          p_ar_account_id: body.ar_account_id,
        }));
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