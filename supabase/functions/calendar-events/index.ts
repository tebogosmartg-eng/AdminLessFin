// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('calendar-events', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { company_id, start_date, end_date } = await req.json();

    if (!company_id) throw new Error("Company ID is required.");

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

    const [invoices, bills, payrollRuns, recurringInvoices, recurringBills] = await Promise.all([
      supabaseAdmin.from('invoices')
        .select('id, invoice_number, due_date, status, customers(name), journal_entries(journal_entry_items(amount, type))')
        .eq('company_id', company_id)
        .gte('due_date', start_date)
        .lte('due_date', end_date),
      
      supabaseAdmin.from('bills')
        .select('id, bill_number, due_date, status, vendors(name), journal_entries(journal_entry_items(amount, type))')
        .eq('company_id', company_id)
        .gte('due_date', start_date)
        .lte('due_date', end_date),

      supabaseAdmin.from('payroll_runs')
        .select('id, pay_date, status')
        .eq('company_id', company_id)
        .gte('pay_date', start_date)
        .lte('pay_date', end_date),

      supabaseAdmin.from('recurring_invoices')
        .select('id, profile_name, next_run_date, status')
        .eq('company_id', company_id)
        .eq('status', 'active')
        .gte('next_run_date', start_date)
        .lte('next_run_date', end_date),

      supabaseAdmin.from('recurring_bills')
        .select('id, profile_name, next_run_date, status')
        .eq('company_id', company_id)
        .eq('status', 'active')
        .gte('next_run_date', start_date)
        .lte('next_run_date', end_date),
    ]);

    const events = [
      ...(invoices.data || []).map(i => {
        const total = i.journal_entries?.journal_entry_items.filter((item: any) => item.type === 'debit').reduce((sum: number, item: any) => sum + item.amount, 0) || 0;
        return {
          id: i.id,
          title: `Inv #${i.invoice_number}`,
          date: i.due_date,
          type: 'invoice',
          status: i.status,
          amount: total,
          description: i.customers?.name
        };
      }),
      ...(bills.data || []).map(b => {
        const total = b.journal_entries?.journal_entry_items.filter((item: any) => item.type === 'credit').reduce((sum: number, item: any) => sum + item.amount, 0) || 0;
        return {
          id: b.id,
          title: `Bill ${b.bill_number || ''}`,
          date: b.due_date,
          type: 'bill',
          status: b.status,
          amount: total,
          description: b.vendors?.name
        };
      }),
      ...(payrollRuns.data || []).map(p => ({
        id: p.id,
        title: 'Payroll',
        date: p.pay_date,
        type: 'payroll',
        status: p.status,
      })),
      ...(recurringInvoices.data || []).map(r => ({
        id: r.id,
        title: `Rec. Inv: ${r.profile_name}`,
        date: r.next_run_date,
        type: 'recurring_invoice',
        status: 'scheduled',
      })),
      ...(recurringBills.data || []).map(r => ({
        id: r.id,
        title: `Rec. Bill: ${r.profile_name}`,
        date: r.next_run_date,
        type: 'recurring_bill',
        status: 'scheduled',
      })),
    ];

    return new Response(JSON.stringify(events), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
