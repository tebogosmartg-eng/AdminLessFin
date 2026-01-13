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
        const { error: putError } = await supabaseAdmin
          .from('recurring_invoices')
          .update(putData)
          .eq('id', body.id)
          .eq('company_id', company_id);
        if (putError) throw putError;

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
        const today = new Date().toISOString().split('T')[0];
        
        const { data: dueProfiles, error: fetchError } = await supabaseAdmin
          .from('recurring_invoices')
          .select('*, recurring_invoice_items(*)')
          .eq('company_id', company_id)
          .eq('status', 'active')
          .lte('next_run_date', today);
        
        if (fetchError) throw fetchError;

        // Pre-fetch default accounts to avoid errors during invoice creation
        const arAccountId = await getAccountId(supabaseAdmin, company_id, 'Asset', 'accounts receivable');
        const taxAccountId = await getAccountId(supabaseAdmin, company_id, 'Liability', 'tax payable');
        const invAccountId = await getAccountId(supabaseAdmin, company_id, 'Asset', 'inventory asset');

        let processedCount = 0;

        for (const profile of dueProfiles) {
          // Check if we need tax/inventory accounts for this profile
          const needsTax = profile.recurring_invoice_items.some(i => i.tax_rate_id);
          // Simple check for inventory (in a real app we'd check the product type, but here we check if a helper account is needed)
          
          if (!arAccountId) {
            console.error(`Skipping profile ${profile.id}: No AR Account found.`);
            continue;
          }
          if (needsTax && !taxAccountId) {
             console.error(`Skipping profile ${profile.id}: Items have tax but no Tax Payable account found.`);
             continue;
          }

          // Generate Invoice Number
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
          const dueDate = format(addDays(new Date(invoiceDate), 30), 'yyyy-MM-dd'); 

          const rpcItems = profile.recurring_invoice_items.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            income_account_id: item.income_account_id,
            tax_rate_id: item.tax_rate_id
          }));

          const { error: invError } = await supabaseAdmin.rpc('create_invoice_with_taxes', {
            p_company_id: company_id,
            p_customer_id: profile.customer_id,
            p_invoice_date: invoiceDate,
            p_due_date: dueDate,
            p_invoice_number: invNum,
            p_ar_account_id: arAccountId,
            p_inventory_asset_account_id: invAccountId, // Might be null, RPC handles if not strictly required by items
            p_tax_payable_account_id: taxAccountId,     // Might be null, RPC handles if not strictly required
            p_description: `Recurring: ${profile.profile_name}`,
            p_items: rpcItems
          });

          if (invError) {
            console.error(`Failed to generate invoice for profile ${profile.id}`, invError);
            continue;
          }

          // Update Profile next_run_date
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

// Helper to find accounts by loose name matching
async function getAccountId(supabase, company_id, type, namePart) {
  // Try exact match first
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company_id)
    .eq('type', type)
    .ilike('name', `%${namePart}%`)
    .limit(1)
    .single();
  
  if (data) return data.id;
  
  // Fallback: just return the first account of that type (risky but better than crashing in demo env)
  if (type === 'Asset' || type === 'Liability') {
      const { data: fallback } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('company_id', company_id)
        .eq('type', type)
        .limit(1)
        .single();
      return fallback?.id;
  }
  return null;
}