/**
 * Findings 14/15 — bank reconciliation, and the tenant isolation of the
 * reconciliation read model.
 *
 * Phase 6 of the brief: opening balance + statement transactions - matched
 * transactions = difference, and reconciliation must not falsely report a match.
 *
 *   npx tsx tools/staging-recovery/probe-reconciliation.ts [companyName]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, invoke, tech } from './edgeProbe';

const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery');
const TARGET = process.argv[2] || 'Spaceman';

async function main() {
  const { supabase: s, company, companies } = await connect(TARGET);
  const company_id = company.id;
  const results: Array<Record<string, unknown>> = [];
  const say = (o: Record<string, unknown>) => { results.push(o); console.log(JSON.stringify(o)); };

  // The reconciliation screen only offers cash-equivalent accounts.
  const bankAccts = await invoke(s, 'accounting', { method: 'GET_BANK_ACCOUNTS', company_id });
  const list = (bankAccts.body as Array<Record<string, unknown>>) ?? [];
  const cash = list.filter(
    (a) => a.account_role === 'bank' || a.account_role === 'cash' || a.subcategory === 'Cash and Cash Equivalents',
  );
  say({ step: 'bank accounts offered', total: list.length, cash_equivalent: cash.length, names: cash.map((a) => a.name) });

  const account = cash[0] ?? list[0];
  if (!account) { console.log('no account to reconcile'); return; }
  const endDate = `${new Date().getUTCFullYear()}-12-31`;

  // ── the two queries the reconciliation screen runs ──────────────────────
  const txs = await invoke(s, 'accounting', {
    method: 'GET_RECONCILIATION_TRANSACTIONS', company_id,
    account_id: account.id, statement_end_date: endDate,
  });
  const rows = Array.isArray(txs.body) ? (txs.body as Array<Record<string, unknown>>) : [];
  const nullJournals = rows.filter((r) => !r.journal_entries).length;
  const afterCutoff = rows.filter((r) => {
    const d = (r.journal_entries as { entry_date?: string })?.entry_date;
    return d ? d > endDate : false;
  }).length;
  say({
    step: '15 reconciliation transactions',
    status: txs.status,
    rows: rows.length,
    // Both must be zero. A null journal crashed the page; a row past the
    // cutoff would have been reconciled against the wrong period.
    rows_with_null_journal: nullJournals,
    rows_after_statement_cutoff: afterCutoff,
    msg: tech(txs),
  });

  const book = await invoke(s, 'accounting', {
    method: 'GET_BOOK_BALANCE', company_id,
    account_id: account.id, statement_end_date: endDate,
  });
  say({
    step: '15 book balance',
    status: book.status,
    balance: (book.body as { balance?: number })?.balance ?? null,
    msg: tech(book),
  });

  // ── missing-parameter handling (was a raw 500 about the schema cache) ───
  const bad = await invoke(s, 'accounting', { method: 'GET_BOOK_BALANCE', company_id, account_id: account.id });
  say({ step: '15 missing statement_end_date', status: bad.status, msg: tech(bad) });

  // ── tenant isolation: another company's account must be refused ─────────
  const other = companies.find((c) => c.id !== company_id);
  let foreignAccountId: string | null = null;
  if (other) {
    const coa = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id: other.id });
    foreignAccountId = ((coa.body as Array<{ id: string }>) ?? [])[0]?.id ?? null;
  }
  if (foreignAccountId) {
    const cross = await invoke(s, 'accounting', {
      method: 'GET_RECONCILIATION_TRANSACTIONS', company_id,
      account_id: foreignAccountId, statement_end_date: endDate,
    });
    say({
      step: '15 tenant isolation (foreign account_id)',
      other_company: other?.name,
      status: cross.status,
      refused: !cross.ok,
      rows_leaked: Array.isArray(cross.body) ? (cross.body as unknown[]).length : 0,
      msg: tech(cross),
    });
  }

  // ── Phase 6 arithmetic ─────────────────────────────────────────────────
  const bookBalance = Number((book.body as { balance?: number })?.balance ?? 0);
  const unreconciled = rows.reduce(
    (sum, r) => sum + (String(r.type) === 'debit' ? Number(r.amount) : -Number(r.amount)),
    0,
  );
  say({
    step: '15 reconciliation arithmetic',
    book_balance: bookBalance,
    unreconciled_net: Number(unreconciled.toFixed(2)),
    note: 'statement balance - (book balance - uncleared) = difference; screen computes this from these inputs',
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'reconciliation.json'), JSON.stringify({ company, account, results }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
