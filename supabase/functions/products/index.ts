// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('products', 'tenant', async (req, _ctx) => {

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
    _ctx.companyId = company_id;

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
      
      case 'GET_HISTORY':
        ({ data, error } = await supabaseAdmin
          .from('inventory_transactions')
          .select('*')
          .eq('company_id', company_id)
          .eq('product_id', body.productId)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false }));
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
        // Legacy path kept for API compatibility. Syncs inv_balances (V17) when present.
        {
          const { productId, newQuantity, inventoryAccountId, adjustmentAccountId, reason, date } = body;

          if (newQuantity == null || Number(newQuantity) < 0) {
            throw new Error('Adjusted quantity cannot be negative.');
          }
          if (!inventoryAccountId || !adjustmentAccountId) {
            throw new Error('Inventory asset and adjustment accounts are required.');
          }

          const { data: product, error: fetchError } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('id', productId)
            .eq('company_id', company_id)
            .single();

          if (fetchError) throw fetchError;
          if (!product) throw new Error("Product not found");

          // Prefer warehouse balance as source of truth when V17 tables exist
          let warehouseId = product.default_warehouse_id || null;
          let oldQuantity = Number(product.quantity_on_hand || 0);
          let balanceId = null;
          let unitCost = Number(product.cost || 0);

          const { data: defaultWh } = await supabaseAdmin
            .from('inv_warehouses')
            .select('id')
            .eq('company_id', company_id)
            .eq('is_default', true)
            .maybeSingle();
          if (defaultWh?.id) warehouseId = warehouseId || defaultWh.id;

          if (!warehouseId) {
            const { data: anyWh } = await supabaseAdmin
              .from('inv_warehouses')
              .select('id')
              .eq('company_id', company_id)
              .limit(1)
              .maybeSingle();
            warehouseId = anyWh?.id || null;
          }

          if (warehouseId) {
            let { data: bal } = await supabaseAdmin
              .from('inv_balances')
              .select('*')
              .eq('company_id', company_id)
              .eq('product_id', productId)
              .eq('warehouse_id', warehouseId)
              .is('location_id', null)
              .maybeSingle();
            if (!bal) {
              const { data: created, error: balErr } = await supabaseAdmin
                .from('inv_balances')
                .insert({
                  company_id,
                  product_id: productId,
                  warehouse_id: warehouseId,
                  location_id: null,
                  qty_on_hand: oldQuantity,
                  qty_reserved: 0,
                  avg_unit_cost: unitCost,
                })
                .select()
                .single();
              if (balErr) throw balErr;
              bal = created;
            }
            balanceId = bal.id;
            oldQuantity = Number(bal.qty_on_hand || 0);
            unitCost = Number(bal.avg_unit_cost || product.cost || 0);
          }

          const diff = Number(newQuantity) - oldQuantity;

          if (diff === 0) {
            data = { message: "No change in quantity." };
            break;
          }

          const totalValue = Math.abs(diff * unitCost);

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

          const items = diff > 0
            ? [
                { journal_entry_id: je.id, account_id: inventoryAccountId, type: 'debit', amount: totalValue },
                { journal_entry_id: je.id, account_id: adjustmentAccountId, type: 'credit', amount: totalValue },
              ]
            : [
                { journal_entry_id: je.id, account_id: adjustmentAccountId, type: 'debit', amount: totalValue },
                { journal_entry_id: je.id, account_id: inventoryAccountId, type: 'credit', amount: totalValue },
              ];

          const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert(items);
          if (itemsError) throw itemsError;

          if (balanceId) {
            const { error: balUpdErr } = await supabaseAdmin
              .from('inv_balances')
              .update({ qty_on_hand: Number(newQuantity), updated_at: new Date().toISOString() })
              .eq('id', balanceId);
            if (balUpdErr) throw balUpdErr;

            if (diff > 0) {
              await supabaseAdmin.from('inv_cost_layers').insert({
                company_id,
                product_id: productId,
                warehouse_id: warehouseId,
                qty_remaining: diff,
                unit_cost: unitCost,
                received_at: new Date().toISOString(),
                source_doc_type: 'adjustment',
                status: 'open',
              });
            }

            const { data: bals } = await supabaseAdmin
              .from('inv_balances')
              .select('qty_on_hand')
              .eq('company_id', company_id)
              .eq('product_id', productId);
            const total = (bals || []).reduce((s, r) => s + Number(r.qty_on_hand || 0), 0);
            ({ data, error } = await supabaseAdmin
              .from('products')
              .update({ quantity_on_hand: total, updated_at: new Date().toISOString() })
              .eq('id', productId)
              .eq('company_id', company_id)
              .select()
              .single());
          } else {
            ({ data, error } = await supabaseAdmin
              .from('products')
              .update({ quantity_on_hand: newQuantity })
              .eq('id', productId)
              .eq('company_id', company_id)
              .select()
              .single());
          }

          if (error) throw error;

          await supabaseAdmin.from('inventory_transactions').insert({
            company_id,
            product_id: productId,
            transaction_date: date,
            quantity_change: diff,
            transaction_type: 'adjustment',
            unit_cost: unitCost,
            total_cost: totalValue,
            warehouse_id: warehouseId,
            journal_entry_id: je.id,
            reference_id: je.id,
            description: reason,
          });
        }
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
    return edgeFailure(_ctx, error);
  }
}))
