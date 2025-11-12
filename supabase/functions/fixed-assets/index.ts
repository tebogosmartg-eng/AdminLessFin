// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ARCHITECTURE NOTE:
// This function acts as a secure API gateway for all fixed asset operations.
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
      case 'GET_ALL':
        ({ data, error } = await supabaseAdmin
          .from('fixed_assets')
          .select('*, asset_categories(name)')
          .eq('company_id', company_id)
          .order('purchase_date', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('fixed_assets')
          .select(`
            *,
            asset_categories ( name ),
            vendors ( name ),
            employees ( first_name, last_name ),
            asset_account:asset_account_id ( name ),
            accum_depr_account:accumulated_depreciation_account_id ( name ),
            depr_expense_account:depreciation_expense_account_id ( name )
          `)
          .eq('id', body.assetId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'POST':
        const { payment_account_id, ...assetData } = body.assetData;
        const { data: asset, error: assetError } = await supabaseAdmin
          .from('fixed_assets')
          .insert({ ...assetData, company_id })
          .select('id')
          .single();
        if (assetError) throw assetError;

        const { data: entry, error: entryError } = await supabaseAdmin.from('journal_entries').insert({
          company_id: company_id,
          entry_date: assetData.purchase_date,
          description: `Acquisition of asset: ${assetData.description}`,
          vendor_id: assetData.vendor_id || null,
        }).select('id').single();
        if (entryError) throw entryError;

        const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert([
          { journal_entry_id: entry.id, account_id: assetData.asset_account_id, type: 'debit', amount: assetData.purchase_cost },
          { journal_entry_id: entry.id, account_id: payment_account_id, type: 'credit', amount: assetData.purchase_cost },
        ]);
        if (itemsError) throw itemsError;
        data = asset;
        break;

      case 'DISPOSE':
        ({ data, error } = await supabaseAdmin.rpc('dispose_asset', {
          p_asset_id: body.asset_id,
          p_disposal_date: body.disposal_date,
          p_proceeds: body.proceeds,
          p_cash_account_id: body.cash_account_id,
          p_gain_loss_account_id: body.gain_loss_account_id,
        }));
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