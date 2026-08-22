/**
 * Findings 7, 8, 9 — differential test of the EXACT payload shapes the Bill
 * form produces, to find which one the backend rejects.
 *
 * Direct entry leaves Bill number blank (the field is optional in the form), so
 * it posts bill_number: null. A PO conversion always supplies one. That is the
 * only structural difference between "direct bill" and "PO -> bill", and it is
 * the stated shape of the finding: bills work only from a PO.
 *
 *   npx tsx tools/staging-recovery/probe-bill-payload-matrix.ts [companyName]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, invoke, tech } from './edgeProbe';

const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery');
const TARGET = process.argv[2] || 'Spaceman';

async function main() {
  const { supabase: s, company } = await connect(TARGET);
  const company_id = company.id;

  const vendors = await invoke(s, 'vendors', { method: 'GET', company_id });
  const vendor = (vendors.body as Array<{ id: string }>)?.[0];
  const coa = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id });
  const accounts = (coa.body as Array<Record<string, unknown>>) ?? [];
  const ap = accounts.find((a) => a.account_role === 'trade_payable') ?? accounts.find((a) => a.type === 'Liability');
  const expense = accounts.find((a) => a.type === 'Expense' && a.account_role !== 'cogs' && a.is_active !== false);

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const stamp = Date.now();

  const base = (overrides: Record<string, unknown>) => ({
    bill_number: `SR-M-${stamp}-${Math.random().toString(36).slice(2, 7)}`,
    vendor_id: vendor?.id,
    bill_date: today,
    due_date: due,
    accounts_payable_id: ap?.id,
    tax_receivable_account_id: null,
    description: 'Staging recovery — payload matrix',
    attachment_url: null,
    p_items: [
      {
        product_id: null,
        quantity: 1,
        unit_cost: 101.01,
        expense_account_id: expense?.id,
        tax_rate_id: null,
        project_id: null,
      },
    ],
    ...overrides,
  });

  const cases: Array<[string, Record<string, unknown>]> = [
    ['PO-shaped: bill_number supplied', base({})],
    ['DIRECT: bill_number null (form default)', base({ bill_number: null })],
    ['DIRECT: bill_number empty string', base({ bill_number: '' })],
    ['description null', base({ description: null })],
    ['tax_receivable_account_id null', base({ tax_receivable_account_id: null })],
  ];

  const results: Array<Record<string, unknown>> = [];
  const createdIds: string[] = [];

  for (const [label, billData] of cases) {
    const r = await invoke(s, 'bills', { method: 'POST', company_id, billData });
    results.push({ label, status: r.status, ok: r.ok, technicalMessage: tech(r), error: r.error });
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${String(r.status ?? '---').padEnd(4)} ${label.padEnd(40)} ${(tech(r) || '').slice(0, 120)}`);
    if (r.ok) {
      const list = await invoke(s, 'bills', { method: 'GET', company_id });
      const match = (list.body as Array<Record<string, unknown>>)?.find(
        (b) => b.bill_number === billData.bill_number && b.description === billData.description,
      );
      if (match?.id) createdIds.push(String(match.id));
    }
  }

  // Void everything created so the tenant is left accounting-consistent.
  console.log('\nCleaning up:');
  for (const id of createdIds) {
    const v = await invoke(s, 'bills', { method: 'VOID', company_id, billId: id });
    console.log(`  void ${id.slice(0, 8)} → ${v.ok ? 'ok' : tech(v)}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'bill-payload-matrix.json'),
    JSON.stringify({ company, results, createdIds }, null, 2),
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
