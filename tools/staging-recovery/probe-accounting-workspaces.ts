/**
 * Confirms which accounting workspaces are broken by the ambiguous
 * journal_entries -> financial_years embed, using REAL parameters so a 400
 * "missing param" can never be mistaken for the real 500.
 *
 *   npx tsx tools/staging-recovery/probe-accounting-workspaces.ts [companyName]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, invoke } from './edgeProbe';

const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery');
const TARGET = process.argv[2] || 'Spaceman';

async function main() {
  const { supabase: s, company } = await connect(TARGET);
  const company_id = company.id;

  // Real ids so every probe is parameter-complete.
  const coa = await s.functions.invoke('chart-of-accounts', { body: { method: 'GET', company_id } });
  const accounts = (coa.data as Array<{ id: string; name: string; balance: number }>) ?? [];
  const account = accounts.find((a) => Number(a.balance) !== 0) ?? accounts[0];
  const jes = await s.functions.invoke('journal-entries', { body: { method: 'GET', company_id } });
  const je = ((jes.data as Array<{ id: string }>) ?? [])[0];

  const year = new Date().getUTCFullYear();
  const period = { start_date: `${year - 1}-01-01`, end_date: `${year}-12-31` };

  const cases: Array<[string, string, Record<string, unknown>]> = [
    ['19 General Ledger', 'GET_ENTERPRISE_LEDGER', { ...period }],
    ['20 Account Activity', 'GET_ACCOUNT_ACTIVITY_WORKSPACE', { account_id: account?.id, ...period }],
    ['Posting Requests', 'GET_POSTING_REQUESTS', { ...period }],
    ['Traceability', 'GET_TRACEABILITY', { journal_entry_id: je?.id }],
    ['Financial Periods', 'GET_FINANCIAL_PERIODS', {}],
    ['Accounting Timeline', 'GET_ACCOUNTING_TIMELINE', { ...period }],
    // Controls — same function, no financial_years embed.
    ['Trial Balance (control)', 'GET_TRIAL_BALANCE', { ...period }],
    ['Account Inquiry (control)', 'GET_ACCOUNT_INQUIRY', { account_id: account?.id, ...period }],
  ];

  const results = [];
  for (const [label, method, extra] of cases) {
    const p = await invoke(s, 'accounting', { method, company_id, ...extra });
    const tech = (p.body as { technicalMessage?: string })?.technicalMessage ?? '';
    const ambiguous = /more than one relationship was found/.test(tech);
    results.push({ label, method, status: p.status, ok: p.ok, ambiguous, technicalMessage: tech });
    console.log(
      `${p.ok ? 'OK  ' : 'FAIL'} ${String(p.status).padEnd(4)} ${label.padEnd(26)} ` +
        `${ambiguous ? 'AMBIGUOUS EMBED' : tech.slice(0, 70)}`,
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'accounting-workspaces.json'),
    JSON.stringify({ company, account_id: account?.id, results }, null, 2),
  );
  const broken = results.filter((r) => r.ambiguous);
  console.log(`\n${broken.length} workspace(s) broken by the ambiguous embed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
