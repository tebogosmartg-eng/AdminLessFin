/**
 * Proves the second face of the ambiguous-embed defect: handlers that
 * destructure `{ data }` without checking `error` return HTTP 200 with
 * silently EMPTY results. A green UI showing "no activity" is then
 * indistinguishable from a broken query.
 *
 * Cross-checks each workspace against ground truth taken from
 * journal_entry_items, which uses no ambiguous embed.
 *
 *   npx tsx tools/staging-recovery/probe-silent-empty.ts [companyName]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, invoke, tech } from './edgeProbe';

const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery');
const TARGET = process.argv[2] || 'Spaceman';

async function main() {
  const { supabase: s, company } = await connect(TARGET);
  const company_id = company.id;
  const year = new Date().getUTCFullYear();
  const period = { start_date: `${year - 2}-01-01`, end_date: `${year}-12-31` };

  // ── Ground truth, straight from the ledger (no ambiguous embed) ──────────
  const jes = await s
    .from('journal_entries')
    .select('id, entry_date')
    .eq('company_id', company_id)
    .gte('entry_date', period.start_date)
    .lte('entry_date', period.end_date);
  const jeIds = (jes.data ?? []).map((j) => j.id);

  const items = await s
    .from('journal_entry_items')
    .select('account_id, type, amount, journal_entry_id')
    .in('journal_entry_id', jeIds.slice(0, 500));
  const byAccount = new Map<string, number>();
  for (const it of items.data ?? []) {
    byAccount.set(it.account_id, (byAccount.get(it.account_id) ?? 0) + 1);
  }
  const [busiestAccount, lineCount] = [...byAccount.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];

  const coa = await s.functions.invoke('chart-of-accounts', { body: { method: 'GET', company_id } });
  const accounts = (coa.data as Array<{ id: string; name: string; account_number: number }>) ?? [];
  const accountName = accounts.find((a) => a.id === busiestAccount)?.name ?? '(unknown)';

  console.log(`Company            : ${company.name}`);
  console.log(`Journal entries    : ${jeIds.length}`);
  console.log(`Journal lines      : ${items.data?.length ?? 0}`);
  console.log(`Busiest account    : ${accountName} — ${lineCount} lines\n`);

  const findings: Array<Record<string, unknown>> = [];

  // ── 20. Account Activity workspace ──────────────────────────────────────
  const activity = await invoke(s, 'accounting', {
    method: 'GET_ACCOUNT_ACTIVITY_WORKSPACE',
    company_id,
    account_id: busiestAccount,
    ...period,
  });
  const activityBody = (activity.body as { activities?: unknown[]; total?: number; header?: Record<string, unknown> }) ?? {};
  const activityCount = activityBody.activities?.length ?? 0;
  findings.push({
    finding: '20 Account Activity workspace',
    status: activity.status,
    expected_lines: lineCount,
    returned_rows: activityCount,
    reported_total: activityBody.total ?? null,
    header_balance: activityBody.header?.current_balance ?? null,
    // A populated header beside an empty list is the signature of the silent
    // failure: the balance RPC succeeded while the activity query was discarded.
    silently_empty: activity.ok && lineCount > 0 && activityCount === 0,
    technicalMessage: tech(activity),
  });

  // ── 19. General Ledger workspace ────────────────────────────────────────
  const gl = await invoke(s, 'accounting', {
    method: 'GET_ENTERPRISE_LEDGER',
    company_id,
    ...period,
  });
  findings.push({
    finding: '19 General Ledger workspace',
    status: gl.status,
    expected_journals: jeIds.length,
    returned_rows: gl.ok ? ((gl.body as { rows?: unknown[] })?.rows?.length ?? 0) : null,
    hard_error: !gl.ok,
    technicalMessage: tech(gl),
  });

  // ── 13. Bank transactions ───────────────────────────────────────────────
  const bankAccounts = await invoke(s, 'banking', { method: 'GET_BANK_ACCOUNTS', company_id });
  const bankList = (bankAccounts.body as Array<{ id: string; account_name?: string }>) ?? [];
  const txAll = await invoke(s, 'banking', { method: 'GET_TRANSACTIONS', company_id });
  const txScoped = bankList[0]
    ? await invoke(s, 'banking', {
        method: 'GET_TRANSACTIONS',
        company_id,
        bank_account_id: bankList[0].id,
      })
    : null;
  findings.push({
    finding: '13 Bank transactions',
    bank_accounts: bankList.length,
    status_all: txAll.status,
    rows_all: Array.isArray(txAll.body) ? txAll.body.length : null,
    status_scoped: txScoped?.status ?? null,
    rows_scoped: Array.isArray(txScoped?.body) ? (txScoped!.body as unknown[]).length : null,
  });

  // ── 16. Audit trail ─────────────────────────────────────────────────────
  const audit = await invoke(s, 'audit-logs', { method: 'GET', company_id });
  const auditRows = Array.isArray(audit.body) ? (audit.body as Array<Record<string, unknown>>) : [];
  findings.push({
    finding: '16 Audit trail',
    status: audit.status,
    rows: auditRows.length,
    distinct_actions: [...new Set(auditRows.map((r) => String(r.action ?? r.event ?? '?')))].slice(0, 15),
    newest: auditRows[0]?.created_at ?? null,
    oldest: auditRows[auditRows.length - 1]?.created_at ?? null,
  });

  for (const f of findings) console.log(JSON.stringify(f, null, 2));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'silent-empty.json'),
    JSON.stringify({ company, ground_truth: { journal_entries: jeIds.length, lines: items.data?.length }, findings }, null, 2),
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
