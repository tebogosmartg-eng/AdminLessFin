import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  const ar = (await s.from('chart_of_accounts').select('id, account_number, name')
    .eq('company_id', co.id).eq('account_role', 'trade_receivable').maybeSingle()).data!;
  console.log(`AR control: ${ar.account_number} ${ar.name}`);

  type Row = { amount: number; type: string; journal_entries: { description: string | null; invoice_id: string | null; journal_number: string | null } };
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await s.from('journal_entry_items')
      .select('amount, type, journal_entries!inner ( company_id, description, invoice_id, journal_number )')
      .eq('account_id', ar.id).eq('journal_entries.company_id', co.id).range(from, from + 999);
    const d = (page.data ?? []) as unknown as Row[];
    rows.push(...d);
    if (d.length < 1000) break;
  }

  const groups: Record<string, { n: number; net: number }> = {};
  let total = 0;
  for (const r of rows) {
    const signed = (r.type === 'debit' ? 1 : -1) * c(r.amount);
    total += signed;
    const d = r.journal_entries?.description ?? '';
    const key = r.journal_entries?.invoice_id ? 'Invoice (trade)'
      : /depreciation/i.test(d) ? 'Depreciation'
      : /disposal/i.test(d) ? 'Asset disposal'
      : /inventory|GRN/i.test(d) ? 'Inventory / GRN'
      : /payment for invoice/i.test(d) ? 'Customer payment (trade)'
      : /loan|reclassification/i.test(d) ? 'Loan / reclassification'
      : /opening/i.test(d) ? 'Opening balance'
      : 'Other';
    groups[key] ??= { n: 0, net: 0 };
    groups[key].n++;
    groups[key].net += signed;
  }
  console.log(NL + '=== WHAT MAKES UP THE DEBTORS CONTROL ACCOUNT ===');
  for (const [k, v] of Object.entries(groups).sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))) {
    console.log(`  ${k.padEnd(28)} lines=${String(v.n).padStart(4)}  net ${R(v.net).padStart(14)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(28)} lines=${String(rows.length).padStart(4)}  net ${R(total).padStart(14)}`);

  console.log(NL + '=== LARGEST INDIVIDUAL NON-INVOICE MOVEMENTS ===');
  const big = rows.filter((r) => !r.journal_entries?.invoice_id)
    .map((r) => ({ v: (r.type === 'debit' ? 1 : -1) * c(r.amount), d: r.journal_entries?.description, j: r.journal_entries?.journal_number }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 8);
  for (const b of big) console.log(`  ${R(b.v).padStart(14)}  ${b.j ?? '-'}  ${String(b.d).slice(0, 80)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
