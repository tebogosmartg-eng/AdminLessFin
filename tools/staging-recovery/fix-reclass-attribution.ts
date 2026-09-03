/**
 * Corrects the attribution of the loan reclassification.
 *
 * JE-000156 moved the loan out of the trade control accounts correctly at the
 * general-ledger level, but it carried no vendor_id. Party attribution lives on
 * the journal HEADER, not the line, so a single entry touching both the
 * creditors and the debtors control account cannot attribute both. The result:
 * the general ledger was right, while kudzanai's supplier balance still showed
 * the loan, because the original credit was attributed to the supplier and the
 * reclassifying debit was not.
 *
 * This reverses that entry and re-posts it as the two corrections it always
 * was — which is also the clearer presentation:
 *
 *   A  creditors leg, attributed to kudzanai:  Dr 4001 AP  / Cr 4100 Loans
 *   B  banking leg, no party:                  Dr 3000 AR  / Cr 3001 Bank
 *
 * All three journals are balanced and go through the normal posting engine.
 * Nothing is edited or deleted.
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);
const POST = process.argv.includes('--post');
const ENTRY_DATE = '2026-09-03';

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  const company_id = co.id;

  const coa = await s.from('chart_of_accounts')
    .select('id, account_number, name, account_role').eq('company_id', company_id);
  const accounts = coa.data ?? [];
  const num = (n: number) => accounts.find((a) => Number(a.account_number) === n)!;
  const ap = accounts.find((a) => a.account_role === 'trade_payable')!;
  const ar = accounts.find((a) => a.account_role === 'trade_receivable')!;
  const loans = num(4100);
  const bank = num(3001);

  const lender = await s.from('vendors').select('id, name').eq('company_id', company_id).ilike('name', 'kudzanai').maybeSingle();
  if (!lender.data) throw new Error('Lender not found.');
  console.log(`lender: ${lender.data.name} (${lender.data.id})`);

  const orig = await s.from('journal_entries')
    .select('id, journal_number, vendor_id, description')
    .eq('company_id', company_id).ilike('description', 'Reclassification: loan from kudzanai%')
    .order('journal_number');
  const target = (orig.data ?? []).find((j) => !j.vendor_id);
  if (!target) {
    console.log('No unattributed reclassification journal found — nothing to correct.');
    return;
  }
  console.log(`correcting ${target.journal_number} (vendor_id is ${target.vendor_id ?? 'NULL'})`);

  const items = await s.from('journal_entry_items').select('account_id, type, amount').eq('journal_entry_id', target.id);
  let dr = 0;
  let cr = 0;
  for (const i of items.data ?? []) { if (i.type === 'debit') dr += c(i.amount); else cr += c(i.amount); }
  if (dr !== cr) throw new Error('Target journal is unbalanced; use the defective-journal route instead.');
  console.log(`  it is balanced at ${R(dr)}, so a plain mirror reverses it`);

  const apAmount = c((items.data ?? []).find((i) => i.account_id === ap.id && i.type === 'debit')?.amount ?? 0);
  const arAmount = c((items.data ?? []).find((i) => i.account_id === ar.id && i.type === 'debit')?.amount ?? 0);
  if (apAmount !== 96218840 || arAmount !== 4614493) {
    throw new Error(`Unexpected amounts AP=${R(apAmount)} AR=${R(arAmount)}. Refusing.`);
  }

  const plan = [
    {
      label: `reversal of ${target.journal_number}`,
      vendor_id: null as string | null,
      description: `Reversal of ${target.journal_number}: re-posted as two entries so the creditors leg carries the supplier it belongs to.`,
      items: (items.data ?? []).map((i) => ({
        account_id: i.account_id,
        type: i.type === 'debit' ? 'credit' : 'debit',
        amount: Number(i.amount),
      })),
    },
    {
      label: 'A — creditors leg, attributed to kudzanai',
      vendor_id: lender.data.id,
      description:
        'Reclassification A: loan from kudzanai out of the creditors control account. The loan ' +
        'liability was posted to 4001 AP, which is the creditors control account and must hold ' +
        'only trade creditors. Moved to 4100 Loans from Related Parties. Attributed to the ' +
        'lender so the supplier sub-ledger clears with the control account.',
      items: [
        { account_id: ap.id, type: 'debit', amount: apAmount / 100 },
        { account_id: loans.id, type: 'credit', amount: apAmount / 100 },
      ],
    },
    {
      label: 'B — banking leg, no party',
      vendor_id: null,
      description:
        'Reclassification B: loan instalment 1 was paid out of 3000 AR, the debtors control ' +
        'account, instead of the bank account it actually left. Moved to 3001 Bank. This is a ' +
        'banking correction and belongs to no customer.',
      items: [
        { account_id: ar.id, type: 'debit', amount: arAmount / 100 },
        { account_id: bank.id, type: 'credit', amount: arAmount / 100 },
      ],
    },
  ];

  console.log(NL + '=== PLAN ===');
  for (const p of plan) {
    console.log(`  ${p.label}${p.vendor_id ? '  [vendor attributed]' : ''}`);
    for (const i of p.items) {
      const a = accounts.find((x) => x.id === i.account_id);
      console.log(`      ${i.type.toUpperCase().padEnd(6)} ${R(c(i.amount)).padStart(13)}  ${a?.account_number} ${a?.name}`);
    }
  }
  if (!POST) { console.log(NL + 'DRY RUN — re-run with --post to apply.'); return; }

  console.log(NL + '=== POSTING ===');
  for (const p of plan) {
    const r = await invoke(s, 'journal-entries', {
      method: 'POST', company_id,
      entryData: {
        entry_date: ENTRY_DATE,
        description: p.description,
        vendor_id: p.vendor_id,
        items: p.items,
      },
    });
    console.log(`  ${p.label}: ${r.ok ? 'posted ' + JSON.stringify(r.body) : 'FAILED ' + tech(r)}`);
    if (!r.ok) throw new Error('Posting failed; stopping.');
  }
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
