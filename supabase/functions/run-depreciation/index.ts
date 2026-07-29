// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { format, isBefore, endOfMonth } from "https://esm.sh/date-fns@3.6.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('run-depreciation', 'system', async (_req, _ctx) => {

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const today = new Date();

    // 1. Get all active assets with depreciation details that are due for depreciation
    const { data: assets, error: fetchError } = await supabaseAdmin
      .from('fixed_assets')
      .select('*')
      .eq('status', 'active')
      .not('depreciation_method', 'is', null)
      .not('useful_life_years', 'is', null)
      .not('depreciation_expense_account_id', 'is', null)
      .not('accumulated_depreciation_account_id', 'is', null);

    if (fetchError) throw fetchError;

    let processedCount = 0;

    for (const asset of assets) {
      const lastDepreciationDate = asset.last_depreciation_date ? new Date(asset.last_depreciation_date) : new Date(asset.purchase_date);
      const nextDepreciationDate = endOfMonth(lastDepreciationDate);

      // Check if it's time to run depreciation for this asset
      if (!isBefore(nextDepreciationDate, today)) {
        continue;
      }

      const depreciableCost = asset.purchase_cost - asset.residual_value;
      if (asset.accumulated_depreciation >= depreciableCost) {
        // Asset is fully depreciated, update status and skip
        await supabaseAdmin.from('fixed_assets').update({ status: 'fully-depreciated' }).eq('id', asset.id);
        continue;
      }

      let monthlyDepreciation = 0;
      if (asset.depreciation_method === 'straight-line') {
        monthlyDepreciation = depreciableCost / (asset.useful_life_years * 12);
      } else {
        // Other methods can be added here
        continue;
      }

      // Ensure we don't depreciate more than the remaining value
      const remainingValue = depreciableCost - asset.accumulated_depreciation;
      const depreciationToPost = Math.min(monthlyDepreciation, remainingValue);

      if (depreciationToPost <= 0) {
        continue;
      }

      // 2. Create Journal Entry
      const { data: entry, error: entryError } = await supabaseAdmin.from('journal_entries').insert({
        company_id: asset.company_id,
        entry_date: format(today, 'yyyy-MM-dd'),
        description: `Monthly depreciation for ${asset.description} (${asset.asset_code})`,
      }).select('id').single();

      if (entryError) {
        console.error(`Failed to create JE for asset ${asset.id}:`, entryError);
        continue;
      }

      const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert([
        { journal_entry_id: entry.id, account_id: asset.depreciation_expense_account_id, type: 'debit', amount: depreciationToPost },
        { journal_entry_id: entry.id, account_id: asset.accumulated_depreciation_account_id, type: 'credit', amount: depreciationToPost },
      ]);

      if (itemsError) {
        console.error(`Failed to create JE items for asset ${asset.id}:`, itemsError);
        continue;
      }

      // 3. Update asset record (calculation unchanged; V16.2 adds YTD tracker only)
      const newAccumulatedDepreciation = asset.accumulated_depreciation + depreciationToPost;
      const year = today.getFullYear();
      const priorYtd = asset.depreciation_ytd_year === year ? Number(asset.depreciation_ytd || 0) : 0;
      const updatePayload = {
        accumulated_depreciation: newAccumulatedDepreciation,
        last_depreciation_date: format(today, 'yyyy-MM-dd'),
        status: 'active',
        depreciation_ytd: priorYtd + depreciationToPost,
        depreciation_ytd_year: year,
      };

      if (newAccumulatedDepreciation >= depreciableCost) {
        updatePayload.status = 'fully-depreciated';
      }

      const { error: updateError } = await supabaseAdmin.from('fixed_assets').update(updatePayload).eq('id', asset.id);
      if (updateError) {
        console.error(`Failed to update asset ${asset.id}:`, updateError);
        continue;
      }

      processedCount++;
    }

    return new Response(JSON.stringify({ message: `Successfully processed depreciation for ${processedCount} assets.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
