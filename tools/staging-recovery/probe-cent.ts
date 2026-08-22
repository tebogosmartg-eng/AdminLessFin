import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const cid = company.id;
  const end = '2026-12-31';
  const bal = await s.rpc('get_balances_as_of_date', { p_end_date: end, p_company_id: cid });
  const rows = (bal.data as Array<{ id: string; name: string; type: string; balance: number }>) ?? [];
  console.log('account types present:', [...new Set(rows.map((r) => r.type))].join(', '));
  // Sum in integer cents to remove any float artefact from the comparison.
  const cents = (n: number) => Math.round(Number(n) * 100);
  const sum = (t: string) => rows.filter((r) => r.type === t).reduce((a, r) => a + cents(r.balance), 0);
  const A = sum('Asset'), L = sum('Liability'), E = sum('Equity'), I = sum('Income'), X = sum('Expense');
  console.log(`cents  A=${A}  L=${L}  E=${E}  I=${I}  X=${X}`);
  console.log(`A - (L+E+I-X) = ${A - (L + E + I - X)} cents`);

  // Authoritative: are debits = credits in the raw ledger?
  const jes = await s.from('journal_entries').select('id').eq('company_id', cid);
  const ids = (jes.data ?? []).map((j) => j.id);
  let dr = 0, cr = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const it = await s.from('journal_entry_items').select('type, amount, journal_entry_id').in('journal_entry_id', chunk);
    for (const r of it.data ?? []) {
      if (r.type === 'debit') dr += cents(r.amount); else cr += cents(r.amount);
    }
  }
  console.log(`\nraw ledger: debits=${dr} credits=${cr} diff=${dr - cr} cents`);

  // Any single journal that does not balance?
  const perJe: Record<string, number> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const it = await s.from('journal_entry_items').select('type, amount, journal_entry_id').in('journal_entry_id', chunk);
    for (const r of it.data ?? []) {
      perJe[r.journal_entry_id] = (perJe[r.journal_entry_id] ?? 0) + (r.type === 'debit' ? cents(r.amount) : -cents(r.amount));
    }
  }
  const unbalanced = Object.entries(perJe).filter(([, v]) => v !== 0);
  console.log(`unbalanced journals: ${unbalanced.length}`);
  for (const [id, v] of unbalanced.slice(0, 5)) {
    const je = await s.from('journal_entries').select('journal_number, entry_date, description').eq('id', id).maybeSingle();
    console.log(`   ${je.data?.journal_number} ${je.data?.entry_date} diff=${v}c  ${je.data?.description}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
