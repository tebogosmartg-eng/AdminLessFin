// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

/** Next PO-##### from existing numbers. Ignores non-standard refs (e.g. CLOSURE-PO-…). */
async function allocateNextPoNumber(client, companyId) {
  const { data: existingNums, error: listErr } = await client
    .from('purchase_orders')
    .select('po_number')
    .eq('company_id', companyId);
  if (listErr) throw listErr;
  let maxSeq = 0n;
  for (const row of existingNums ?? []) {
    const match = /^PO-(\d+)$/i.exec(String(row.po_number ?? ''));
    if (!match) continue;
    try {
      const n = BigInt(match[1]);
      if (n > maxSeq) maxSeq = n;
    } catch { /* ignore unparseable */ }
  }
  return `PO-${(maxSeq + 1n).toString().padStart(5, '0')}`;
}

serve(withEnterprisePlatform('purchase-orders', 'tenant', async (req, _ctx) => {

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
          .select('*, vendors(name, email, address), purchase_order_items(*, projects(name))')
          .eq('id', body.poId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'GET_NEXT_NUMBER':
        data = await allocateNextPoNumber(supabaseAdmin, company_id);
        error = null;
        break;

      case 'POST':
        const { items: postItems, ...postData } = body.poData;
        if (!String(postData.po_number || '').trim()) {
          postData.po_number = await allocateNextPoNumber(supabaseAdmin, company_id);
        }
        const { data: newPO, error: postError } = await supabaseAdmin
          .from('purchase_orders')
          .insert({ ...postData, company_id })
          .select('id')
          .single();
        if (postError) throw postError;
        
        const itemsToInsert = postItems.map(item => ({ 
          ...item, 
          purchase_order_id: newPO.id,
          project_id: item.project_id || null // Ensure project_id is handled
        }));
        const { error: postItemsError } = await supabaseAdmin.from('purchase_order_items').insert(itemsToInsert);
        if (postItemsError) throw postItemsError;
        data = newPO;
        break;

      case 'PUT': {
        const { data: existingPo, error: existingErr } = await supabaseAdmin
          .from('purchase_orders')
          .select('status')
          .eq('id', body.poId)
          .eq('company_id', company_id)
          .maybeSingle();
        if (existingErr) throw existingErr;
        if (!existingPo) throw new Error('Purchase order not found.');
        if (existingPo.status === 'cancelled') {
          throw new Error('A cancelled purchase order cannot be edited.');
        }

        const { items: putItems, ...putData } = body.poData;
        const { error: putError } = await supabaseAdmin
          .from('purchase_orders')
          .update(putData)
          .eq('id', body.poId)
          .eq('company_id', company_id);
        if (putError) throw putError;

        // Status-only updates (convert to bill) must not wipe line items.
        if (Array.isArray(putItems)) {
          await supabaseAdmin.from('purchase_order_items').delete().eq('purchase_order_id', body.poId);
          const putItemsToInsert = putItems.map(item => ({
            ...item,
            purchase_order_id: body.poId,
            project_id: item.project_id || null
          }));
          const { error: putItemsError } = await supabaseAdmin.from('purchase_order_items').insert(putItemsToInsert);
          if (putItemsError) throw putItemsError;
        }
        data = { id: body.poId };
        break;
      }

      case 'CANCEL': {
        const { data: current, error: currentErr } = await supabaseAdmin
          .from('purchase_orders')
          .select('id, status')
          .eq('id', body.poId)
          .eq('company_id', company_id)
          .maybeSingle();
        if (currentErr) throw currentErr;
        if (!current) throw new Error('Purchase order not found.');
        if (current.status === 'cancelled') {
          data = { id: current.id, status: 'cancelled' };
          break;
        }
        if (current.status === 'billed' || current.status === 'closed') {
          throw new Error('A billed or closed purchase order cannot be cancelled.');
        }
        if (current.status !== 'draft' && current.status !== 'sent') {
          throw new Error('Only draft or sent purchase orders can be cancelled.');
        }
        const { data: cancelled, error: cancelErr } = await supabaseAdmin
          .from('purchase_orders')
          .update({ status: 'cancelled' })
          .eq('id', body.poId)
          .eq('company_id', company_id)
          .select('id, status')
          .single();
        if (cancelErr) throw cancelErr;
        data = cancelled;
        break;
      }

      case 'DELETE':
        throw new Error('Purchase orders cannot be deleted. Cancel the purchase order instead.');

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
