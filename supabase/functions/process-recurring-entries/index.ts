// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { addDays, addWeeks, addMonths, addYears } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (_req) => {
  if (_req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Use the service role key to perform admin-level operations.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const today = new Date().toISOString().split('T')[0];

    // 1. Find all recurring entries that are due to be processed.
    const { data: dueEntries, error: fetchError } = await supabaseAdmin
      .from('recurring_journal_entries')
      .select('*, recurring_journal_entry_items(*)')
      .lte('next_run_date', today);

    if (fetchError) throw fetchError;

    if (!dueEntries || dueEntries.length === 0) {
      return new Response(JSON.stringify({ message: "No recurring entries to process." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    let processedCount = 0;

    // 2. Process each due entry.
    for (const entry of dueEntries) {
      // Create the new journal entry from the template.
      const { data: newJournalEntry, error: journalError } = await supabaseAdmin
        .from('journal_entries')
        .insert({
          user_id: entry.user_id,
          entry_date: entry.next_run_date,
          description: `(Recurring) ${entry.description}`,
        })
        .select('id')
        .single();

      if (journalError) {
        console.error(`Failed to create journal entry for recurring entry ${entry.id}:`, journalError);
        continue; // Skip to the next one.
      }

      // Create the associated debit and credit items.
      const itemsToInsert = entry.recurring_journal_entry_items.map(item => ({
        journal_entry_id: newJournalEntry.id,
        account_id: item.account_id,
        type: item.type,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('journal_entry_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error(`Failed to create journal items for recurring entry ${entry.id}:`, itemsError);
        continue;
      }

      // 3. Calculate the next run date based on the frequency.
      const currentNextRunDate = new Date(entry.next_run_date);
      let newNextRunDate;
      switch (entry.frequency) {
        case 'daily': newNextRunDate = addDays(currentNextRunDate, 1); break;
        case 'weekly': newNextRunDate = addWeeks(currentNextRunDate, 1); break;
        case 'monthly': newNextRunDate = addMonths(currentNextRunDate, 1); break;
        case 'yearly': newNextRunDate = addYears(currentNextRunDate, 1); break;
        default: continue;
      }

      // 4. Update the recurring entry with the new date, or delete if it has expired.
      if (entry.end_date && newNextRunDate > new Date(entry.end_date)) {
        // The recurring entry has completed its cycle.
        await supabaseAdmin.from('recurring_journal_entries').delete().eq('id', entry.id);
      } else {
        // Schedule the next run.
        await supabaseAdmin
          .from('recurring_journal_entries')
          .update({ next_run_date: newNextRunDate.toISOString().split('T')[0] })
          .eq('id', entry.id);
      }
      
      processedCount++;
    }

    return new Response(JSON.stringify({ message: `Successfully processed ${processedCount} recurring entries.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing recurring entries:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})