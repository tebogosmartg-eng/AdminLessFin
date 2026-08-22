/**
 * Findings 4, 12-18, 21 — reproduce against the live backend with correct
 * parameters, cross-checked against ground truth from the database.
 *
 *   npx tsx tools/staging-recovery/probe-remaining.ts [companyName]
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
  const out: Array<Record<string, unknown>> = [];
  const say = (o: Record<string, unknown>) => { out.push(o); console.log(JSON.stringify(o)); };

  console.log(`=== ${company.name} (${company_id}) ===\n`);

  // ── 4. Products & services ───────────────────────────────────────────────
  const prods = await invoke(s, 'products', { method: 'GET', company_id });
  const plist = (prods.body as Array<Record<string, unknown>>) ?? [];
  const stamp = Date.now();
  const mk = async (label: string, payload: Record<string, unknown>) => {
    const r = await invoke(s, 'products', { method: 'POST', company_id, productData: payload });
    return { label, status: r.status, ok: r.ok, msg: tech(r) };
  };
  const svc = await mk('service', { name: `SR Service ${stamp}`, type: 'service', price: 100, description: 'probe' });
  const inv = await mk('inventory', { name: `SR Inventory ${stamp}`, type: 'inventory', price: 100, cost: 60, description: 'probe' });
  say({ finding: '4 products', existing: plist.length, create_service: svc, create_inventory: inv });

  // ── 12/13/14. Banking ────────────────────────────────────────────────────
  const ba = await invoke(s, 'banking', { method: 'GET_BANK_ACCOUNTS', company_id });
  const bankAccounts = (ba.body as Array<Record<string, unknown>>) ?? [];
  const dbBank = await s.from('bank_accounts').select('id, name, chart_of_account_id, is_active').eq('company_id', company_id);
  const dbTx = await s.from('bank_transactions').select('id, bank_account_id, transaction_date, amount').eq('company_id', company_id).limit(500);
  const txEdge = await invoke(s, 'banking', { method: 'GET_TRANSACTIONS', company_id });
  const txPerAccount: Record<string, number> = {};
  for (const b of bankAccounts) {
    // The edge contract is camelCase `bankAccountId`; snake_case is ignored.
    const r = await invoke(s, 'banking', { method: 'GET_TRANSACTIONS', company_id, bankAccountId: b.id });
    txPerAccount[String(b.name ?? b.id)] = Array.isArray(r.body) ? r.body.length : -1;
  }
  say({
    finding: '12/13 banking',
    edge_bank_accounts: bankAccounts.length,
    db_bank_accounts: dbBank.data?.length ?? `ERR ${dbBank.error?.message}`,
    db_bank_transactions: dbTx.data?.length ?? `ERR ${dbTx.error?.message}`,
    edge_transactions_unscoped: Array.isArray(txEdge.body) ? txEdge.body.length : null,
    edge_transactions_per_account: txPerAccount,
    unlinked_to_coa: dbBank.data?.filter((b) => !b.chart_of_account_id).length ?? null,
  });

  const lines = await invoke(s, 'banking', { method: 'GET_STATEMENT_LINES', company_id });
  const dbLines = await s.from('bank_statement_lines').select('id, bank_account_id').eq('company_id', company_id).limit(500);
  say({
    finding: '14 statement lines',
    edge_status: lines.status,
    edge_rows: Array.isArray(lines.body) ? lines.body.length : null,
    db_rows: dbLines.data?.length ?? `ERR ${dbLines.error?.message}`,
  });

  // ── 15. Reconciliation ───────────────────────────────────────────────────
  const firstBank = bankAccounts[0];
  const recon = firstBank
    ? await invoke(s, 'accounting', {
        method: 'GET_RECONCILIATION_TRANSACTIONS', company_id,
        bank_account_id: firstBank.id, ...period,
      })
    : null;
  const book = firstBank
    ? await invoke(s, 'accounting', { method: 'GET_BOOK_BALANCE', company_id, bank_account_id: firstBank.id, as_of_date: period.end_date })
    : null;
  say({
    finding: '15 reconciliation',
    bank_account: firstBank?.name ?? null,
    recon_status: recon?.status ?? null,
    recon_rows: Array.isArray((recon?.body as { transactions?: unknown[] })?.transactions)
      ? ((recon!.body as { transactions: unknown[] }).transactions.length)
      : Array.isArray(recon?.body) ? (recon!.body as unknown[]).length : null,
    recon_msg: recon ? tech(recon) : null,
    book_balance_status: book?.status ?? null,
    book_balance: book?.ok ? book.body : tech(book!),
  });

  // ── 16. Audit trail ──────────────────────────────────────────────────────
  const audit = await invoke(s, 'audit-logs', { method: 'GET', company_id });
  const arows = Array.isArray(audit.body) ? (audit.body as Array<Record<string, unknown>>) : [];
  const dbAudit = await s.from('audit_logs').select('id, operation, table_name, created_at, changed_by').eq('company_id', company_id).order('created_at', { ascending: false }).limit(500);
  say({
    finding: '16 audit trail',
    edge_status: audit.status,
    edge_rows: arows.length,
    edge_row_keys: Object.keys(arows[0] ?? {}),
    db_rows: dbAudit.data?.length ?? `ERR ${dbAudit.error?.message}`,
    db_actions: [...new Set((dbAudit.data ?? []).map((r) => `${r.table_name}:${r.operation}`))].slice(0, 20),
    newest: dbAudit.data?.[0]?.created_at ?? null,
  });

  // ── 17/18. Supplier statement + ageing ───────────────────────────────────
  const vendors = await invoke(s, 'vendors', { method: 'GET', company_id });
  const vendor = (vendors.body as Array<Record<string, unknown>>)?.[0];
  const details = vendor ? await invoke(s, 'vendors', { method: 'GET_DETAILS', company_id, vendorId: vendor.id }) : null;
  const ap = await invoke(s, 'payments', { method: 'GET_AP_BALANCES', company_id });
  const apRows = (ap.body as Array<Record<string, unknown>>) ?? [];
  say({
    finding: '17/18 supplier statement',
    vendor: vendor?.name ?? null,
    details_status: details?.status ?? null,
    details_keys: details?.ok ? Object.keys(details.body as object) : tech(details!),
    ap_rows: apRows.length,
    ap_row_keys: Object.keys(apRows[0] ?? {}),
    has_ageing_buckets: Object.keys(apRows[0] ?? {}).some((k) => /30|60|90|120|current|age/i.test(k)),
  });

  // ── 21. Live financial reporting ─────────────────────────────────────────
  const tb = await invoke(s, 'accounting', { method: 'GET_TRIAL_BALANCE', company_id, ...period });
  const bs = await invoke(s, 'reports', { method: 'GET_COMPARATIVE_BS', company_id, ...period });
  const pl = await invoke(s, 'reports', { method: 'GET_COMPARATIVE_PL', company_id, ...period });
  say({
    finding: '21 live reporting',
    trial_balance: { status: tb.status, balanced: (tb.body as { balanced?: boolean })?.balanced },
    balance_sheet: { status: bs.status, keys: bs.ok ? Object.keys(bs.body as object) : tech(bs) },
    income_statement: { status: pl.status, keys: pl.ok ? Object.keys(pl.body as object) : tech(pl) },
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'remaining.json'), JSON.stringify({ company, out }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
