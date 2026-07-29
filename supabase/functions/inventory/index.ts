// @ts-nocheck
/**
 * AdminLess Fin V17.0 — Enterprise Inventory & Cost Management API
 * Additive. Posts journals via existing journal_entries pattern (engine unchanged).
 * Does not modify products CRUD / ADJUST_QUANTITY contracts.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
  bootstrapTenantRequest,
} from '../_shared/enterpriseEdgePlatform.ts'

const corsHeaders = ENTERPRISE_CORS_HEADERS

function computeWeightedAverage(q0, c0, q1, c1) {
  const a = Math.max(Number(q0) || 0, 0);
  const b = Number(q1) || 0;
  if (a + b <= 0) return Number(c1) || 0;
  return (a * (Number(c0) || 0) + b * (Number(c1) || 0)) / (a + b);
}

function assertPositiveQty(qty, label = 'Quantity') {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return n;
}

function assertNonNegativeQty(qty, label = 'Quantity') {
  const n = Number(qty);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
  return n;
}

/** Consume FIFO/specific cost layers; returns total cost and unit cost. */
async function consumeCostLayers(admin, {
  company_id, product_id, warehouse_id, qty, method, specific_layer_id,
}) {
  let layersQuery = admin
    .from('inv_cost_layers')
    .select('*')
    .eq('company_id', company_id)
    .eq('product_id', product_id)
    .eq('warehouse_id', warehouse_id)
    .eq('status', 'open')
    .gt('qty_remaining', 0)
    .order('received_at', { ascending: true });
  if (method === 'specific' && specific_layer_id) {
    layersQuery = admin.from('inv_cost_layers').select('*').eq('id', specific_layer_id).eq('company_id', company_id);
  }
  const { data: layers, error: lErr } = await layersQuery;
  if (lErr) throw lErr;
  let remaining = Number(qty);
  let totalCost = 0;
  const taken = [];
  for (const layer of layers || []) {
    if (remaining <= 0) break;
    const take = Math.min(Number(layer.qty_remaining), remaining);
    totalCost += take * Number(layer.unit_cost);
    const left = Number(layer.qty_remaining) - take;
    await admin.from('inv_cost_layers').update({
      qty_remaining: left,
      status: left <= 0.0000001 ? 'exhausted' : 'open',
    }).eq('id', layer.id);
    taken.push({ unit_cost: Number(layer.unit_cost), qty: take, lot_code: layer.lot_code || null });
    remaining -= take;
  }
  if (remaining > 0.0001) throw new Error('Insufficient FIFO/specific cost layers.');
  return { totalCost, unitCost: totalCost / Number(qty), taken };
}

