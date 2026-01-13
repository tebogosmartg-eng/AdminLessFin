// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { addDays, addWeeks, addMonths, addYears, format } from "https://esm.sh/date-fns@3.6.0";

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

    let data, error;

    switch (method) {
      case 'GET_ALL':
        ({ data, error } = await supabaseAdmin
          .from('recurring_invoices')
          .select('*, customers(name)')
          .eq('company_id', company_id)
          .order('next_run_date', { ascending: true }));
        break;

      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('recurring_invoices')
          .select('*, recurring_invoice_items(*)')
          .eq('id', body.id)
          .eq('company_id', company_id)
          .single());
        break;

      case 'POST':
        const { items: postItems, ...postData } = body.data;
        const { data: newProfile, error: postError } = await supabaseAdmin
          .from('recurring_invoices')
          .insert({ ...postData, company_id, next_run_date: postData.start_date })
          .select('id')
          .single();
        if (postError) throw postError;

        const itemsToInsert = postItems.map(item => ({ ...item, recurring_invoice_id: newProfile.id }));
        const { error: postItemsError } = await supabaseAdmin.from('recurring_invoice_items').insert(itemsToInsert);
        if (postItemsError) throw postItemsError;
        data = newProfile;
        break;

      case 'PUT':
        const { items: putItems, ...putData } = body.data;
        // Update basic info
        const { error: putError } = await supabaseAdmin
          .from('recurring_invoices')
          .update(putData)
          .eq('id', body.id)
          .eq('company_id', company_id);
        if (putError) throw putError;

        // Replace items
        await supabaseAdmin.from('recurring_invoice_items').delete().eq('recurring_invoice_id', body.id);
        const putItemsToInsert = putItems.map(item => ({ ...item, recurring_invoice_id: body.id }));
        const { error: putItemsError } = await supabaseAdmin.from('recurring_invoice_items').insert(putItemsToInsert);
        if (putItemsError) throw putItemsError;
        data = { id: body.id };
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('recurring_invoices')
          .delete()
          .eq('id', body.id)
          .eq('company_id', company_id));
        break;

      case 'PROCESS_DUE':
        // This is primarily for manual triggering or testing. 
        // A real cron job would likely check all companies.
        const today = new Date().toISOString().split('T')[0];
        
        const { data: dueProfiles, error: fetchError } = await supabaseAdmin
          .from('recurring_invoices')
          .select('*, recurring_invoice_items(*)')
          .eq('company_id', company_id)
          .eq('status', 'active')
          .lte('next_run_date', today);
        
        if (fetchError) throw fetchError;

        let processedCount = 0;

        for (const profile of dueProfiles) {
          // 1. Create Invoice
          // Get next invoice number
          const { data: lastInv } = await supabaseAdmin
            .from('invoices')
            .select('invoice_number')
            .eq('company_id', company_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          let nextNum = 1;
          if (lastInv && lastInv.invoice_number) {
             const matches = lastInv.invoice_number.match(/INV-(\d+)/);
             if (matches && matches[1]) nextNum = parseInt(matches[1]) + 1;
          }
          const invNum = `INV-${String(nextNum).padStart(5, '0')}`;

          const invoiceDate = profile.next_run_date;
          // Default due date 30 days for now
          const dueDate = format(addDays(new Date(invoiceDate), 30), 'yyyy-MM-dd'); 

          // Prepare items for RPC
          const rpcItems = profile.recurring_invoice_items.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            income_account_id: item.income_account_id,
            tax_rate_id: item.tax_rate_id
          }));

          // Call RPC to create invoice
          const { data: newInvId, error: invError } = await supabaseAdmin.rpc('create_invoice_with_taxes', {
            p_company_id: company_id,
            p_customer_id: profile.customer_id,
            p_invoice_date: invoiceDate,
            p_due_date: dueDate,
            p_invoice_number: invNum,
            p_ar_account_id: (await getARAccount(supabaseAdmin, company_id)), // Helper needed
            p_inventory_asset_account_id: null, // Basic implementation
            p_tax_payable_account_id: null, // Basic implementation
            p_description: `Recurring: ${profile.profile_name}`,
            p_items: rpcItems
          });

          if (invError) {
            console.error(`Failed to generate invoice for profile ${profile.id}`, invError);
            continue;
          }

          // 2. Update Profile next_run_date
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

          await supabaseAdmin.from('recurring_invoices').update({
            last_run_date: invoiceDate,
            next_run_date: nextDateStr,
            status: status
          }).eq('id', profile.id);

          processedCount++;
        }
        data = { processed: processedCount };
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

// Helper to find default AR account
async function getARAccount(supabase, company_id) {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company_id)
    .ilike('name', '%accounts receivable%')
    .limit(1)
    .single();
  
  if (data) return data.id;
  
  // Fallback to any Asset account if AR not found (not ideal but safe for example)
  const { data: asset } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company_id)
    .eq('type', 'Asset')
    .limit(1)
    .single();
  return asset?.id;
}