// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ARCHITECTURE NOTE:
// This function acts as a secure API gateway for all loan-related operations.
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

    let data, error;

    switch (method) {
      case 'GET_ALL':
        ({ data, error } = await supabaseAdmin
          .from('loans')
          .select('id, principal_amount, interest_rate, status, loan_agreement_url, vendors ( name )')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false }));
        break;
      
      case 'GET_ONE':
        const { data: loanData, error: loanError } = await supabaseAdmin
          .from('loans')
          .select('*, vendors(name)')
          .eq('id', body.loanId)
          .eq('company_id', company_id)
          .single();
        if (loanError) throw loanError;

        const { data: scheduleData, error: scheduleError } = await supabaseAdmin
          .from('loan_amortization_schedule')
          .select('*')
          .eq('loan_id', body.loanId)
          .order('payment_number', { ascending: true });
        if (scheduleError) throw scheduleError;
        
        data = { loan: loanData, schedule: scheduleData };
        break;

      case 'POST':
        const { loanData: postLoanData, deposit_account_id, lender_name } = body;
        
        const { data: newLoan, error: loanInsertError } = await supabaseAdmin
          .from('loans')
          .insert({ ...postLoanData, company_id })
          .select('id')
          .single();
        if (loanInsertError) throw loanInsertError;

        const { data: entry, error: entryError } = await supabaseAdmin
          .from('journal_entries')
          .insert({
            company_id: company_id,
            entry_date: postLoanData.start_date,
            description: `Loan received from ${lender_name}`,
            vendor_id: postLoanData.lender_id,
          })
          .select('id')
          .single();
        if (entryError) throw entryError;

        const journalItems = [
          { journal_entry_id: entry.id, account_id: deposit_account_id, type: 'debit', amount: postLoanData.principal_amount },
          { journal_entry_id: entry.id, account_id: postLoanData.liability_account_id, type: 'credit', amount: postLoanData.principal_amount },
        ];
        const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert(journalItems);
        if (itemsError) throw itemsError;

        const { error: rpcError } = await supabaseAdmin.rpc('generate_amortization_schedule', { p_loan_id: newLoan.id });
        if (rpcError) throw rpcError;
        
        data = newLoan;
        break;

      case 'RECORD_PAYMENT':
        ({ data, error } = await supabaseAdmin.rpc('record_loan_payment', {
          p_schedule_item_id: body.schedule_item_id,
          p_payment_date: body.payment_date,
          p_bank_account_id: body.bank_account_id,
          p_interest_expense_account_id: body.interest_expense_account_id,
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