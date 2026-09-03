/**
 * Reclassifies the loan out of the trade control accounts.
 *
 * WHY
 * The loan was posted to 4001 "AP" (the creditors control account) and its
 * instalment was paid out of 3000 "AR" (the debtors control account). A control
 * account must contain only the sub-ledger it controls, so while the loan sits
 * there neither age analysis can ever agree with its control account.
 *
 * WHAT IS AND IS NOT MOVED
 * Only the loan. Every figure is RECOMPUTED from the loan's own journals and
 * the script REFUSES TO POST if what it finds does not match what it expects,
 * so it cannot move an amount nobody checked. Nothing else on either control
 * account is touched, and no existing journal is altered — this is a new,
 * balanced, forward-dated correcting entry through the normal posting engine.
 *
 *   npx tsx tools/staging-recovery/reclassify-loan.ts            (dry run)
 *   npx tsx tools/staging-recovery/reclassify-loan.ts --post     (post it)
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);
const POST = process.argv.includes('--post');
const ENTRY_DATE = '2026-09-03';

/** The journals that make up the loan. */
const LOAN_DESCRIPTIONS = /loan (received|payment)|corrected re-record of JE-000017|Reversal of JE-000017/i;

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  const company_id = co.id;
  console.log(`company: ${co.name}${NL}mode: ${POST ? 'POST' : 'DRY RUN'}`);

  const coa = await s.from('chart_of_accounts')
    .select('id, account_number, name, type, category, account_role')
    .eq('company_id', company_id).order('account_number');
  const accounts = coa.data ?? [];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byNumber = (n: number) => accounts.find((a) => Number(a.account_number) === n);

  const ap = accounts.find((a) => a.account_role === 'trade_payable')!;
  const ar = accounts.find((a) => a.account_role === 'trade_receivable')!;
  const bank = byNumber(3001)!;
  console.log(`AP=${ap.account_number} ${ap.name}  AR=${ar.account_number} ${ar.name}  Bank=${bank.account_number} ${bank.name}`);

  // ---- 1. Recompute the loan's net effect on each account -----------------
  const jes = await s.from('journal_entries')
    .select('id, journal_number, entry_date, description')
    .eq('company_id', company_id);
  const loanJes = (jes.data ?? []).filter((j) => LOAN_DESCRIPTIONS.test(j.description ?? ''));
  console.log(NL + `=== LOAN JOURNALS (${loanJes.length}) ===`);
  for (const j of loanJes) console.log(`  ${j.journal_number} ${j.entry_date} ${String(j.description).slice(0, 70)}`);

  const net: Record<string, number> = {};
  for (const j of loanJes) {
    const it = await s.from('journal_entry_items').select('account_id, type, amount').eq('journal_entry_id', j.id);
    for (const x of it.data ?? []) {
      net[x.account_id] = (net[x.account_id] ?? 0) + (x.type === 'debit' ? c(x.amount) : -c(x.amount));
    }
  }
  console.log(NL + '=== NET EFFECT OF THE LOAN, BY ACCOUNT (debit positive) ===');
  for (const [id, v] of Object.entries(net)) {
    const a = byId.get(id);
    console.log(`  ${a?.account_number} ${String(a?.name).padEnd(18)} ${R(v).padStart(14)}`);
  }
  const balanced = Object.values(net).reduce((t, v) => t + v, 0);
  if (balanced !== 0) throw new Error(`Loan journals do not net to zero (${R(balanced)}). Refusing to post.`);

  const apNet = net[ap.id] ?? 0;      // negative = credit balance sitting in AP
  const arNet = net[ar.id] ?? 0;      // negative = credit sitting in AR
  const loanLiability = -apNet;       // the credit to move out of AP
  const repaidFromAr = -arNet;        // the credit to move out of AR

  console.log(NL + '=== WHAT WILL MOVE ===');
  console.log(`  loan liability wrongly in ${ap.account_number} ${ap.name}: CREDIT ${R(loanLiability)}`);
  console.log(`  repayment wrongly out of ${ar.account_number} ${ar.name} : CREDIT ${R(repaidFromAr)}`);

  // Guards: refuse anything that is not the loan we investigated.
  if (loanLiability <= 0) throw new Error('No loan credit found in the creditors control account. Refusing to post.');
  if (repaidFromAr <= 0) throw new Error('No loan credit found in the debtors control account. Refusing to post.');
  if (loanLiability !== 96218840) throw new Error(`Expected 962188.40 in AP, found ${R(loanLiability)}. Refusing to post.`);
  if (repaidFromAr !== 4614493) throw new Error(`Expected 46144.93 in AR, found ${R(repaidFromAr)}. Refusing to post.`);

  // ---- 2. A liability account for the borrowing ---------------------------
  let loanAccount = accounts.find((a) => a.type === 'Liability' && /loan|borrowing/i.test(a.name));
  if (!loanAccount) {
    console.log(NL + '=== CREATE THE BORROWINGS ACCOUNT ===');
    const nextNumber = Math.max(...accounts.map((a) => Number(a.account_number) || 0)) + 80;
    if (!POST) {
      console.log(`  would create ${nextNumber} "Loans from Related Parties" [Liability / Non-Current Liabilities]`);
    } else {
      const created = await invoke(s, 'chart-of-accounts', {
        method: 'POST', company_id,
        accountData: {
          account_number: nextNumber,
          name: 'Loans from Related Parties',
          type: 'Liability',
          category: 'Non-Current Liabilities',
          description: 'Interest-bearing borrowings. Reclassified out of trade creditors.',
        },
      });
      if (!created.ok) throw new Error('Could not create the borrowings account: ' + tech(created));
      const refetch = await s.from('chart_of_accounts')
        .select('id, account_number, name, type, category, account_role')
        .eq('company_id', company_id).eq('account_number', nextNumber).maybeSingle();
      loanAccount = refetch.data as typeof loanAccount;
      console.log(`  created ${loanAccount!.account_number} ${loanAccount!.name}`);
    }
  } else {
    console.log(NL + `=== BORROWINGS ACCOUNT ALREADY EXISTS: ${loanAccount.account_number} ${loanAccount.name} ===`);
  }

  // ---- 3. The reclassification journal ------------------------------------
  const lines = [
    { account_id: ap.id, type: 'debit' as const, amount: loanLiability / 100, label: `${ap.account_number} ${ap.name}` },
    { account_id: ar.id, type: 'debit' as const, amount: repaidFromAr / 100, label: `${ar.account_number} ${ar.name}` },
    { account_id: loanAccount?.id ?? '(pending)', type: 'credit' as const, amount: loanLiability / 100, label: `${loanAccount?.account_number ?? '?'} ${loanAccount?.name ?? 'Loans'}` },
    { account_id: bank.id, type: 'credit' as const, amount: repaidFromAr / 100, label: `${bank.account_number} ${bank.name}` },
  ];
  console.log(NL + '=== RECLASSIFICATION JOURNAL ===');
  let dr = 0;
  let cr = 0;
  for (const l of lines) {
    if (l.type === 'debit') dr += c(l.amount); else cr += c(l.amount);
    console.log(`  ${l.type.toUpperCase().padEnd(6)} ${R(c(l.amount)).padStart(14)}  ${l.label}`);
  }
  console.log(`  debits ${R(dr)} credits ${R(cr)} ${dr === cr ? '(balanced)' : '(NOT BALANCED)'}`);
  if (dr !== cr) throw new Error('Reclassification journal does not balance. Refusing to post.');

  if (!POST) {
    console.log(NL + 'DRY RUN — nothing posted. Re-run with --post to apply.');
    return;
  }

  const description =
    'Reclassification: loan from kudzanai out of the trade control accounts. ' +
    'The loan liability was posted to 4001 AP (creditors control) and instalment 1 was ' +
    'paid out of 3000 AR (debtors control). A control account must hold only the ' +
    'sub-ledger it controls, so the borrowing is moved to its own liability account and ' +
    'the repayment to the bank account it was actually paid from. No original journal is altered.';

  const posted = await invoke(s, 'journal-entries', {
    method: 'POST', company_id,
    entryData: {
      entry_date: ENTRY_DATE,
      description,
      items: lines.map((l) => ({ account_id: l.account_id, type: l.type, amount: l.amount })),
    },
  });
  console.log(NL + `=== POSTED === status=${posted.status} ${posted.ok ? JSON.stringify(posted.body) : tech(posted)}`);
  if (!posted.ok) throw new Error('Posting failed.');
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
