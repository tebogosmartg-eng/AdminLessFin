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
      case 'GET':
        let entryIdsFromAccountFilter = null;
        if (body.filters?.account_id && body.filters.account_id !== 'all') {
          const { data: items, error: itemsError } = await supabaseAdmin
            .from('journal_entry_items')
            .select('journal_entry_id')
            .eq('account_id', body.filters.account_id);
          if (itemsError) throw itemsError;
          entryIdsFromAccountFilter = items.map(item => item.journal_entry_id);
          if (entryIdsFromAccountFilter.length === 0) {
             return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }
        }

        let query = supabaseAdmin
          .from('journal_entries')
          .select(body.select || '*')
          .eq('company_id', company_id)
          .order('entry_date', { ascending: false });

        if (entryIdsFromAccountFilter) {
          query = query.in('id', entryIdsFromAccountFilter);
        }
        if (body.filters?.date_from) {
          query = query.gte('entry_date', body.filters.date_from);
        }
        if (body.filters?.date_to) {
          query = query.lte('entry_date', body.filters.date_to);
        }
        if (body.filters?.vendor_id && body.filters.vendor_id !== 'all') {
          query = query.eq('vendor_id', body.filters.vendor_id);
        }
        if (body.filters?.customer_id && body.filters.customer_id !== 'all') {
          query = query.eq('customer_id', body.filters.customer_id);
        }
        if (body.filters?.id) {
          query = query.eq('id', body.filters.id).single();
        }

        ({ data, error } = await query);
        break;
      
      case 'GET_RELATED_TO_INVOICE':
        ({ data, error } = await supabaseAdmin
          .from('journal_entries')
          .select('id, entry_date, description')
          .eq('company_id', company_id)
          .eq('invoice_id', body.invoiceId)
          .order('entry_date', { ascending: true }));
        break;

      case 'POST':
        const { items: postItems, ...postEntryData } = body.entryData;
        const { data: newEntry, error: postError } = await supabaseAdmin
          .from('journal_entries')
          .insert({ ...postEntryData, company_id })
          .select('id')
          .single();
        if (postError) throw postError;
        
        // Add project_id to the items being inserted
        const itemsToInsert = postItems.map(item => ({ 
          ...item, 
          journal_entry_id: newEntry.id,
          project_id: item.project_id || null // Ensure project_id is handled
        }));
        
        const { error: postItemsError } = await supabaseAdmin.from('journal_entry_items').insert(itemsToInsert);
        if (postItemsError) throw postItemsError;
        data = newEntry;
        break;

      case 'PUT':
        const { items: putItems, ...putEntryData } = body.entryData;
        
        // Update Header
        const { error: headerError } = await supabaseAdmin
          .from('journal_entries')
          .update({
            entry_date: putEntryData.entry_date,
            description: putEntryData.description || null,
            vendor_id: putEntryData.vendor_id || null,
            customer_id: putEntryData.customer_id || null,
            attachment_url: putEntryData.attachment_url || null,
          })
          .eq('id', body.entryId)
          .eq('company_id', company_id);
        
        if (headerError) throw headerError;

        // Replace Items (Delete & Insert)
        await supabaseAdmin.from('journal_entry_items').delete().eq('journal_entry_id', body.entryId);
        
        const putItemsToInsert = putItems.map(item => ({ 
          ...item, 
          journal_entry_id: body.entryId,
          project_id: item.project_id || null
        }));
        
        const { error: putItemsError } = await supabaseAdmin.from('journal_entry_items').insert(putItemsToInsert);
        if (putItemsError) throw putItemsError;
        
        data = { id: body.entryId };
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('journal_entries')
          .delete()
          .eq('id', body.entryId)
          .eq('company_id', company_id));
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