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
      throw new Error("Permission denied.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data, error;

    switch (method) {
      case 'GET':
        let query = supabaseAdmin
          .from('bills')
          .select(`
            id,
            bill_date,
            due_date,
            status,
            description:journal_entries(description),
            bill_number,
            vendors!inner ( name ),
            journal_entries (
              id,
              entry_date,
              journal_entry_items ( type, amount, project_id )
            )
          `)
          .eq('company_id', company_id)
          .order('bill_date', { ascending: false });

        if (body.filters) {
          const { status, date_from, date_to, search, vendor_id } = body.filters;
          
          if (status && status !== 'all') {
            query = query.eq('status', status);
          }
          if (date_from) {
            query = query.gte('bill_date', date_from);
          }
          if (date_to) {
            query = query.lte('bill_date', date_to);
          }
          if (vendor_id && vendor_id !== 'all') {
            query = query.eq('vendor_id', vendor_id);
          }
          if (search) {
            query = query.ilike('bill_number', `%${search}%`);
          }
        }

        ({ data, error } = await query);
        
        // Data transformation for frontend consistency
        if (data) {
          data = data.map(bill => ({
            id: bill.id,
            entry_date: bill.bill_date,
            description: bill.description?.description || `Bill from ${bill.vendors?.name}`,
            status: bill.status,
            vendor_id: bill.vendor_id,
            vendors: [bill.vendors], 
            bill_number: bill.bill_number,
            journal_entry_items: bill.journal_entries?.journal_entry_items
          }));
        }
        break;
      
      case 'GET_ONE':
        // Retrieve single bill details including Journal Entry items
        ({ data, error } = await supabaseAdmin
          .from('bills')
          .select(`
            id,
            bill_date,
            due_date,
            status,
            bill_number,
            vendor_id,
            description:journal_entries(description),
            vendors ( name ),
            journal_entries (
              id,
              journal_entry_items (
                id,
                amount,
                type,
                account_id,
                project_id,
                product_id:product_id, 
                chart_of_accounts ( name ),
                journal_entry_item_tax_rates (
                  tax_rates ( id, rate )
                )
              )
            )
          `)
          .eq('id', body.billId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'POST':
        const { p_items, ...billData } = body.billData;
        
        const itemsWithProjectAndTax = p_items.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            expense_account_id: item.expense_account_id,
            tax_rate_id: item.tax_rate_id || null,
            project_id: item.project_id || null
        }));

        ({ data, error } = await supabaseAdmin.rpc('record_bill_with_taxes', {
          p_company_id: company_id,
          p_vendor_id: billData.vendor_id,
          p_bill_date: billData.bill_date,
          p_due_date: billData.due_date,
          p_bill_number: billData.bill_number,
          p_accounts_payable_id: billData.accounts_payable_id,
          p_tax_receivable_account_id: billData.tax_receivable_account_id || null,
          p_description: billData.description,
          p_items: itemsWithProjectAndTax,
        }));
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('bills')
          .delete()
          .eq('id', body.billId)
          .eq('company_id', company_id));
        break;

      case 'VOID':
        // 1. Get Bill and JE
        const { data: bill } = await supabaseAdmin
          .from('bills')
          .select('journal_entry_id, bill_number')
          .eq('id', body.billId)
          .single();
        
        if (!bill) throw new Error("Bill not found");
        if (!bill.journal_entry_id) throw new Error("Journal Entry not found for bill");

        // 2. Create Reversal JE
        const { data: jeData } = await supabaseAdmin.from('journal_entries').select('*').eq('id', bill.journal_entry_id).single();
        
        const { data: reversalJe } = await supabaseAdmin.from('journal_entries').insert({
          company_id,
          entry_date: new Date().toISOString().split('T')[0],
          description: `Void Reversal for Bill ${bill.bill_number}`,
          vendor_id: jeData.vendor_id
        }).select('id').single();

        // 3. Create Reversed Items
        const { data: originalItems } = await supabaseAdmin.from('journal_entry_items').select('*').eq('journal_entry_id', bill.journal_entry_id);
        
        const reversalItems = originalItems.map(item => ({
          journal_entry_id: reversalJe.id,
          account_id: item.account_id,
          type: item.type === 'debit' ? 'credit' : 'debit',
          amount: item.amount,
          project_id: item.project_id
        }));

        await supabaseAdmin.from('journal_entry_items').insert(reversalItems);

        // 4. Update Bill Status
        ({ data, error } = await supabaseAdmin.from('bills').update({ status: 'void' }).eq('id', body.billId));
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