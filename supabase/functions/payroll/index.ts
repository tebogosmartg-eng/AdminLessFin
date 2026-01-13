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

    const body = await req.json();
    const { method, company_id } = body;

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
      case 'GET_RUNS':
        ({ data, error } = await supabaseAdmin
          .from('payroll_runs')
          .select('*')
          .eq('company_id', company_id)
          .order('pay_period_start', { ascending: false }));
        break;

      case 'GET_RUN_DETAIL':
        const { data: runData, error: runError } = await supabaseAdmin.from('payroll_runs').select('*').eq('id', body.runId).single();
        if (runError) throw runError;
        const { data: payslipsData, error: payslipsError } = await supabaseAdmin.from('payslips').select('*, employees(first_name, last_name)').eq('payroll_run_id', body.runId).eq('company_id', company_id);
        if (payslipsError) throw payslipsError;
        data = { run: runData, payslips: payslipsData };
        break;

      case 'CREATE_RUN':
        ({ data, error } = await supabaseAdmin.from('payroll_runs').insert({ ...body.runData, company_id }).select().single());
        break;

      case 'GENERATE_PAYSLIPS':
        // Updated to use atomic RPC
        ({ data, error } = await supabaseAdmin.rpc('generate_payslips_for_run', {
          p_run_id: body.runId,
          p_company_id: company_id
        }));
        break;

      case 'GET_PAYSLIP_DETAIL':
        ({ data, error } = await supabaseAdmin
          .from('payslips')
          .select('*, employees(first_name, last_name), payroll_runs(*), payslip_items(*)')
          .eq('id', body.payslipId)
          .single());
        break;

      case 'UPDATE_PAYSLIP':
        const { payslipId, items } = body;
        const earnings = items.filter(i => i.type === 'earning').reduce((sum, i) => sum + i.amount, 0);
        const deductions = items.filter(i => i.type === 'deduction').reduce((sum, i) => sum + i.amount, 0);
        const netPay = earnings - deductions;

        // Perform updates (could be optimized further with RPC, but less critical than bulk generation)
        await supabaseAdmin.from('payslip_items').delete().eq('payslip_id', payslipId);
        const itemsToInsert = items.map(item => ({ ...item, payslip_id: payslipId }));
        await supabaseAdmin.from('payslip_items').insert(itemsToInsert);
        ({ data, error } = await supabaseAdmin.from('payslips').update({
          total_earnings: earnings,
          total_deductions: deductions,
          net_pay: netPay,
        }).eq('id', payslipId));
        break;

      case 'FINALIZE_RUN':
        const { run, wageAccountId, bankAccountId, liabilityAccountId } = body;
        const { data: payslipsToFinalize, error: payslipsErrorFinalize } = await supabaseAdmin.from('payslips').select('*').eq('payroll_run_id', run.id);
        if (payslipsErrorFinalize) throw payslipsErrorFinalize;

        const totalNetPay = payslipsToFinalize.reduce((sum, p) => sum + p.net_pay, 0);
        const totalWages = payslipsToFinalize.reduce((sum, p) => sum + p.total_earnings, 0);
        const totalDeductions = payslipsToFinalize.reduce((sum, p) => sum + p.total_deductions, 0);

        const { data: entry, error: entryError } = await supabaseAdmin.from('journal_entries').insert({
          company_id: company_id,
          entry_date: run.pay_date,
          description: `Payroll for period ${run.pay_period_start} to ${run.pay_period_end}`,
        }).select('id').single();
        if (entryError) throw entryError;

        const journalItems = [
          { journal_entry_id: entry.id, account_id: wageAccountId, type: 'debit', amount: totalWages },
          { journal_entry_id: entry.id, account_id: bankAccountId, type: 'credit', amount: totalNetPay },
        ];
        if (totalDeductions > 0) {
          journalItems.push({ journal_entry_id: entry.id, account_id: liabilityAccountId, type: 'credit', amount: totalDeductions });
        }

        const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert(journalItems);
        if (itemsError) throw itemsError;

        ({ data, error } = await supabaseAdmin.from('payroll_runs').update({ status: 'processed' }).eq('id', run.id));
        break;

      case 'GET_SUMMARY_REPORT':
        ({ data, error } = await userSupabase.rpc('get_payroll_summary_report', {
          p_start_date: body.start_date,
          p_end_date: body.end_date,
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