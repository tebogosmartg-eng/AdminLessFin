/**
 * Live check of payroll in the financial statements (ADR-0009). CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-afs-live.ts
 *
 * 1. Payroll accounts: a wrong account type is refused; "Set up payroll accounts" maps the
 *    standard PAYE / UIF / SDL accounts. A weekly run in December 2026 (the salaried "Time"
 *    test employees of run-payroll-time-live.ts) is previewed and finalised with no accounts
 *    chosen: the journal posted is the preview, PAYE, UIF and SDL each on their own account.
 *    The run is reversed and the company's payroll accounts are restored.
 * 2. The FY2026 statements are sealed: payroll is in the facts, and the notes are generated
 *    from it (employee costs, operating profit, statutory payables; directors where any).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AccountIndex } from '../../src/lib/financialStatements/disclosures/accountIndex';
import { generateDisclosures, payrollLedgerDifferences } from '../../src/lib/financialStatements/disclosures/definitions';

const COMPANY_NAME = 'CERT TX 1785230675937';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

function loadEnv() {
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* vars may already be set */ }
}

async function invoke<T>(sb: SupabaseClient, fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    let payload = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) { try { payload = JSON.stringify(await ctx.clone().json()); } catch { /* keep */ } }
    throw new Error(`${fn}.${String(body.method)}: ${payload}`);
  }
  return data as T;
}
async function refused(promise: Promise<unknown>): Promise<string> {
  try { await promise; return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

type Role = { role: string; account: { id: string; name: string } | null; advice: string | null };
type AccountsView = { roles: Role[]; accounts: Array<{ id: string; name: string; type: string }>; created?: string[]; mapped?: string[] };
type Line = { account: string; description: string; role: string | null; debit: number; credit: number };

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const payroll = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'payroll', { company_id: companyId, ...body });
  const fs = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'financial-statements', { company_id: companyId, ...body });

  // ── 1. Payroll accounts and posting ──
  const before = await payroll<AccountsView>({ method: 'GET_PAYROLL_ACCOUNTS' });
  const original = Object.fromEntries(before.roles.map((r) => [r.role, r.account?.id ?? null]));
  try {
    const liability = before.accounts.find((a) => a.type === 'Liability')!;
    const wrongType = await refused(payroll({ method: 'SAVE_PAYROLL_ACCOUNTS', accounts: { salary_expense: liability.id } }));
    check('A liability chosen for salaries is refused (wrong type)', /PAYROLL_ACCOUNT_TYPE/.test(wrongType), wrongType.slice(0, 140));
    const direct = await sb.from('payroll_account_mappings').insert({ company_id: companyId, account_role: 'paye_control', account_id: liability.id }).select('id');
    check('Payroll accounts cannot be written through the API', !!direct.error, direct.error?.message);

    const setUp = await payroll<AccountsView>({ method: 'SET_UP_PAYROLL_ACCOUNTS' });
    const mappedTo = (role: string) => setUp.roles.find((r) => r.role === role)?.account?.name ?? null;
    check('Set up maps PAYE, UIF and SDL payable and the employer UIF / SDL expense', ['paye_control', 'uif_control', 'sdl_control', 'uif_employer_expense', 'sdl_expense', 'salary_expense'].every((r) => !!mappedTo(r)),
      { paye: mappedTo('paye_control'), uif: mappedTo('uif_control'), sdl: mappedTo('sdl_control'), created: setUp.created, mapped: setUp.mapped });
    check('Accounts set up are classified as the statements need (no advice)', setUp.roles.filter((r) => r.account && original[r.role] == null).every((r) => !r.advice), setUp.roles.filter((r) => r.advice).map((r) => r.advice));
    const bank = setUp.accounts.find((a) => a.name === 'CERT Bank Account')!;
    await payroll({ method: 'SAVE_PAYROLL_ACCOUNTS', accounts: { bank: bank.id } });

    const run = await payroll<{ id: string }>({ method: 'CREATE_RUN', additional_run: true, runData: { pay_period_start: '2026-12-07', pay_period_end: '2026-12-13', pay_date: '2026-12-13', pay_frequency: 'weekly' } });
    let reversed = false;
    try {
      await payroll({ method: 'GENERATE_PAYSLIPS', runId: run.id });
      const preview = await payroll<{ lines: Line[]; granular: boolean; total_gross: number; total_net: number }>({ method: 'PREVIEW_RUN_POSTING', runId: run.id });
      const debit = preview.lines.reduce((s, l) => s + l.debit, 0);
      const credit = preview.lines.reduce((s, l) => s + l.credit, 0);
      const line = (role: string) => preview.lines.filter((l) => l.role === role);
      check('Preview balances and splits PAYE, UIF and SDL to their own accounts', near(debit, credit) && preview.granular
        && line('paye_control').every((l) => l.account === mappedTo('paye_control')) && line('paye_control').length === 1
        && line('sdl_control')[0]?.account === mappedTo('sdl_control') && line('sdl_expense')[0]?.account === mappedTo('sdl_expense')
        && line('uif_control').every((l) => l.account === mappedTo('uif_control')),
        preview.lines.map((l) => `${l.description}: ${l.account} ${l.debit || -l.credit}`));
      await payroll({ method: 'APPROVE_RUN', runId: run.id });
      await payroll({ method: 'FINALIZE_RUN', runId: run.id });
      const { data: posted } = await sb.from('journal_entry_items').select('account_id, type, amount, description, dimensions').contains('dimensions', { payroll_run_id: run.id });
      const byRole = (role: string) => (posted ?? []).filter((p) => (p.dimensions as { account_role?: string })?.account_role === role).reduce((s, p) => s + Number(p.amount), 0);
      check('Finalised with no accounts chosen: the journal posted is the preview', (posted ?? []).length === preview.lines.length
        && ['paye_control', 'uif_control', 'sdl_control', 'sdl_expense', 'uif_employer_expense', 'salary_expense', 'bank']
          .every((r) => near(byRole(r), line(r).reduce((s, l) => s + l.debit + l.credit, 0))),
        { posted: (posted ?? []).length, preview: preview.lines.length });
      await payroll({ method: 'REVERSE_RUN', runId: run.id, reason: 'Payroll AFS live check: reverse the test run' });
      reversed = true;
      const runs = await payroll<Array<{ id: string; output_metadata: { reversal_date?: string } | null }>>({ method: 'GET_RUNS' });
      const reversalDate = runs.find((r) => r.id === run.id)?.output_metadata?.reversal_date;
      check('The run is reversed on its own pay date (13 December 2026), not today', reversalDate === '2026-12-13', reversalDate);
    } finally {
      if (!reversed) await payroll({ method: 'DISCARD_RUN', runId: run.id }).catch(() => undefined);
    }
  } finally {
    await payroll({ method: 'SAVE_PAYROLL_ACCOUNTS', accounts: original }).catch((e) => console.error('restore payroll accounts failed', e));
  }

  // ── 2. Payroll in the sealed statements ──
  // CERT TX's older payroll accounts were never classified: wages sat outside
  // Employee Costs, so its statements showed no employee costs at all. Classify them
  // as readiness says to (idempotent), then seal.
  const coa = await invoke<Array<{ id: string; name: string; category: string | null; subcategory: string | null }>>(sb, 'chart-of-accounts', { method: 'GET', company_id: companyId });
  const classify = async (name: string, category: string, subcategory: string) => {
    const a = coa.find((x) => x.name === name);
    if (!a || (a.category === category && a.subcategory === subcategory)) return;
    await invoke(sb, 'chart-of-accounts', { method: 'PUT', company_id: companyId, accountId: a.id, accountData: { category, subcategory } });
  };
  await classify('CERT Salaries & Wages', 'Operating Expenses', 'Employee Costs');
  await classify('CERT Payroll Liabilities', 'Current Liabilities', 'Statutory Payables');
  await classify('CERT Bank Account', 'Current Assets', 'Cash and Cash Equivalents');

  const workspaces = await fs<Array<{ id: string; name: string }>>({ method: 'LIST_WORKSPACES' });
  const workspace = workspaces.find((w) => /FY2026/.test(w.name)) ?? workspaces[0];
  let draft = await fs<{ version?: { id: string } }>({ method: 'CREATE_SNAPSHOT_DRAFT', workspace_id: workspace.id }).catch(() => null);
  if (!draft?.version?.id) draft = await fs({ method: 'CREATE_SNAPSHOT_DRAFT', workspace_id: workspace.id, force_successor: true });
  const versionId = draft!.version!.id;
  await fs({ method: 'EXTRACT_FACT_SNAPSHOT', snapshot_version_id: versionId, workspace_id: workspace.id });
  await fs({ method: 'CERTIFY_SNAPSHOT_VERSION', snapshot_version_id: versionId });
  await fs({ method: 'GENERATE_STATEMENTS', workspace_id: workspace.id, snapshot_version_id: versionId });
  const facts = await fs<Record<string, any>>({ method: 'GET_FINANCIAL_FACTS', snapshot_version_id: versionId, workspace_id: workspace.id });
  const p = facts.payroll?.current;
  check('Payroll is sealed with the FY2026 facts (runs in effect in the year)', !!p && p.runs > 0 && p.payrollCost > 0 && near(p.grossPay + p.employerContributions, p.payrollCost),
    p && { runs: p.runs, payslips: p.payslips, gross: p.grossPay, employer: p.employerContributions, average: p.employees.average, directors: p.directors.length, period: `${p.from}..${p.to}` });

  const index = new AccountIndex(facts as never);
  const notes = generateDisclosures({ index, currentLabel: 'FY2026', priorLabel: 'FY2025', withComparatives: index.hasComparatives });
  const employee = notes.find((n) => n.code === 'DISC.EMPLOYEE');
  const table = employee?.tables.find((t) => t.code === 'EMPLOYEE.ANALYSIS');
  const total = table?.rows.find((r) => r.key === 'Total employee costs')?.cells[1]?.value as number | undefined;
  const ledger = index.total({ subcategory: 'Employee Costs' }, 'period').amount;
  const differences = payrollLedgerDifferences(facts as never);
  check('The employee costs note totals the ledger employee costs (the statement line)', total != null && near(total, ledger), { total, ledger });
  check('Headcount comes from payroll', table?.rows.find((r) => r.key === 'Average number of employees during the year')?.cells[1]?.value === p?.employees.average);
  if (differences.some((d) => d.year === 'current')) {
    // CERT TX's older test reversals were dated the day they were made, in another
    // year from their runs (fixed for new reversals): the ledger holds less than
    // payroll, so the note keeps the ledger accounts and readiness says why.
    check('Payroll the ledger does not hold is reported to readiness; the note keeps the ledger accounts',
      !table?.rows.some((r) => r.key === 'emp:Salaries and wages') && !!table?.rows.some((r) => String(r.key).startsWith('emp:')), differences);
  } else {
    const nature = (key: string) => table?.rows.find((r) => r.key === key)?.cells[1]?.value as number | undefined;
    check('Employee costs are analysed by nature from payroll', near(Number(nature('emp:Skills development levy')), p.employer.sdl), table?.rows.map((r) => [r.key, r.cells[1]?.value]));
  }
  const statutory = notes.find((n) => n.code === 'DISC.STATUTORYPAYABLES');
  check('Statutory payables note present', !!statutory, statutory?.tables[0]?.rows.map((r) => [r.key, r.cells[1]?.value]));
  check('Operating profit note: employee costs stated', !!notes.find((n) => n.code === 'DISC.OPERATINGPROFIT')?.tables[0]?.rows.some((r) => r.key === 'op:employee'));
  if (p?.directors.length) {
    const d = notes.find((n) => n.code === 'DISC.DIRECTORS')?.tables[0];
    check("Directors' emoluments: one row per director, total = payroll", !!d && near(Number(d.rows.find((r) => r.key === 'DIRECTORS.CURRENT:total')?.cells.at(-1)?.value), p.directors.reduce((s: number, x: { total: number }) => s + x.total, 0)));
  } else {
    check("No directors paid through payroll: no directors' emoluments note", !notes.some((n) => n.code === 'DISC.DIRECTORS'));
  }
  console.log('\nnotes generated:', notes.map((n) => n.code).join(', '));

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
