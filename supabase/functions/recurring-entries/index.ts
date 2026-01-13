// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { addDays, addWeeks, addMonths, addYears } from "https://esm.sh/date-fns@3.6.0";

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
          .from('recurring_journal_entries')
          .select('id, description, frequency, next_run_date')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('recurring_journal_entries')
          .select('*, recurring_journal_entry_items(*)')
          .eq('id', body.entryId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'POST':
        const { items: postItems, ...postEntryData } = body.entryData;
        const { data: newEntry, error: postError } = await supabaseAdmin
          .from('recurring_journal_entries')
          .insert({ ...postEntryData, company_id })
          .select('id')
          .single();
        if (postError) throw postError;
        
        const itemsToInsert = postItems.map(item => ({ ...item, recurring_journal_entry_id: newEntry.id }));
        const { error: postItemsError } = await supabaseAdmin.from('recurring_journal_entry_items').insert(itemsToInsert);
        if (postItemsError) throw postItemsError;
        data = newEntry;
        break;

      case 'PUT':
        const { items: putItems, ...putEntryData } = body.entryData;
        const { error: putError } = await supabaseAdmin
          .from('recurring_journal_entries')
          .update(putEntryData)
          .eq('id', body.entryId)
          .eq('company_id', company_id);
        if (putError) throw putError;

        await supabaseAdmin.from('recurring_journal_entry_items').delete().eq('recurring_journal_entry_id', body.entryId);
        const putItemsToInsert = putItems.map(item => ({ ...item, recurring_journal_entry_id: body.entryId }));
        const { error: putItemsError } = await supabaseAdmin.from('recurring_journal_entry_items').insert(putItemsToInsert);
        if (putItemsError) throw putItemsError;
        data = { id: body.entryId };
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('recurring_journal_entries')
          .delete()
          .eq('id', body.entryId)
          .eq('company_id', company_id));
        break;

      case 'PROCESS_DUE':
        const today = new Date().toISOString().split('T')[0];
        const { data: dueEntries, error: fetchError } = await supabaseAdmin
          .from('recurring_journal_entries')
          .select('*, recurring_journal_entry_items(*)')
          .eq('company_id', company_id)
          .lte('next_run_date', today);

        if (fetchError) throw fetchError;

        let processedCount = 0;
        for (const entry of dueEntries || []) {
          // Create Journal Entry
          const { data: newJournalEntry, error: journalError } = await supabaseAdmin
            .from('journal_entries')
            .insert({
              company_id: entry.company_id,
              entry_date: entry.next_run_date,
              description: `(Recurring) ${entry.description}`,
            })
            .select('id')
            .single();

          if (journalError) {
            console.error(`Failed to create JE for recurring entry ${entry.id}`, journalError);
            continue;
          }

          const jeItems = entry.recurring_journal_entry_items.map(item => ({
            journal_entry_id: newJournalEntry.id,
            account_id: item.account_id,
            type: item.type,
            amount: item.amount,
          }));

          const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert(jeItems);
          if (itemsError) {
             console.error(`Failed to create JE items for recurring entry ${entry.id}`, itemsError);
             continue;
          }

          // Calculate next run date
          let nextDate = new Date(entry.next_run_date);
          switch (entry.frequency) {
            case 'daily': nextDate = addDays(nextDate, 1); break;
            case 'weekly': nextDate = addWeeks(nextDate, 1); break;
            case 'monthly': nextDate = addMonths(nextDate, 1); break;
            case 'yearly': nextDate = addYears(nextDate, 1); break;
          }
          
          if (entry.end_date && nextDate > new Date(entry.end_date)) {
             await supabaseAdmin.from('recurring_journal_entries').delete().eq('id', entry.id);
          } else {
             await supabaseAdmin.from('recurring_journal_entries').update({
               next_run_date: nextDate.toISOString().split('T')[0]
             }).eq('id', entry.id);
          }
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