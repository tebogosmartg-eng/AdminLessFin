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
        ({ data, error } = await supabaseAdmin
          .from('products')
          .select(`
            *,
            income_account:income_account_id ( name ),
            cogs_account:cogs_account_id ( name )
          `)
          .eq('company_id', company_id)
          .order('name', { ascending: true }));
        break;
      
      case 'POST':
        ({ data, error } = await supabaseAdmin
          .from('products')
          .insert({ ...body.productData, company_id })
          .select()
          .single());
        break;

      case 'PUT':
        ({ data, error } = await supabaseAdmin
          .from('products')
          .update(body.productData)
          .eq('id', body.productId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('products')
          .delete()
          .eq('id', body.productId)
          .eq('company_id', company_id));
        break;

      case 'ADJUST_QUANTITY':
        const { productId, newQuantity, inventoryAccountId, adjustmentAccountId, reason, date } = body;
        
        // 1. Get current product state
        const { data: product, error: fetchError } = await supabaseAdmin
          .from('products')
          .select('*')
          .eq('id', productId)
          .eq('company_id', company_id)
          .single();
        
        if (fetchError) throw fetchError;
        if (!product) throw new Error("Product not found");

        const oldQuantity = product.quantity_on_hand;
        const diff = newQuantity - oldQuantity;
        
        if (diff === 0) {
          data = { message: "No change in quantity." };
          break;
        }

        const cost = product.cost || 0;
        const totalValue = Math.abs(diff * cost);

        // 2. Create Journal Entry
        const { data: je, error: jeError } = await supabaseAdmin
          .from('journal_entries')
          .insert({
            company_id,
            entry_date: date,
            description: `Inventory Adjustment: ${product.name} (${diff > 0 ? '+' : ''}${diff}) - ${reason}`,
          })
          .select('id')
          .single();
        
        if (jeError) throw jeError;

        // 3. Create Journal Items
        let items = [];
        if (diff > 0) {
          // Gained Inventory: Debit Asset, Credit Adjustment (Income/Expense reduction)
          items = [
            { journal_entry_id: je.id, account_id: inventoryAccountId, type: 'debit', amount: totalValue },
            { journal_entry_id: je.id, account_id: adjustmentAccountId, type: 'credit', amount: totalValue }
          ];
        } else {
          // Lost Inventory: Debit Adjustment (Expense), Credit Asset
          items = [
            { journal_entry_id: je.id, account_id: adjustmentAccountId, type: 'debit', amount: totalValue },
            { journal_entry_id: je.id, account_id: inventoryAccountId, type: 'credit', amount: totalValue }
          ];
        }

        const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert(items);
        if (itemsError) throw itemsError;

        // 4. Update Product Quantity
        ({ data, error } = await supabaseAdmin
          .from('products')
          .update({ quantity_on_hand: newQuantity })
          .eq('id', productId));
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