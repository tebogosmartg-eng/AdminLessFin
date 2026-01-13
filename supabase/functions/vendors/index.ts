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
      throw new Error("Permission denied: User is not a member of this company.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data, error;

    switch (method) {
      case 'GET':
        ({ data, error } = await supabaseAdmin
          .from('vendors')
          .select('*')
          .eq('company_id', company_id)
          .order('name', { ascending: true }));
        break;
      
      case 'GET_DETAILS':
        const { vendorId, date_from, date_to } = body;
        
        // 1. Get Vendor
        const { data: vendor, error: venError } = await supabaseAdmin
          .from('vendors')
          .select('*')
          .eq('id', vendorId)
          .eq('company_id', company_id)
          .single();
        if (venError) throw venError;

        // 2. Identify AP Accounts
        const { data: apAccounts } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', company_id)
          .eq('type', 'Liability')
          .ilike('name', '%payable%');
        const apAccountIds = new Set(apAccounts?.map((a: any) => a.id) || []);

        // 3. Calculate Opening Balance
        let opening_balance = 0;
        if (date_from) {
            const { data: openingMoves, error: openingError } = await supabaseAdmin
                .from('journal_entry_items')
                .select('amount, type, account_id')
                .eq('journal_entries.company_id', company_id)
                .eq('journal_entries.vendor_id', vendorId)
                .lt('journal_entries.entry_date', date_from)
                .select(`
                    amount, type, account_id,
                    journal_entries!inner (company_id, vendor_id, entry_date)
                `);
            
            if (openingError) throw openingError;

            openingMoves.forEach((item: any) => {
                // In AP (Liability): Credit = +Balance (Owe more), Debit = -Balance (Owe less)
                if (apAccountIds.has(item.account_id)) {
                    opening_balance += item.type === 'credit' ? item.amount : -item.amount;
                } else {
                    opening_balance += item.type === 'credit' ? item.amount : -item.amount;
                }
            });
        }

        // 4. Get Transactions
        let query = supabaseAdmin
          .from('journal_entries')
          .select(`
            id,
            entry_date,
            description,
            bills ( bill_number ),
            journal_entry_items (
              amount,
              type,
              account_id
            )
          `)
          .eq('company_id', company_id)
          .eq('vendor_id', vendorId)
          .order('entry_date', { ascending: true });

        if (date_from) query = query.gte('entry_date', date_from);
        if (date_to) query = query.lte('entry_date', date_to);

        const { data: transactions, error: transError } = await query;
        if (transError) throw transError;

        const statement = transactions.map((t: any) => {
          let amount = 0;
          let type = 'other';

          const apItems = t.journal_entry_items.filter((item: any) => apAccountIds.has(item.account_id));

          if (apItems.length > 0) {
            const debits = apItems.filter((i: any) => i.type === 'debit').reduce((sum: number, i: any) => sum + i.amount, 0);
            const credits = apItems.filter((i: any) => i.type === 'credit').reduce((sum: number, i: any) => sum + i.amount, 0);
            
            if (credits > 0) {
              amount = credits;
              type = 'bill'; // Increases AP
            } else {
              amount = debits;
              type = 'payment'; // Decreases AP
            }
          } else {
             // Fallback
             const debits = t.journal_entry_items.filter((i: any) => i.type === 'debit').reduce((sum: number, i: any) => sum + i.amount, 0);
             const credits = t.journal_entry_items.filter((i: any) => i.type === 'credit').reduce((sum: number, i: any) => sum + i.amount, 0);
             if (credits > debits) {
                 amount = credits;
                 type = 'bill';
             } else {
                 amount = debits;
                 type = 'payment';
             }
          }

          return {
            id: t.id,
            date: t.entry_date,
            description: t.description,
            bill_number: t.bills?.[0]?.bill_number,
            type,
            amount,
          };
        });

        data = { vendor, statement, opening_balance };
        break;

      case 'POST':
        ({ data, error } = await supabaseAdmin
          .from('vendors')
          .insert({ ...body.vendorData, company_id })
          .select()
          .single());
        break;

      case 'PUT':
        ({ data, error } = await supabaseAdmin
          .from('vendors')
          .update(body.vendorData)
          .eq('id', body.vendorId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('vendors')
          .delete()
          .eq('id', body.vendorId)
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