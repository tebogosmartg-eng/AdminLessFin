/**
 * P0 forensics: the exact source of Spaceman's R0.01 imbalance.
 *
 * Establishes, from the database and not from inference:
 *   - JE-000017's every line, account, side and amount
 *   - the debit total, credit total and signed difference
 *   - which account carries the error
 *   - the loan instalment it was posted from
 *   - which existing accounts could carry an adjustment
 */
import { connect } from './edgeProbe';

const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const r = (cents: number) => (cents / 100).toFixed(2);
const NL = String.fromCharCode(10);

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  console.log(`company: ${company.name} ${company.id}`);

  const je = await s
    .from('journal_entries')
    .select('*')
    .eq('company_id', company.id)
    .eq('journal_number', 'JE-000017')
    .maybeSingle();
  if (je.error) throw je.error;
  if (!je.data) throw new Error('JE-000017 not found');
  const j = je.data as Record<string, unknown>;
  console.log(NL + '=== JOURNAL HEADER ===');
  for (const k of Object.keys(j)) console.log(`  ${k}: ${JSON.stringify(j[k])}`);

  const items = await s
    .from('journal_entry_items')
    .select('id, account_id, type, amount, chart_of_accounts ( account_code, account_number, name, type, category, account_role, allow_manual_posting, posting_blocked )')
    .eq('journal_entry_id', j.id as string);
  if (items.error) throw items.error;

  console.log(NL + '=== LINES ===');
  let dr = 0;
  let cr = 0;
  for (const it of items.data ?? []) {
    const a = (it as unknown as {
      chart_of_accounts: {
        account_code: string | null; account_number: number; name: string;
        type: string; category: string | null; account_role: string | null;
        allow_manual_posting: boolean; posting_blocked: boolean;
      };
    }).chart_of_accounts;
    const cents = c(it.amount);
    if (it.type === 'debit') dr += cents; else cr += cents;
    console.log(
      `  ${it.type.toUpperCase().padEnd(6)} ${r(cents).padStart(12)}  ` +
      `${a?.account_code ?? a?.account_number} ${a?.name}  ` +
      `[${a?.type}/${a?.category}${a?.account_role ? '/' + a.account_role : ''}] ` +
      `manual=${a?.allow_manual_posting} blocked=${a?.posting_blocked}  id=${it.account_id}`
    );
  }
  console.log(NL + `  debits  = ${r(dr)}`);
  console.log(`  credits = ${r(cr)}`);
  console.log(`  DIFF (dr - cr) = ${r(dr - cr)}  (${dr - cr} cents)`);

  const sched = await s
    .from('loan_amortization_schedule')
    .select('*')
    .eq('journal_entry_id', j.id as string)
    .maybeSingle();
  if (sched.error) console.log('schedule lookup error: ' + sched.error.message);
  if (sched.data) {
    const sd = sched.data as Record<string, unknown>;
    console.log(NL + '=== SOURCE: loan_amortization_schedule ===');
    for (const k of Object.keys(sd)) console.log(`  ${k}: ${JSON.stringify(sd[k])}`);
    const pr = c(sd.principal);
    const i = c(sd.interest);
    const pay = c(sd.payment_amount);
    console.log(`  principal + interest = ${r(pr + i)} vs payment_amount ${r(pay)} -> drift ${pr + i - pay} cents`);
  } else {
    console.log(NL + '=== SOURCE: no loan_amortization_schedule row links to this journal ===');
  }

  console.log(NL + '=== CANDIDATE ADJUSTMENT ACCOUNTS ===');
  const coa = await s
    .from('chart_of_accounts')
    .select('id, account_code, account_number, name, type, category, account_role, is_active, system_account, allow_manual_posting, posting_blocked')
    .eq('company_id', company.id)
    .order('account_number');
  if (coa.error) throw coa.error;
  const all = coa.data ?? [];
  const wanted = /round|suspense|prior.?period|retained|accumulated|sundry|misc|other (income|expense)|adjust|forex|exchange|interest/i;
  for (const a of all) {
    if (wanted.test(a.name) || (a.account_role && wanted.test(a.account_role))) {
      console.log(
        `  ${a.account_code ?? a.account_number} ${a.name}  [${a.type}/${a.category}` +
        `${a.account_role ? '/' + a.account_role : ''}] active=${a.is_active} system=${a.system_account} ` +
        `manual=${a.allow_manual_posting} blocked=${a.posting_blocked}`
      );
    }
  }
  console.log(`  (chart has ${all.length} accounts in total)`);
  console.log(NL + '=== ROLES DEFINED ===');
  console.log('  ' + [...new Set(all.map((a) => a.account_role).filter(Boolean))].sort().join(', '));
}
main().catch((e) => { console.error(e); process.exit(1); });
