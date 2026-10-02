// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createAdminClient, withEnterprisePlatform, edgeSuccess, edgeFailure } from '../_shared/enterpriseEdgePlatform.ts';

serve(withEnterprisePlatform('run-depreciation', 'system', async (_req, ctx) => {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    // Only assets that CAN depreciate join the batch. An asset without its
    // accounts or useful life is not a posting failure — it cannot ever post
    // until someone configures it — so it is counted and reported instead of
    // turning the daily run red for good (the atomic RPC still refuses such
    // an asset outright if called directly).
    const configured = admin.from('fixed_assets').select('id')
      .eq('status', 'active').eq('depreciation_method', 'straight-line')
      .not('useful_life_years', 'is', null).gt('useful_life_years', 0)
      .not('depreciation_expense_account_id', 'is', null)
      .not('accumulated_depreciation_account_id', 'is', null);
    const unconfiguredCount = admin.from('fixed_assets').select('id', { count: 'exact', head: true })
      .eq('status', 'active').eq('depreciation_method', 'straight-line')
      .or('useful_life_years.is.null,useful_life_years.lte.0,depreciation_expense_account_id.is.null,accumulated_depreciation_account_id.is.null');
    const [{ data: assets, error }, unconfigured] = await Promise.all([configured, unconfiguredCount]);
    if (error) throw error;
    if (unconfigured.error) throw unconfigured.error;
    let processed = 0;
    const failures = [];
    for (const asset of assets ?? []) {
      const result = await admin.rpc('depreciate_fixed_asset_atomic', {
        p_asset_id: asset.id, p_as_of: today,
      });
      if (result.error) {
        failures.push({ asset_id: asset.id, message: result.error.message });
      } else if (result.data?.posting_status === 'committed') {
        processed++;
      }
    }
    if (failures.length) {
      // Successful assets are committed; failed assets rolled back and are safe
      // to retry. Report failure so scheduler monitoring cannot mistake it for success.
      return edgeFailure(ctx, new Error('Some depreciation postings failed.'), {
        code: 'SCHEDULED_POSTING_FAILED', retryable: true,
        technicalMessage: JSON.stringify({ processed, failures }),
      });
    }
    return edgeSuccess(ctx, { message: `Successfully processed depreciation for ${processed} assets.` });
  } catch (error) {
    return edgeFailure(ctx, error);
  }
}));
