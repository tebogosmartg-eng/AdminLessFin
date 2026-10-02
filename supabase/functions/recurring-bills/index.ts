// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { addDays, addWeeks, addMonths, addYears, format } from "https://esm.sh/date-fns@3.6.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('recurring-bills', 'tenant-or-service', async (req, _ctx) => {

  try {
    // Scheduler: only the exact service-role key, and only PROCESS_DUE, for
    // every company with a due profile.
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (serviceKey && bearer === serviceKey) {
      const body = await req.json().catch(() => ({}));
      if (body.method !== 'PROCESS_DUE') throw new Error('Permission denied.');
      const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
      const today = new Date().toISOString().split('T')[0];
      const { data: due, error: dueError } = await supabaseAdmin
        .from('recurring_bills')
        .select('company_id')
        .eq('status', 'active')
        .lte('next_run_date', today);
      if (dueError) throw dueError;
      const companies = [...new Set((due ?? []).map((r) => r.company_id))];
      const results = [];
      for (const companyId of companies) {
        try {
          results.push({ company_id: companyId, ...(await processDueBills(supabaseAdmin, companyId)) });
        } catch (e) {
          console.error(`Recurring bills failed for company ${companyId}`, e);
          results.push({ company_id: companyId, processed: 0, error: 'failed' });
        }
      }
      return new Response(JSON.stringify({ companies: companies.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

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
    _ctx.companyId = company_id;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    let data, error;

    switch (method) {
      case 'GET_ALL':
        ({ data, error } = await supabaseAdmin
          .from('recurring_bills')
          .select('*, vendors(name)')
          .eq('company_id', company_id)
          .order('next_run_date', { ascending: true }));
        break;

      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('recurring_bills')
          .select('*, recurring_bill_items(*)')
          .eq('id', body.id)
          .eq('company_id', company_id)
          .single());
        break;

      case 'POST':
        const { items: postItems, ...postData } = body.data;
        const { data: newProfile, error: postError } = await supabaseAdmin
          .from('recurring_bills')
          .insert({ ...postData, company_id, next_run_date: postData.start_date })
          .select('id')
          .single();
        if (postError) throw postError;

        const itemsToInsert = postItems.map(item => ({ ...item, recurring_bill_id: newProfile.id }));
        const { error: postItemsError } = await supabaseAdmin.from('recurring_bill_items').insert(itemsToInsert);
        if (postItemsError) throw postItemsError;
        data = newProfile;
        break;

      case 'PUT':
        const { items: putItems, ...putData } = body.data;
        const { error: putError } = await supabaseAdmin
          .from('recurring_bills')
          .update(putData)
          .eq('id', body.id)
          .eq('company_id', company_id);
        if (putError) throw putError;

        await supabaseAdmin.from('recurring_bill_items').delete().eq('recurring_bill_id', body.id);
        const putItemsToInsert = putItems.map(item => ({ ...item, recurring_bill_id: body.id }));
        const { error: putItemsError } = await supabaseAdmin.from('recurring_bill_items').insert(putItemsToInsert);
        if (putItemsError) throw putItemsError;
        data = { id: body.id };
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('recurring_bills')
          .delete()
          .eq('id', body.id)
          .eq('company_id', company_id));
        break;

      case 'PROCESS_DUE':
        data = await processDueBills(supabaseAdmin, company_id);
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

async function processDueBills(supabaseAdmin, company_id) {
  const today = new Date().toISOString().split('T')[0];

  const { data: dueProfiles, error: fetchError } = await supabaseAdmin
    .from('recurring_bills')
    .select('*, recurring_bill_items(*)')
    .eq('company_id', company_id)
    .eq('status', 'active')
    .lte('next_run_date', today);

  if (fetchError) throw fetchError;

  // Fetch Accounts Payable control account by role
  const { data: apAccount } = await supabaseAdmin
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company_id)
    .eq('type', 'Liability')
    .eq('account_role', 'trade_payable')
    .limit(1)
    .maybeSingle();

  if (!apAccount) {
    console.error(`Skipping bills for company ${company_id}: No AP Account found.`);
    return { processed: 0, error: "AP Account not found" };
  }

  let processedCount = 0;

  for (const profile of dueProfiles) {
    const billDate = profile.next_run_date;
    const dueDate = format(addDays(new Date(billDate), 30), 'yyyy-MM-dd'); // Default 30 day terms

    let nextDate = new Date(profile.next_run_date);
    switch(profile.frequency) {
      case 'daily': nextDate = addDays(nextDate, 1); break;
      case 'weekly': nextDate = addWeeks(nextDate, 1); break;
      case 'monthly': nextDate = addMonths(nextDate, 1); break;
      case 'yearly': nextDate = addYears(nextDate, 1); break;
    }
    const nextDateStr = format(nextDate, 'yyyy-MM-dd');

    let status = 'active';
    if (profile.end_date && new Date(profile.end_date) < nextDate) {
      status = 'completed';
    }

    // Claim the run before posting so the scheduler and a manual run cannot
    // both post the same period.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('recurring_bills')
      .update({ last_run_date: billDate, next_run_date: nextDateStr, status })
      .eq('id', profile.id)
      .eq('status', 'active')
      .eq('next_run_date', billDate)
      .select('id');
    if (claimError) throw claimError;
    if (!claimed?.length) continue;

    const p_items = profile.recurring_bill_items.map(item => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      expense_account_id: item.expense_account_id
    }));

    // Use the existing bill creation RPC
    const { error: billError } = await supabaseAdmin.rpc('record_bill_with_inventory', {
      p_company_id: company_id,
      p_vendor_id: profile.vendor_id,
      p_bill_date: billDate,
      p_due_date: dueDate,
      p_accounts_payable_id: apAccount.id,
      p_description: `Recurring: ${profile.profile_name}`,
      p_items: p_items,
    });

    if (billError) {
      console.error(`Failed to generate bill for profile ${profile.id}`, billError);
      await supabaseAdmin
        .from('recurring_bills')
        .update({ last_run_date: profile.last_run_date, next_run_date: billDate, status: 'active' })
        .eq('id', profile.id)
        .eq('next_run_date', nextDateStr);
      continue;
    }

    processedCount++;
  }
  return { processed: processedCount };
}
