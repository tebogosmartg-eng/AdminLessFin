import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);
const LOAN_JES = ['JE-000016', 'JE-000017', 'JE-000128', 'JE-000129'];

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  const coa = await s.from('chart_of_accounts')
    .select('id, account_number, name, type, category, account_role, allow_manual_posting, posting_blocked')
    .eq('company_id', co.id).order('account_number');
  const byId = new Map((coa.data ?? []).map((a) => [a.id, a]));

  const jes = await s.from('journal_entries').select('id, journal_number')
    .eq('company_id', co.id).in('journal_number', LOAN_JES);
  const ids = (jes.data ?? []).map((j) => j.id);
  const items = await s.from('journal_entry_items').select('account_id, type, amount, journal_entry_id').in('journal_entry_id', ids);

  const net: Record<string, number> = {};
  for (const it of items.data ?? []) {
    net[it.account_id] = (net[it.account_id] ?? 0) + (it.type === 'debit' ? c(it.amount) : -c(it.amount));
  }
  console.log('=== NET EFFECT OF THE LOAN JOURNALS, BY ACCOUNT ===');
  for (const [accId, v] of Object.entries(net)) {
    const a = byId.get(accId);
    console.log(`  ${a?.account_number} ${String(a?.name).padEnd(16)} [${a?.account_role ?? '-'}] net ${v > 0 ? 'DEBIT ' : 'CREDIT'} ${R(Math.abs(v))}`);
  }
  const sum = Object.values(net).reduce((t, v) => t + v, 0);
  console.log(`  (net of all legs: ${R(sum)} — must be 0)`);

  console.log(NL + '=== FULL CHART ===');
  for (const a of coa.data ?? []) {
    console.log(`  ${String(a.account_number).padEnd(6)} ${String(a.name).padEnd(28)} ${String(a.type).padEnd(10)} ${a.category ?? '(none)'} role=${a.account_role ?? '-'} manual=${a.allow_manual_posting}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