async function ensureDefaultWarehouse(admin, company_id) {
  const { data: existing } = await admin
    .from('inv_warehouses')
    .select('*')
    .eq('company_id', company_id)
    .eq('is_default', true)
    .maybeSingle();
  if (existing) return existing;
  const { data: anyWh } = await admin
    .from('inv_warehouses')
    .select('*')
    .eq('company_id', company_id)
    .limit(1)
    .maybeSingle();
  if (anyWh) return anyWh;
  const { data: created, error } = await admin
    .from('inv_warehouses')
    .insert({
      company_id,
      code: 'MAIN',
      name: 'Main Warehouse',
      is_default: true,
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;
  // Seed common UOMs
  await admin.from('inv_uom').upsert([
    { company_id, code: 'EA', name: 'Each', is_base: true },
    { company_id, code: 'KG', name: 'Kilogram', is_base: false },
    { company_id, code: 'BOX', name: 'Box', is_base: false },
  ], { onConflict: 'company_id,code', ignoreDuplicates: true });
  return created;
}

async function getOrCreateBalance(admin, { company_id, product_id, warehouse_id, location_id }) {
  let q = admin
    .from('inv_balances')
    .select('*')
    .eq('company_id', company_id)
    .eq('product_id', product_id)
    .eq('warehouse_id', warehouse_id);
  if (location_id) q = q.eq('location_id', location_id);
  else q = q.is('location_id', null);
  const { data: bal } = await q.maybeSingle();
  if (bal) return bal;
  const { data: created, error } = await admin
    .from('inv_balances')
    .insert({
      company_id,
      product_id,
      warehouse_id,
      location_id: location_id || null,
      qty_on_hand: 0,
      qty_reserved: 0,
      avg_unit_cost: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return created;
}

async function syncProductQty(admin, company_id, product_id) {
  const { data: rows } = await admin
    .from('inv_balances')
    .select('qty_on_hand')
    .eq('company_id', company_id)
    .eq('product_id', product_id);
  const total = (rows || []).reduce((s, r) => s + Number(r.qty_on_hand || 0), 0);
  await admin.from('products').update({
    quantity_on_hand: total,
    updated_at: new Date().toISOString(),
  }).eq('id', product_id).eq('company_id', company_id);
  return total;
}

async function postInventoryJournal(admin, {
  company_id, entry_date, description, debit_account_id, credit_account_id, amount, vendor_id,
}) {
  if (!amount || amount <= 0) return null;
  if (!debit_account_id || !credit_account_id) {
    throw new Error('Inventory and offset GL accounts are required to post inventory journals.');
  }
  const { data: je, error: jeError } = await admin.from('journal_entries').insert({
    company_id,
    entry_date,
    description,
    vendor_id: vendor_id || null,
  }).select('id').single();
  if (jeError) throw jeError;
  const { error: itemsError } = await admin.from('journal_entry_items').insert([
    { journal_entry_id: je.id, account_id: debit_account_id, type: 'debit', amount },
    { journal_entry_id: je.id, account_id: credit_account_id, type: 'credit', amount },
  ]);
  if (itemsError) throw itemsError;
  return je.id;
}

// Delegates to receive_stock_atomic (single-transaction Postgres RPC) instead of
// the previous multi-step JS orchestration, so a mid-sequence failure can no
// longer leave balances/cost-layers/journals inconsistent.
async function receiveStock(admin, {
  company_id, product, warehouse_id, location_id, qty, unit_cost, date, source_doc_type, source_doc_id,
  inventory_account_id, offset_account_id, description, vendor_id, lot_code, actor_user_id,
}) {
  qty = assertPositiveQty(qty, 'Receipt quantity');
  const cost = Number(unit_cost);
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error('Unit cost must be a non-negative number.');
  }
  const { data, error } = await admin.rpc('receive_stock_atomic', {
    p_company_id: company_id,
    p_product_id: product.id,
    p_warehouse_id: warehouse_id,
    p_qty: qty,
    p_unit_cost: cost,
    p_date: (date || new Date().toISOString()).slice(0, 10),
    p_source_doc_type: source_doc_type,
    p_source_doc_id: source_doc_id,
    p_inventory_account_id: inventory_account_id || product.inventory_asset_account_id,
    p_offset_account_id: offset_account_id,
    p_description: description || `Inventory receipt: ${product.name}`,
    p_vendor_id: vendor_id,
    p_lot_code: lot_code,
    p_location_id: location_id,
    p_actor_user_id: actor_user_id,
  }).single();
  if (error) throw error;
  return { journal_entry_id: data.journal_entry_id, amount: data.amount, unit_cost: data.unit_cost };
}

// Delegates to issue_stock_atomic (single-transaction Postgres RPC) instead of
// the previous multi-step JS orchestration.
async function issueStock(admin, {
  company_id, product, warehouse_id, location_id, qty, date, source_doc_type, source_doc_id,
  inventory_account_id, cogs_account_id, description, specific_layer_id, actor_user_id,
}) {
  qty = assertPositiveQty(qty, 'Issue quantity');
  const { data, error } = await admin.rpc('issue_stock_atomic', {
    p_company_id: company_id,
    p_product_id: product.id,
    p_warehouse_id: warehouse_id,
    p_qty: qty,
    p_date: (date || new Date().toISOString()).slice(0, 10),
    p_source_doc_type: source_doc_type,
    p_source_doc_id: source_doc_id,
    p_inventory_account_id: inventory_account_id || product.inventory_asset_account_id,
    p_cogs_account_id: cogs_account_id || product.cogs_account_id,
    p_description: description || `Inventory issue / COGS: ${product.name}`,
    p_specific_layer_id: specific_layer_id,
    p_location_id: location_id,
    p_actor_user_id: actor_user_id,
  }).single();
  if (error) throw error;
  return { journal_entry_id: data.journal_entry_id, amount: data.amount, unit_cost: data.unit_cost };
}

serve(withEnterprisePlatform('inventory', 'tenant', async (req, _ctx) => {
  try {
    // ERP Context (V10 Foundation): auth + company membership + financial
    // year/period resolved centrally instead of reimplemented per function.
    const { user, admin, body, company_id } = await bootstrapTenantRequest(req, _ctx);
    const { method } = body;

    let data, error;

    switch (method) {
      case 'BOOTSTRAP': {
        const wh = await ensureDefaultWarehouse(admin, company_id);
        data = { warehouse: wh };
        break;
      }

      case 'LIST_WAREHOUSES':
        await ensureDefaultWarehouse(admin, company_id);
        ({ data, error } = await admin.from('inv_warehouses').select('*').eq('company_id', company_id).order('code'));
        break;

      case 'UPSERT_WAREHOUSE': {
        const row = { ...body.warehouse, company_id, updated_at: new Date().toISOString() };
        if (row.is_default) {
          await admin.from('inv_warehouses').update({ is_default: false }).eq('company_id', company_id);
        }
        if (row.id) {
          const id = row.id; delete row.id;
          ({ data, error } = await admin.from('inv_warehouses').update(row).eq('id', id).eq('company_id', company_id).select().single());
        } else {
          ({ data, error } = await admin.from('inv_warehouses').insert(row).select().single());
        }
        break;
      }

      case 'LIST_LOCATIONS':
        ({ data, error } = await admin.from('inv_locations').select('*').eq('company_id', company_id).eq('warehouse_id', body.warehouseId).order('code'));
        break;

      case 'UPSERT_LOCATION': {
        const row = { ...body.location, company_id };
        if (row.id) {
          const id = row.id; delete row.id;
          ({ data, error } = await admin.from('inv_locations').update(row).eq('id', id).eq('company_id', company_id).select().single());
        } else {
          ({ data, error } = await admin.from('inv_locations').insert(row).select().single());
        }
        break;
      }

      case 'LIST_UOM':
        await ensureDefaultWarehouse(admin, company_id);
        ({ data, error } = await admin.from('inv_uom').select('*').eq('company_id', company_id).order('code'));
        break;

      case 'UPSERT_UOM': {
        const row = { ...body.uom, company_id };
        if (row.id) {
          const id = row.id; delete row.id;
          ({ data, error } = await admin.from('inv_uom').update(row).eq('id', id).eq('company_id', company_id).select().single());
        } else {
          ({ data, error } = await admin.from('inv_uom').insert(row).select().single());
        }
        break;
      }

      case 'GET_REGISTER': {
        await ensureDefaultWarehouse(admin, company_id);
        const { data: products, error: pErr } = await admin
          .from('products')
          .select('*, income_account:income_account_id(name), cogs_account:cogs_account_id(name), inventory_asset_account:inventory_asset_account_id(name), vendors:supplier_id(name)')
          .eq('company_id', company_id)
          .order('name');
        if (pErr) throw pErr;
        const { data: balances } = await admin
          .from('inv_balances')
          .select('*, inv_warehouses(code, name), inv_locations(code, name)')
          .eq('company_id', company_id);
        data = { products: products || [], balances: balances || [] };
        break;
      }

      case 'GET_MOVEMENTS': {
        const { data: movements, error: mErr } = await admin
          .from('inventory_transactions')
          .select('*, products(name, sku)')
          .eq('company_id', company_id)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(body.limit || 200);
        if (mErr) throw mErr;
        const warehouseIds = [...new Set((movements || []).map((m) => m.warehouse_id).filter(Boolean))];
        let whMap = {};
        if (warehouseIds.length) {
          const { data: whs } = await admin.from('inv_warehouses').select('id, code, name').in('id', warehouseIds);
          for (const w of whs || []) whMap[w.id] = w;
        }
        data = (movements || []).map((m) => ({
          ...m,
          inv_warehouses: m.warehouse_id ? (whMap[m.warehouse_id] || null) : null,
        }));
        break;
      }

      case 'GET_VALUATION': {
        const { data: products, error: pErr } = await admin
          .from('products')
          .select('*')
          .eq('company_id', company_id)
          .neq('item_class', 'service')
          .neq('type', 'service');
        if (pErr) throw pErr;
        const { data: balances } = await admin.from('inv_balances').select('*').eq('company_id', company_id);
        const byProduct = {};
        for (const b of balances || []) {
          byProduct[b.product_id] = byProduct[b.product_id] || { qty: 0, value: 0 };
          byProduct[b.product_id].qty += Number(b.qty_on_hand);
          byProduct[b.product_id].value += Number(b.qty_on_hand) * Number(b.avg_unit_cost || 0);
        }
        data = (products || []).map((p) => {
          const agg = byProduct[p.id];
          const qty = agg ? agg.qty : Number(p.quantity_on_hand || 0);
          const unit = agg && agg.qty > 0 ? agg.value / agg.qty : Number(p.cost || p.standard_cost || 0);
          return {
            ...p,
            quantity_on_hand: qty,
            unit_cost: unit,
            asset_value: qty * unit,
          };
        });
        break;
      }

      case 'RECEIVE': {
        const { data: product, error: pErr } = await admin.from('products').select('*').eq('id', body.productId).eq('company_id', company_id).single();
        if (pErr) throw pErr;
        const wh = body.warehouseId || (await ensureDefaultWarehouse(admin, company_id)).id;
        data = await receiveStock(admin, {
          company_id,
          product,
          warehouse_id: wh,
          location_id: body.locationId || null,
          qty: Number(body.qty),
          unit_cost: Number(body.unitCost),
          date: body.date,
          source_doc_type: body.source_doc_type || 'manual_receipt',
          source_doc_id: body.source_doc_id || null,
          inventory_account_id: body.inventoryAccountId,
          offset_account_id: body.offsetAccountId,
          description: body.description,
          vendor_id: body.vendorId || product.supplier_id,
          lot_code: body.lotCode,
          actor_user_id: user.id,
        });
        break;
      }

      case 'ISSUE': {
        const { data: product, error: pErr } = await admin.from('products').select('*').eq('id', body.productId).eq('company_id', company_id).single();
        if (pErr) throw pErr;
        const wh = body.warehouseId || (await ensureDefaultWarehouse(admin, company_id)).id;
        data = await issueStock(admin, {
          company_id,
          product,
          warehouse_id: wh,
          location_id: body.locationId || null,
          qty: Number(body.qty),
          date: body.date,
          source_doc_type: body.source_doc_type || 'manual_issue',
          source_doc_id: body.source_doc_id || null,
          inventory_account_id: body.inventoryAccountId,
          cogs_account_id: body.cogsAccountId,
          description: body.description,
          specific_layer_id: body.specificLayerId,
          actor_user_id: user.id,
        });
        break;
      }

      case 'TRANSFER': {
        const { data: product, error: pErr } = await admin.from('products').select('*').eq('id', body.productId).eq('company_id', company_id).single();
        if (pErr) throw pErr;
        const qty = assertPositiveQty(body.qty, 'Transfer quantity');
        if (!body.fromWarehouseId || !body.toWarehouseId) {
          throw new Error('From and to warehouses are required.');
        }
        if (body.fromWarehouseId === body.toWarehouseId && (body.fromLocationId || null) === (body.toLocationId || null)) {
          throw new Error('Transfer source and destination must differ.');
        }
        const fromBal = await getOrCreateBalance(admin, {
          company_id, product_id: product.id, warehouse_id: body.fromWarehouseId, location_id: body.fromLocationId || null,
        });
        if (Number(fromBal.qty_on_hand) < qty) throw new Error('Insufficient quantity to transfer.');
        const method = product.cost_method || 'weighted_average';
        let unitCost = Number(fromBal.avg_unit_cost || product.cost || 0);
        let layerSlices = null;
        if (method === 'fifo' || method === 'specific') {
          // Consume at source; recreate at destination after transfer header exists
          const consumed = await consumeCostLayers(admin, {
            company_id,
            product_id: product.id,
            warehouse_id: body.fromWarehouseId,
            qty,
            method,
            specific_layer_id: body.specificLayerId,
          });
          unitCost = consumed.unitCost;
          layerSlices = consumed.taken;
        }
        await admin.from('inv_balances').update({
          qty_on_hand: Number(fromBal.qty_on_hand) - qty,
          updated_at: new Date().toISOString(),
        }).eq('id', fromBal.id);
        const toBal = await getOrCreateBalance(admin, {
          company_id, product_id: product.id, warehouse_id: body.toWarehouseId, location_id: body.toLocationId || null,
        });
        const newAvg = computeWeightedAverage(toBal.qty_on_hand, toBal.avg_unit_cost, qty, unitCost);
        await admin.from('inv_balances').update({
          qty_on_hand: Number(toBal.qty_on_hand) + qty,
          avg_unit_cost: newAvg,
          updated_at: new Date().toISOString(),
        }).eq('id', toBal.id);

        const transfer_number = body.transferNumber || `TR-${Date.now().toString(36).toUpperCase()}`;
        const { data: transfer, error: tErr } = await admin.from('inv_transfers').insert({
          company_id,
          transfer_number,
          product_id: product.id,
          qty,
          from_warehouse_id: body.fromWarehouseId,
          to_warehouse_id: body.toWarehouseId,
          from_location_id: body.fromLocationId || null,
          to_location_id: body.toLocationId || null,
          status: 'completed',
          transfer_date: body.date || new Date().toISOString().slice(0, 10),
          notes: body.notes || null,
          created_by: user.id,
        }).select().single();
        if (tErr) throw tErr;

        if (layerSlices?.length) {
          for (const slice of layerSlices) {
            await admin.from('inv_cost_layers').insert({
              company_id,
              product_id: product.id,
              warehouse_id: body.toWarehouseId,
              qty_remaining: slice.qty,
              unit_cost: slice.unit_cost,
              received_at: new Date().toISOString(),
              source_doc_type: 'transfer',
              source_doc_id: transfer.id,
              lot_code: slice.lot_code,
              status: 'open',
            });
          }
        } else if (method === 'weighted_average' || method === 'standard') {
          // Keep destination layers aligned for future FIFO conversions / reporting
          await admin.from('inv_cost_layers').insert({
            company_id,
            product_id: product.id,
            warehouse_id: body.toWarehouseId,
            qty_remaining: qty,
            unit_cost: unitCost,
            received_at: new Date().toISOString(),
            source_doc_type: 'transfer',
            source_doc_id: transfer.id,
            status: 'open',
          });
        }

        // Intra-company transfer: no P&L journal (balance sheet location only)
        await admin.from('inventory_transactions').insert([
          {
            company_id, product_id: product.id,
            transaction_date: transfer.transfer_date,
            quantity_change: -qty, transaction_type: 'transfer_out',
            unit_cost: unitCost, total_cost: unitCost * qty,
            warehouse_id: body.fromWarehouseId, location_id: body.fromLocationId || null,
            source_doc_type: 'transfer', source_doc_id: transfer.id,
            description: `Transfer out ${transfer_number}`,
          },
          {
            company_id, product_id: product.id,
            transaction_date: transfer.transfer_date,
            quantity_change: qty, transaction_type: 'transfer_in',
            unit_cost: unitCost, total_cost: unitCost * qty,
            warehouse_id: body.toWarehouseId, location_id: body.toLocationId || null,
            source_doc_type: 'transfer', source_doc_id: transfer.id,
            description: `Transfer in ${transfer_number}`,
          },
        ]);
        await syncProductQty(admin, company_id, product.id);
        data = transfer;
        break;
      }

      case 'ADJUST': {
        const { data: product, error: pErr } = await admin.from('products').select('*').eq('id', body.productId).eq('company_id', company_id).single();
        if (pErr) throw pErr;
        const wh = body.warehouseId || (await ensureDefaultWarehouse(admin, company_id)).id;
        const bal = await getOrCreateBalance(admin, {
          company_id, product_id: product.id, warehouse_id: wh, location_id: body.locationId || null,
        });
        const newQty = assertNonNegativeQty(body.newQuantity, 'Adjusted quantity');
        const diff = newQty - Number(bal.qty_on_hand);
        if (diff === 0) { data = { message: 'No change' }; break; }
        const method = product.cost_method || 'weighted_average';
        let unitCost = Number(bal.avg_unit_cost || product.cost || 0);
        let amount = Math.abs(diff) * unitCost;
        if (diff < 0 && (method === 'fifo' || method === 'specific')) {
          const consumed = await consumeCostLayers(admin, {
            company_id,
            product_id: product.id,
            warehouse_id: wh,
            qty: Math.abs(diff),
            method,
            specific_layer_id: body.specificLayerId,
          });
          unitCost = consumed.unitCost;
          amount = Math.abs(consumed.totalCost);
        }
        const invAcct = body.inventoryAccountId || product.inventory_asset_account_id;
        const adjAcct = body.adjustmentAccountId || product.variance_account_id || product.cogs_account_id;
        if (amount > 0.0001 && (!invAcct || !adjAcct)) {
          throw new Error('Inventory asset and adjustment/variance accounts are required to post stock adjustments.');
        }
        let jeId = null;
        if (amount > 0.0001) {
          jeId = await postInventoryJournal(admin, {
            company_id,
            entry_date: body.date || new Date().toISOString().slice(0, 10),
            description: `Inventory adjustment: ${product.name} (${diff > 0 ? '+' : ''}${diff}) — ${body.reason || ''}`,
            debit_account_id: diff > 0 ? invAcct : adjAcct,
            credit_account_id: diff > 0 ? adjAcct : invAcct,
            amount,
          });
        }
        await admin.from('inv_balances').update({
          qty_on_hand: newQty,
          updated_at: new Date().toISOString(),
        }).eq('id', bal.id);
        if (diff > 0) {
          await admin.from('inv_cost_layers').insert({
            company_id, product_id: product.id, warehouse_id: wh,
            qty_remaining: diff, unit_cost: unitCost,
            received_at: new Date().toISOString(),
            source_doc_type: 'adjustment', status: 'open',
          });
        }
        await admin.from('inventory_transactions').insert({
          company_id, product_id: product.id,
          transaction_date: body.date || new Date().toISOString().slice(0, 10),
          quantity_change: diff, transaction_type: 'adjustment',
          unit_cost: unitCost, total_cost: amount,
          warehouse_id: wh, location_id: body.locationId || null,
          journal_entry_id: jeId, reference_id: jeId,
          cost_method: method,
          description: body.reason || 'Adjustment',
        });
        await syncProductQty(admin, company_id, product.id);
        data = { journal_entry_id: jeId, diff, amount };
        break;
      }

      case 'RESERVE': {
        const wh = body.warehouseId || (await ensureDefaultWarehouse(admin, company_id)).id;
        const bal = await getOrCreateBalance(admin, {
          company_id, product_id: body.productId, warehouse_id: wh, location_id: null,
        });
        const qty = Number(body.qty);
        if (Number(bal.qty_on_hand) - Number(bal.qty_reserved) < qty) {
          throw new Error('Insufficient available quantity to reserve.');
        }
        const { data: res, error: rErr } = await admin.from('inv_reservations').insert({
          company_id,
          product_id: body.productId,
          warehouse_id: wh,
          qty,
          status: 'open',
          reference_type: body.reference_type || null,
          reference_id: body.reference_id || null,
          notes: body.notes || null,
        }).select().single();
        if (rErr) throw rErr;
        await admin.from('inv_balances').update({
          qty_reserved: Number(bal.qty_reserved) + qty,
          updated_at: new Date().toISOString(),
        }).eq('id', bal.id);
        data = res;
        break;
      }

      case 'RELEASE_RESERVATION': {
        const { data: res, error: rErr } = await admin.from('inv_reservations').select('*').eq('id', body.reservationId).eq('company_id', company_id).single();
        if (rErr) throw rErr;
        if (res.status !== 'open') throw new Error('Reservation not open.');
        await admin.from('inv_reservations').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', res.id);
        const bal = await getOrCreateBalance(admin, {
          company_id, product_id: res.product_id, warehouse_id: res.warehouse_id, location_id: null,
        });
        await admin.from('inv_balances').update({
          qty_reserved: Math.max(0, Number(bal.qty_reserved) - Number(res.qty)),
          updated_at: new Date().toISOString(),
        }).eq('id', bal.id);
        data = { ok: true };
        break;
      }

      case 'UPSERT_GOODS_RECEIPT': {
        const wh = body.receipt?.warehouse_id || (await ensureDefaultWarehouse(admin, company_id)).id;
        const receipt = {
          ...body.receipt,
          company_id,
          warehouse_id: wh,
          updated_at: new Date().toISOString(),
        };
        if (!receipt.receipt_number) receipt.receipt_number = `GRN-${Date.now().toString(36).toUpperCase()}`;
        let saved;
        if (receipt.id) {
          const id = receipt.id; delete receipt.id;
          const { data: upd, error: uErr } = await admin.from('inv_goods_receipts').update(receipt).eq('id', id).eq('company_id', company_id).select().single();
          if (uErr) throw uErr;
          saved = upd;
          if (body.lines) {
            await admin.from('inv_goods_receipt_lines').delete().eq('receipt_id', saved.id);
          }
        } else {
          receipt.created_by = user.id;
          receipt.status = receipt.status || 'draft';
          const { data: ins, error: iErr } = await admin.from('inv_goods_receipts').insert(receipt).select().single();
          if (iErr) throw iErr;
          saved = ins;
        }
        if (body.lines?.length) {
          const lines = body.lines.map((l) => ({ ...l, company_id, receipt_id: saved.id }));
          const { error: lErr } = await admin.from('inv_goods_receipt_lines').insert(lines);
          if (lErr) throw lErr;
        }
        const { data: full } = await admin.from('inv_goods_receipts').select('*, inv_goods_receipt_lines(*), vendors:vendor_id(name)').eq('id', saved.id).single();
        data = full;
        break;
      }

      case 'POST_GOODS_RECEIPT': {
        const { data: grn, error: gErr } = await admin
          .from('inv_goods_receipts')
          .select('*, inv_goods_receipt_lines(*)')
          .eq('id', body.receiptId)
          .eq('company_id', company_id)
          .single();
        if (gErr) throw gErr;
        if (grn.status === 'received' || grn.status === 'matched') { data = grn; break; }
        if (grn.status === 'cancelled') throw new Error('Cannot post a cancelled goods receipt.');
        const offsetAccount = body.grniAccountId || body.offsetAccountId;
        if (!offsetAccount) {
          throw new Error('GRNI/offset account is required to post a goods receipt.');
        }
        const results = [];
        for (const line of grn.inv_goods_receipt_lines || []) {
          if (Number(line.qty_received) <= 0) continue;
          const { data: product, error: pErr } = await admin
            .from('products')
            .select('*')
            .eq('id', line.product_id)
            .eq('company_id', company_id)
            .single();
          if (pErr) throw pErr;
          if (product.item_class === 'service' || product.item_class === 'non_stock' || product.type === 'service') continue;
          const r = await receiveStock(admin, {
            company_id,
            product,
            warehouse_id: grn.warehouse_id,
            location_id: line.location_id || null,
            qty: Number(line.qty_received),
            unit_cost: Number(line.unit_cost),
            date: grn.receipt_date,
            source_doc_type: 'goods_receipt',
            source_doc_id: grn.id,
            inventory_account_id: body.inventoryAccountId || product.inventory_asset_account_id,
            offset_account_id: offsetAccount,
            description: `GRN ${grn.receipt_number}: ${product.name}`,
            vendor_id: grn.vendor_id,
            actor_user_id: user.id,
          });
          results.push(r);
        }
        if (!results.length) {
          throw new Error('Goods receipt has no stock lines to post.');
        }
        const jeIds = results.map((r) => r.journal_entry_id).filter(Boolean);
        const { data: updated, error: uErr } = await admin.from('inv_goods_receipts').update({
          status: 'received',
          journal_entry_id: jeIds[0] || null,
          updated_at: new Date().toISOString(),
        }).eq('id', grn.id).eq('company_id', company_id).select().single();
        if (uErr) throw uErr;
        data = { receipt: updated, postings: results };
        break;
      }

      case 'LIST_GOODS_RECEIPTS':
        ({ data, error } = await admin
          .from('inv_goods_receipts')
          .select('*, vendors:vendor_id(name), inv_warehouses(code, name)')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false }));
        break;

      case 'CREATE_CYCLE_COUNT': {
        const count_number = body.count_number || `CC-${Date.now().toString(36).toUpperCase()}`;
        const { data: count, error: cErr } = await admin.from('inv_cycle_counts').insert({
          company_id,
          count_number,
          warehouse_id: body.warehouseId,
          location_id: body.locationId || null,
          count_type: body.count_type || 'cycle',
          status: 'draft',
          count_date: body.count_date || new Date().toISOString().slice(0, 10),
          notes: body.notes || null,
          created_by: user.id,
        }).select().single();
        if (cErr) throw cErr;
        const { data: bals } = await admin.from('inv_balances').select('*').eq('company_id', company_id).eq('warehouse_id', body.warehouseId);
        const lines = (bals || []).map((b) => ({
          company_id,
          count_id: count.id,
          product_id: b.product_id,
          system_qty: b.qty_on_hand,
          counted_qty: null,
          unit_cost: b.avg_unit_cost,
        }));
        if (lines.length) await admin.from('inv_cycle_count_lines').insert(lines);
        data = count;
        break;
      }

      case 'UPDATE_CYCLE_COUNT_LINE':
        ({ data, error } = await admin
          .from('inv_cycle_count_lines')
          .update({ counted_qty: body.counted_qty })
          .eq('id', body.lineId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'POST_CYCLE_COUNT': {
        const { data: count, error: cErr } = await admin
          .from('inv_cycle_counts')
          .select('*, inv_cycle_count_lines(*)')
          .eq('id', body.countId)
          .eq('company_id', company_id)
          .single();
        if (cErr) throw cErr;
        if (count.status === 'posted') { data = { count, adjustments: [] }; break; }
        if (count.status === 'cancelled') throw new Error('Cannot post a cancelled cycle count.');
        const adjustments = [];
        for (const line of count.inv_cycle_count_lines || []) {
          if (line.counted_qty == null) continue;
          const counted = assertNonNegativeQty(line.counted_qty, 'Counted quantity');
          const diff = counted - Number(line.system_qty);
          if (Math.abs(diff) < 0.0001) continue;
          const { data: product, error: pErr } = await admin
            .from('products')
            .select('*')
            .eq('id', line.product_id)
            .eq('company_id', company_id)
            .single();
          if (pErr) throw pErr;
          const bal = await getOrCreateBalance(admin, {
            company_id, product_id: line.product_id, warehouse_id: count.warehouse_id, location_id: count.location_id || null,
          });
          const method = product?.cost_method || 'weighted_average';
          let unitCost = Number(line.unit_cost || bal.avg_unit_cost || product?.cost || 0);
          let amount = Math.abs(diff) * unitCost;
          if (diff < 0 && (method === 'fifo' || method === 'specific')) {
            const consumed = await consumeCostLayers(admin, {
              company_id,
              product_id: line.product_id,
              warehouse_id: count.warehouse_id,
              qty: Math.abs(diff),
              method,
            });
            unitCost = consumed.unitCost;
            amount = Math.abs(consumed.totalCost);
          }
          const invAcct = body.inventoryAccountId || product?.inventory_asset_account_id;
          const adjAcct = body.adjustmentAccountId || product?.variance_account_id || product?.cogs_account_id;
          if (amount > 0.0001 && (!invAcct || !adjAcct)) {
            throw new Error(`Inventory and adjustment accounts required for cycle count variance on ${product?.name || line.product_id}.`);
          }
          let jeId = null;
          if (amount > 0.0001) {
            jeId = await postInventoryJournal(admin, {
              company_id,
              entry_date: count.count_date,
              description: `Cycle count ${count.count_number}: ${product?.name}`,
              debit_account_id: diff > 0 ? invAcct : adjAcct,
              credit_account_id: diff > 0 ? adjAcct : invAcct,
              amount,
            });
          }
          await admin.from('inv_balances').update({
            qty_on_hand: counted,
            updated_at: new Date().toISOString(),
          }).eq('id', bal.id);
          if (diff > 0) {
            await admin.from('inv_cost_layers').insert({
              company_id, product_id: line.product_id, warehouse_id: count.warehouse_id,
              qty_remaining: diff, unit_cost: unitCost,
              received_at: new Date().toISOString(),
              source_doc_type: 'cycle_count', source_doc_id: count.id, status: 'open',
            });
          }
          await admin.from('inventory_transactions').insert({
            company_id, product_id: line.product_id,
            transaction_date: count.count_date,
            quantity_change: diff, transaction_type: 'cycle_count',
            unit_cost: unitCost, total_cost: amount,
            warehouse_id: count.warehouse_id, journal_entry_id: jeId,
            source_doc_type: 'cycle_count', source_doc_id: count.id,
            cost_method: method,
            description: `Cycle count ${count.count_number}`,
          });
          await syncProductQty(admin, company_id, line.product_id);
          adjustments.push({ product_id: line.product_id, diff, jeId });
        }
        const { data: posted } = await admin.from('inv_cycle_counts').update({
          status: 'posted',
          posted_at: new Date().toISOString(),
        }).eq('id', count.id).eq('company_id', company_id).select().single();
        data = { count: posted, adjustments };
        break;
      }

      case 'LIST_CYCLE_COUNTS':
        ({ data, error } = await admin.from('inv_cycle_counts').select('*, inv_warehouses(code, name)').eq('company_id', company_id).order('created_at', { ascending: false }));
        break;

      case 'COST_ADJUSTMENT': {
        const { data: product, error: pErr } = await admin.from('products').select('*').eq('id', body.productId).eq('company_id', company_id).single();
        if (pErr) throw pErr;
        const wh = body.warehouseId || (await ensureDefaultWarehouse(admin, company_id)).id;
        const bal = await getOrCreateBalance(admin, {
          company_id, product_id: product.id, warehouse_id: wh, location_id: null,
        });
        const from = Number(bal.avg_unit_cost || product.cost || 0);
        const to = Number(body.unitCostTo);
        if (!Number.isFinite(to) || to < 0) throw new Error('Target unit cost must be a non-negative number.');
        const qty = Number(bal.qty_on_hand);
        const amount = (to - from) * qty;
        const invAcct = body.inventoryAccountId || product.inventory_asset_account_id;
        const varAcct = body.varianceAccountId || product.variance_account_id || product.cogs_account_id;
        if (Math.abs(amount) > 0.0001 && (!invAcct || !varAcct)) {
          throw new Error('Inventory and variance accounts are required for cost adjustments.');
        }
        let jeId = null;
        if (Math.abs(amount) > 0.0001) {
          jeId = await postInventoryJournal(admin, {
            company_id,
            entry_date: body.date || new Date().toISOString().slice(0, 10),
            description: `Cost ${body.adjustment_type || 'revaluation'}: ${product.name}`,
            debit_account_id: amount > 0 ? invAcct : varAcct,
            credit_account_id: amount > 0 ? varAcct : invAcct,
            amount: Math.abs(amount),
          });
        }
        await admin.from('inv_balances').update({ avg_unit_cost: to, updated_at: new Date().toISOString() }).eq('id', bal.id);
        await admin.from('products').update({
          cost: to,
          standard_cost: body.adjustment_type === 'standard_update' ? to : product.standard_cost,
          updated_at: new Date().toISOString(),
        }).eq('id', product.id).eq('company_id', company_id);
        const { data: adj } = await admin.from('inv_cost_adjustments').insert({
          company_id,
          product_id: product.id,
          warehouse_id: wh,
          adjustment_type: body.adjustment_type || 'revaluation',
          qty,
          unit_cost_from: from,
          unit_cost_to: to,
          amount,
          reason: body.reason || null,
          journal_entry_id: jeId,
          created_by: user.id,
        }).select().single();
        data = adj;
        break;
      }

      case 'ANALYTICS': {
        const { data: products } = await admin.from('products').select('*').eq('company_id', company_id);
        const { data: balances } = await admin.from('inv_balances').select('*, inv_warehouses(code, name)').eq('company_id', company_id);
        const { data: movements } = await admin
          .from('inventory_transactions')
          .select('*')
          .eq('company_id', company_id)
          .order('transaction_date', { ascending: false })
          .limit(2000);
        const { data: warehouses } = await admin.from('inv_warehouses').select('*').eq('company_id', company_id);
        data = {
          products: products || [],
          balances: balances || [],
          movements: movements || [],
          warehouses: warehouses || [],
        };
        break;
      }

      case 'LIST_TRANSFERS':
        ({ data, error } = await admin
          .from('inv_transfers')
          .select('*, products(name, sku), from_wh:from_warehouse_id(code, name), to_wh:to_warehouse_id(code, name)')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false })
          .limit(100));
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
