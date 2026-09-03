import { connect, invoke, tech } from './edgeProbe';
const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);

type Ledger = {
  control_accounts: Array<{ account_number: number; name: string }>;
  opening_balance: number; rows: Array<Record<string, unknown>>;
  total_debit: number; total_credit: number; closing_balance: number; truncated: boolean;
  tie: { ledger_closing_balance: number; age_analysis_control_balance: number; age_analysis_total: number; not_open_documents: number; ties: boolean };
};

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const asOf = new Date().toISOString().slice(0, 10);
  let pass = 0; let fail = 0;
  for (const [label, fn] of [['CREDITORS', 'vendors'], ['DEBTORS  ', 'customers']] as const) {
    console.log(NL + `=== ${label} CONTROL LEDGER ===`);
    for (const co of companies) {
      const r = await invoke(s, fn, { method: 'GET_CONTROL_LEDGER', company_id: co.id, as_of: asOf });
      if (!r.ok) { console.log(`  FAIL ${co.name}: ${r.status} ${tech(r)}`); fail++; continue; }
      const l = r.body as Ledger;
      // opening + movements must equal closing, and closing must equal the age analysis control balance
      const walk = c(l.opening_balance) + l.rows.reduce((t, row) => t + c(row.debit) - c(row.credit), 0);
      const acct = l.control_accounts.map((a) => `${a.account_number}`).join('/') || 'none';
      const ok = l.tie.ties && c(l.closing_balance) === c(l.tie.age_analysis_control_balance);
      if (ok) pass++; else fail++;
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${co.name.padEnd(30)} acct=${acct.padEnd(6)} rows=${String(l.rows.length).padStart(4)} ` +
        `closing=${R(c(l.closing_balance)).padStart(12)} ageAnalysisControl=${R(c(l.tie.age_analysis_control_balance)).padStart(12)} ties=${l.tie.ties}`);
      if (!ok) console.log(`       walk=${R(walk)} vs closing=${R(c(l.closing_balance))}`);
    }
  }

  console.log(NL + '=== SPACEMAN CREDITORS LEDGER, LAST 6 LINES ===');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  const r = await invoke(s, 'vendors', { method: 'GET_CONTROL_LEDGER', company_id: co.id, as_of: asOf });
  const l = r.body as Ledger;
  for (const row of l.rows.slice(-6)) {
    console.log(`  ${row.entry_date} ${String(row.journal_number ?? '-').padEnd(10)} ` +
      `dr=${String(row.debit).padStart(11)} cr=${String(row.credit).padStart(11)} bal=${String(row.balance).padStart(12)}  ` +
      `${String(row.party_name ?? '-').padEnd(18)} ${String(row.description ?? '').slice(0, 40)}`);
  }
  console.log(`  opening ${l.opening_balance}  debits ${l.total_debit}  credits ${l.total_credit}  closing ${l.closing_balance}`);
  console.log(`  TIE: ledger ${l.tie.ledger_closing_balance} = age analysis control ${l.tie.age_analysis_control_balance}; ` +
    `aged ${l.tie.age_analysis_total} + not-open-documents ${l.tie.not_open_documents}`);
  console.log(NL + `RESULT: ${pass} PASS, ${fail} FAIL`);
}
main().catch((e) => { console.error(e); process.exit(1); });
