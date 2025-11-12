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

    let data, error;

    switch (method) {
      case 'GET_REFERENCES':
        const [accountsRes, vendorsRes, customersRes] = await Promise.all([
          supabaseAdmin.from('chart_of_accounts').select('id, name').eq('company_id', company_id),
          supabaseAdmin.from('vendors').select('id, name').eq('company_id', company_id),
          supabaseAdmin.from('customers').select('id, name').eq('company_id', company_id),
        ]);

        if (accountsRes.error) throw accountsRes.error;
        if (vendorsRes.error) throw vendorsRes.error;
        if (customersRes.error) throw customersRes.error;

        data = {
          accounts: accountsRes.data,
          vendors: vendorsRes.data,
          customers: customersRes.data,
        };
        break;

      case 'IMPORT_ENTRIES':
        const { entries } = body;
        if (!entries || !Array.isArray(entries)) {
          throw new Error("Invalid 'entries' payload.");
        }

        for (const entry of entries) {
          const { items, ...entryData } = entry;
          const { data: newEntry, error: entryError } = await supabaseAdmin
            .from('journal_entries')
            .insert({ ...entryData, company_id })
            .select('id')
            .single();

          if (entryError) throw entryError;

          const itemsToInsert = items.map(item => ({
            ...item,
            journal_entry_id: newEntry.id,
          }));

          const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert(itemsToInsert);
          if (itemsError) {
            // Attempt to roll back the journal entry if items fail
            await supabaseAdmin.from('journal_entries').delete().eq('id', newEntry.id);
            throw itemsError;
          }
        }
        data = { message: `${entries.length} entries imported successfully.` };
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