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
              journal_entry_items ( type, amount )
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
            vendors: [bill.vendors], // Wrap in array to match previous structure expected by frontend
            bill_number: bill.bill_number,
            journal_entry_items: bill.journal_entries?.journal_entry_items
          }));
        }
        break;
      
      case 'POST':
        const { p_items, ...billData } = body.billData;
        ({ data, error } = await supabaseAdmin.rpc('record_bill_with_inventory', {
          p_company_id: company_id,
          p_vendor_id: billData.vendor_id,
          p_bill_date: billData.bill_date,
          p_due_date: billData.due_date,
          p_accounts_payable_id: billData.accounts_payable_id,
          p_description: billData.description,
          p_items: p_items,
        }));
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('bills')
          .delete()
          .eq('id', body.billId)
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