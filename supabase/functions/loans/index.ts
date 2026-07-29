// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('loans', 'tenant', async (req, _ctx) => {

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

    if (!company_id) throw new Error("Company ID is required.");

    
    _ctx.companyId = company_id;// SECURITY: Strict RBAC for Loans
    const { data: member, error: memberError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !member) throw new Error("Permission denied.");
    if (!['owner', 'admin'].includes(member.role)) throw new Error("Access Denied: Admin privileges required for Loans.");

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

      case 'POST': {
        const { loanData: postLoanData, deposit_account_id, lender_name } = body;

        const { data: newLoanId, error: disburseError } = await supabaseAdmin.rpc('record_loan_disbursement_atomic', {
          p_company_id: company_id,
          p_lender_id: postLoanData.lender_id,
          p_principal_amount: postLoanData.principal_amount,
          p_interest_rate: postLoanData.interest_rate,
          p_term_months: postLoanData.term_months,
          p_repayment_frequency: postLoanData.repayment_frequency,
          p_start_date: postLoanData.start_date,
          p_loan_agreement_url: postLoanData.loan_agreement_url ?? null,
          p_deposit_account_id: deposit_account_id,
          p_liability_account_id: postLoanData.liability_account_id,
          p_lender_name: lender_name,
          p_actor_user_id: user.id,
        });
        if (disburseError) throw disburseError;

        data = { id: newLoanId };
        break;
      }

      case 'PUT':
        const { loanData: putLoanData, loanId } = body;
        
        const { count, error: countError } = await supabaseAdmin
          .from('loan_amortization_schedule')
          .select('*', { count: 'exact', head: true })
          .eq('loan_id', loanId)
          .eq('status', 'paid');
        
        if (countError) throw countError;

        if (count && count > 0) {
          const { data: currentLoan } = await supabaseAdmin.from('loans').select('principal_amount, interest_rate, term_months, start_date').eq('id', loanId).single();
          
          if (
            currentLoan.principal_amount != putLoanData.principal_amount ||
            currentLoan.interest_rate != putLoanData.interest_rate ||
            currentLoan.term_months != putLoanData.term_months
          ) {
             throw new Error("Cannot update loan terms because payments have already been recorded.");
          }

          const { error: updateError } = await supabaseAdmin
            .from('loans')
            .update(putLoanData)
            .eq('id', loanId)
            .eq('company_id', company_id);
          
          if (updateError) throw updateError;

        } else {
          const { error: updateError } = await supabaseAdmin
            .from('loans')
            .update(putLoanData)
            .eq('id', loanId)
            .eq('company_id', company_id);
          if (updateError) throw updateError;

          await supabaseAdmin.from('loan_amortization_schedule').delete().eq('loan_id', loanId);
          await supabaseAdmin.rpc('generate_amortization_schedule', { p_loan_id: loanId });
        }
        
        data = { id: loanId };
        break;

      case 'RECORD_PAYMENT':
        // record_loan_payment checks is_company_member() internally via
        // auth.uid(), which only resolves when the request carries the
        // calling user's JWT — must use the user-impersonated client, not
        // the service-role admin client (matches the pattern already used
        // for record_invoice_payment in payments/index.ts).
        ({ data, error } = await supabase.rpc('record_loan_payment', {
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
    return edgeFailure(_ctx, error);
  }
}))
