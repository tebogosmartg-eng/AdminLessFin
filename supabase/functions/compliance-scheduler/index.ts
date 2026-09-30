// @ts-nocheck
/**
 * Compliance & Governance — daily scheduler (ADR-0004).
 *
 * Invoked by pg_cron through pg_net with the service-role key (strictly: no
 * legacy unauthenticated invokes). Each invocation continues today's run from
 * its cursor, pages through companies with a completed compliance profile,
 * and stops well inside the Edge Function limits. Re-invoking is always safe:
 * evaluation is idempotent and each reminder is sent exactly once per
 * cycle, offset and recipient (compliance_dispatch_reminder).
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  createAdminClient,
  edgeFailure,
  edgeSuccess,
  platformLog,
  platformLogError,
  requireServiceRole,
  withEnterprisePlatform,
} from '../_shared/enterpriseEdgePlatform.ts';
import { reminderRecipients } from '../_shared/compliance/access.ts';
import { todayInJohannesburg } from '../_shared/compliance/dates.ts';
import { OVERDUE_OFFSET, reminderOffsetDue } from '../_shared/compliance/signals.ts';
import { COMPLIANCE_COUNTRY, runChange } from '../_shared/compliance/service.ts';
import { loadHolidays, loadRuleVersionsById, loadRules } from '../_shared/compliance/store.ts';

const PAGE_SIZE = 25;
const TIME_BUDGET_MS = 100_000;
const newId = () => crypto.randomUUID();

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function reminderText(title, cycle, offset) {
  if (offset === OVERDUE_OFFSET) {
    if (cycle.kind === 'term') return `${title} has passed its renewal date${cycle.expiry_date ? ` and expires on ${formatDate(cycle.expiry_date)}` : ''}.`;
    return `${title} is overdue. It was due on ${formatDate(cycle.due_date)}.`;
  }
  if (cycle.kind === 'term') {
    return `${title}: renew by ${formatDate(cycle.due_date)}${cycle.expiry_date ? ` (expires ${formatDate(cycle.expiry_date)})` : ''}.`;
  }
  return `${title} is due on ${formatDate(cycle.due_date)}.`;
}

async function processCompany(admin, companyId, today, cache) {
  // Re-evaluate: refresh facts, open new periods, update signals, and move
  // reminders off anyone who is no longer an owner or admin.
  const ws = await runChange(admin, {
    companyId,
    actorUserId: null,
    today,
    trigger: 'scheduler',
    newId,
    cache,
  });

  const titles = await loadRuleVersionsById(admin, ws.state.obligations.map((o) => o.rule_version_id));
  let sent = 0;
  for (const o of ws.state.obligations) {
    if (o.applicability !== 'applicable' || o.retired) continue;
    const { recipients } = reminderRecipients(o, ws.members);
    if (!recipients.length) continue;
    const title = titles.get(o.rule_version_id)?.title ?? o.rule_code;
    for (const c of ws.state.cycles.filter((x) => x.obligation_id === o.id)) {
      const offset = reminderOffsetDue(c, o.reminder_offsets ?? [], today);
      if (offset === null) continue;
      for (const userId of recipients) {
        const { data, error } = await admin.rpc('compliance_dispatch_reminder', {
          p_company_id: companyId,
          p_cycle_id: c.id,
          p_offset_days: offset,
          p_recipient_user_id: userId,
          p_content: reminderText(title, c, offset),
          p_link_to: `/compliance/obligations/${o.id}`,
        });
        if (error) throw new Error(`Could not send a reminder: ${error.message}`);
        if (data) sent += 1;
      }
    }
  }
  return sent;
}

serve(withEnterprisePlatform('compliance-scheduler', 'system', async (req, ctx) => {
  try {
    requireServiceRole(req, ctx);
    const admin = createAdminClient();
    const started = Date.now();
    const today = todayInJohannesburg();

    const upsert = await admin
      .from('compliance_scheduler_runs')
      .upsert({ run_date: today }, { onConflict: 'run_date', ignoreDuplicates: true });
    if (upsert.error) throw new Error(`Could not start the run: ${upsert.error.message}`);
    const runRes = await admin.from('compliance_scheduler_runs').select('*').eq('run_date', today).single();
    if (runRes.error) throw new Error(`Could not read the run: ${runRes.error.message}`);
    let run = runRes.data;
    if (run.finished_at) return edgeSuccess(ctx, { run_date: today, status: 'already_finished', processed: run.processed });

    const cache = {
      rules: await loadRules(admin, COMPLIANCE_COUNTRY, today),
      holidays: await loadHolidays(admin, COMPLIANCE_COUNTRY),
    };

    let remindersSent = 0;
    let finished = false;
    while (Date.now() - started < TIME_BUDGET_MS) {
      let q = admin
        .from('compliance_profiles')
        .select('company_id')
        .eq('status', 'completed')
        .order('company_id', { ascending: true })
        .limit(PAGE_SIZE);
      if (run.cursor_company_id) q = q.gt('company_id', run.cursor_company_id);
      const page = await q;
      if (page.error) throw new Error(`Could not list companies: ${page.error.message}`);
      if (!page.data.length) {
        finished = true;
        break;
      }
      for (const { company_id: companyId } of page.data) {
        if (Date.now() - started >= TIME_BUDGET_MS) break;
        let failure = null;
        try {
          remindersSent += await processCompany(admin, companyId, today, cache);
        } catch (e) {
          failure = e instanceof Error ? e.message : String(e);
          platformLogError(ctx, 'compliance.company_failed', e, { companyId });
        }
        // The cursor moves past a failing company so one bad record cannot
        // stall everyone; the failure is counted and logged for follow-up.
        const upd = await admin
          .from('compliance_scheduler_runs')
          .update({
            cursor_company_id: companyId,
            processed: run.processed + 1,
            failures: run.failures + (failure ? 1 : 0),
            last_error: failure ?? run.last_error,
            updated_at: new Date().toISOString(),
          })
          .eq('run_date', today)
          .select('*')
          .single();
        if (upd.error) throw new Error(`Could not record progress: ${upd.error.message}`);
        run = upd.data;
      }
    }

    if (finished) {
      const done = await admin
        .from('compliance_scheduler_runs')
        .update({ finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('run_date', today);
      if (done.error) throw new Error(`Could not finish the run: ${done.error.message}`);
    }
    platformLog(ctx, 'compliance.scheduler_pass', { processed: run.processed, failures: run.failures, remindersSent, finished });
    return edgeSuccess(ctx, {
      run_date: today,
      status: finished ? 'finished' : 'continuing',
      processed: run.processed,
      failures: run.failures,
      reminders_sent: remindersSent,
    });
  } catch (error) {
    return edgeFailure(ctx, error);
  }
}));
