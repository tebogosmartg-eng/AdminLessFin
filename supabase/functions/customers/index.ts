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
      case 'GET':
        ({ data, error } = await supabaseAdmin
          .from('customers')
          .select('*')
          .eq('company_id', company_id)
          .order('name', { ascending: true }));
        break;
      
      case 'GET_DETAILS':
        const { customerId, date_from, date_to } = body;
        
        // 1. Fetch Customer Profile
        const { data: customer, error: custError } = await supabaseAdmin
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .eq('company_id', company_id)
          .single();
        if (custError) throw custError;

        // 2. Fetch Transactions (Journal Entries linked to this customer)
        // We use this to build the running balance and statement.
        let query = supabaseAdmin
          .from('journal_entries')
          .select(`
            id,
            entry_date,
            description,
            invoice_id,
            invoices ( invoice_number ),
            journal_entry_items (
              amount,
              type,
              account_id
            )
          `)
          .eq('company_id', company_id)
          .eq('customer_id', customerId)
          .order('entry_date', { ascending: true }); // Order by date for running balance

        if (date_from) query = query.gte('entry_date', date_from);
        if (date_to) query = query.lte('entry_date', date_to);

        const { data: transactions, error: transError } = await query;
        if (transError) throw transError;

        // 3. Get AR Account ID to filter for relevant movements (Invoice vs Payment)
        const { data: arAccounts } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', company_id)
          .eq('type', 'Asset')
          .ilike('name', '%receivable%');
        
        const arAccountIds = new Set(arAccounts?.map((a: any) => a.id) || []);

        // Process transactions into a statement format
        const statement = transactions.map((t: any) => {
          // Calculate the net impact on AR for this transaction
          let amount = 0;
          let type = 'other'; // 'invoice', 'payment'

          // Check if this JE touches AR
          const arItems = t.journal_entry_items.filter((item: any) => arAccountIds.has(item.account_id));
          
          if (arItems.length > 0) {
            const debits = arItems.filter((i: any) => i.type === 'debit').reduce((sum: number, i: any) => sum + i.amount, 0);
            const credits = arItems.filter((i: any) => i.type === 'credit').reduce((sum: number, i: any) => sum + i.amount, 0);
            
            if (debits > 0) {
              amount = debits;
              type = 'invoice'; // Increases AR
            } else {
              amount = credits;
              type = 'payment'; // Decreases AR
            }
          } else {
             // Fallback for logic where maybe it wasn't posted to AR directly but is linked to customer
             // e.g. Cash Sale.
             // For simplicity, we just sum up items.
             amount = t.journal_entry_items.reduce((sum: number, i: any) => sum + i.amount, 0) / 2; // Rough estimate if balanced
          }

          return {
            id: t.id,
            date: t.entry_date,
            description: t.description,
            invoice_number: t.invoices?.invoice_number,
            type,
            amount,
          };
        });

        data = { customer, statement };
        break;

      case 'POST':
        ({ data, error } = await supabaseAdmin
          .from('customers')
          .insert({ ...body.customerData, company_id })
          .select()
          .single());
        break;

      case 'PUT':
        ({ data, error } = await supabaseAdmin
          .from('customers')
          .update(body.customerData)
          .eq('id', body.customerId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('customers')
          .delete()
          .eq('id', body.customerId)
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