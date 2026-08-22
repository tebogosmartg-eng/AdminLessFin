/**
 * P0 remediation: reverse the defective JE-000017 and re-record it correctly.
 *
 * Nothing here edits or deletes a posted entry. The sequence is:
 *   0. prove the guard refuses a HEALTHY journal
 *   1. mirror-reverse the defective entry  (pair nets to exactly zero)
 *   2. re-record the instalment correctly through the NORMAL posting engine
 *      (journal-entries POST -> posting_engine_submit, exact balance enforced)
 *   3. realign the amortisation row with what was actually posted
 */
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);

const JE17 = '0156d907-ba5d-45b7-b21a-a28e37c810eb';
const ACC_INTEREST = '42a687dc-adbc-497d-ba3e-ae344d35a251'; // 2005 Stationary
const ACC_LOAN = '6b4d2c01-e9f4-4a5f-b306-c088af94e70a'; // 4001 AP (loan liability)
const ACC_BANK = 'eb5a9a02-7e79-44f6-b6b5-fe4fb2b0f674'; // 3000 AR (payment source)
const LENDER = '1b82cb2d-1a20-4722-b32e-b0b4b1f3e73a';

async function ledgerDiff(s: Awaited<ReturnType<typeof connect>>['supabase'], companyId: string) {
  const jes = await s.from('journal_entries').select('id').eq('company_id', companyId);
  const ids = (jes.data ?? []).map((j) => j.id);
  let dr = 0;
  let cr = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const it = await s
      .from('journal_entry_items')
      .select('type, amount')
      .in('journal_entry_id', ids.slice(i, i + 200));
    for (const x of it.data ?? []) {
      if (x.type === 'debit') dr += c(x.amount);
      else cr += c(x.amount);
    }
  }
  return { dr, cr, diff: dr - cr };
}

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  console.log(`company: ${company.name} ${company.id}`);

  const before = await ledgerDiff(s, company.id);
  console.log(`BEFORE  debits=${before.dr}c credits=${before.cr}c diff=${before.diff}c`);

  // ---- 0. The guard must refuse a healthy journal -------------------------
  console.log(NL + '=== 0. GUARD PROOF (healthy journal must be refused) ===');
  const healthy = await s
    .from('journal_entries')
    .select('id, journal_number')
    .eq('company_id', company.id)
    .neq('id', JE17)
    .limit(1)
    .maybeSingle();
  if (healthy.data) {
    const g = await s.rpc('accounting_reverse_defective_journal', {
      p_journal_id: healthy.data.id,
      p_reason: 'guard test',
    } as never);
    console.log(`  target ${healthy.data.journal_number}`);
    console.log(`  result: ${g.error ? 'REFUSED -> ' + g.error.message : 'ACCEPTED (BAD!) ' + JSON.stringify(g.data)}`);
    if (!g.error) throw new Error('Guard failed: a balanced journal was reversed.');
  }

  // ---- 1. Mirror-reverse the defective entry ------------------------------
  console.log(NL + '=== 1. REVERSE THE DEFECTIVE JE-000017 ===');
  const rev = await s.rpc('accounting_reverse_defective_journal', {
    p_journal_id: JE17,
    p_reason:
      'Loan instalment #1 posted with principal 37 811,59 instead of the correct balancing figure ' +
      '37 811,60 (instalment 46 144,93 less interest 8 333,33), leaving the entry out of balance by R0,01. ' +
      'Reversed in full and re-recorded correctly; JE-000017 is retained unaltered.',
  } as never);
  if (rev.error) throw new Error('Reversal failed: ' + rev.error.message);
  console.log('  ' + JSON.stringify(rev.data, null, 2).split(NL).join(NL + '  '));

  const afterRev = await ledgerDiff(s, company.id);
  console.log(`  after reversal: debits=${afterRev.dr}c credits=${afterRev.cr}c diff=${afterRev.diff}c`);

  // ---- 2. Re-record correctly through the NORMAL posting engine -----------
  console.log(NL + '=== 2. RE-RECORD CORRECTLY (normal posting engine) ===');
  const post = await invoke(s, 'journal-entries', {
    method: 'POST',
    company_id: company.id,
    entryData: {
      entry_date: '2026-08-01',
      description:
        'Loan payment #1 to kudzanai - corrected re-record of JE-000017 ' +
        '(principal 37 811,60 = instalment 46 144,93 less interest 8 333,33)',
      vendor_id: LENDER,
      items: [
        { account_id: ACC_INTEREST, type: 'debit', amount: 8333.33 },
        { account_id: ACC_LOAN, type: 'debit', amount: 37811.6 },
        { account_id: ACC_BANK, type: 'credit', amount: 46144.93 },
      ],
    },
  });
  console.log(`  status=${post.status} ok=${post.ok}`);
  console.log('  body: ' + JSON.stringify(post.body));
  if (!post.ok) throw new Error('Corrected re-post failed.');

  // ---- 3. Realign the amortisation row ------------------------------------
  console.log(NL + '=== 3. REALIGN THE AMORTISATION ROW ===');
  const up = await s
    .from('loan_amortization_schedule')
    .update({ principal: 37811.6 })
    .eq('journal_entry_id', JE17)
    .select('payment_number, payment_amount, principal, interest');
  console.log(up.error ? '  ERROR ' + up.error.message : '  ' + JSON.stringify(up.data));

  const after = await ledgerDiff(s, company.id);
  console.log(NL + `AFTER   debits=${after.dr}c credits=${after.cr}c diff=${after.diff}c`);
  console.log(after.diff === 0 ? 'LEDGER BALANCES EXACTLY' : 'STILL OUT BY ' + after.diff + 'c');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
