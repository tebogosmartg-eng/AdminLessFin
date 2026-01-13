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
      case 'GET_ALL':
        ({ data, error } = await supabaseAdmin
          .from('purchase_orders')
          .select('*, vendors(name)')
          .eq('company_id', company_id)
          .order('po_date', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('purchase_orders')
          .select('*, vendors(name, email, address), purchase_order_items(*)')
          .eq('id', body.poId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'GET_NEXT_NUMBER':
        const { data: lastPO } = await supabaseAdmin
          .from('purchase_orders')
          .select('po_number')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        let nextNum = 1;
        if (lastPO && lastPO.po_number) {
            const matches = lastPO.po_number.match(/PO-(\d+)/);
            if (matches && matches[1]) nextNum = parseInt(matches[1]) + 1;
        }
        data = `PO-${String(nextNum).padStart(5, '0')}`;
        break;

      case 'POST':
        const { items: postItems, ...postData } = body.poData;
        const { data: newPO, error: postError } = await supabaseAdmin
          .from('purchase_orders')
          .insert({ ...postData, company_id })
          .select('id')
          .single();
        if (postError) throw postError;
        
        const itemsToInsert = postItems.map(item => ({ ...item, purchase_order_id: newPO.id }));
        const { error: postItemsError } = await supabaseAdmin.from('purchase_order_items').insert(itemsToInsert);
        if (postItemsError) throw postItemsError;
        data = newPO;
        break;

      case 'PUT':
        const { items: putItems, ...putData } = body.poData;
        const { error: putError } = await supabaseAdmin
          .from('purchase_orders')
          .update(putData)
          .eq('id', body.poId)
          .eq('company_id', company_id);
        if (putError) throw putError;

        await supabaseAdmin.from('purchase_order_items').delete().eq('purchase_order_id', body.poId);
        const putItemsToInsert = putItems.map(item => ({ ...item, purchase_order_id: body.poId }));
        const { error: putItemsError } = await supabaseAdmin.from('purchase_order_items').insert(putItemsToInsert);
        if (putItemsError) throw putItemsError;
        data = { id: body.poId };
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('purchase_orders')
          .delete()
          .eq('id', body.poId)
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