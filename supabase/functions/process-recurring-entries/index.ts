// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createAdminClient, withEnterprisePlatform, edgeSuccess, edgeFailure } from '../_shared/enterpriseEdgePlatform.ts';

serve(withEnterprisePlatform('process-recurring-entries', 'system', async (_req, ctx) => {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data: entries, error } = await admin.from('recurring_journal_entries')
      .select('id, next_run_date').lte('next_run_date', today);
    if (error) throw error;
    let processed = 0;
    const failures = [];
    for (const entry of entries ?? []) {
      const result = await admin.rpc('process_recurring_journal_atomic', {
        p_entry_id: entry.id, p_scheduled_for: entry.next_run_date,
      });
      if (result.error) {
        failures.push({ entry_id: entry.id, message: result.error.message });
      } else if (['committed', 'duplicate'].includes(result.data?.posting_status)) {
        processed++;
      }
    }
    if (failures.length) {
      return edgeFailure(ctx, new Error('Some recurring journal postings failed.'), {
        code: 'SCHEDULED_POSTING_FAILED', retryable: true,
        technicalMessage: JSON.stringify({ processed, failures }),
      });
    }
    return edgeSuccess(ctx, {
      message: entries?.length ? `Successfully processed ${processed} recurring entries.` : 'No recurring entries to process.',
    });
  } catch (error) {
    return edgeFailure(ctx, error);
  }
}));
