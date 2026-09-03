/**
 * Forensics for the loan reclassification.
 *
 * Lists EVERY movement on the two trade control accounts and separates what is
 * genuinely trade (a bill or an invoice) from what is not, so the journal moves
 * exactly the right amount and nothing else.
 */
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;

  const coa = await s.from('chart_of_accounts')
    .select('id, account_number, name, type, category, account_role')
    .eq('company_id', co.id);
  const byId = new Map((coa.data ?? []).map((a) => [a.id, a]));
  const ap = (coa.data ?? []).find((a) => a.account_role === 'trade_payable')!;
  const ar = (coa.data ?? []).find((a) => a.account_role === 'trade_receivable')!;
  console.log(`AP control: ${ap.account_number} ${ap.name}`);
  console.log(`AR control: ${ar.account_number} ${ar.name}`);

  const loan = await s.from('loans').select('*').eq('company_id', co.id).maybeSingle();
  const sched = await s.from('loan_amortization_schedule')
    .select('journal_entry_id, payment_number, principal, interest, payment_amount, status')
    .eq('loan_id', (loan.data as { id: string }).id);
  const loanJournalIds = new Set((sched.data ?? []).map((r) => r.journal_entry_id).filter(Boolean));

  for (const control of [ap, ar]) {
    console.log(NL + `======== ${control.account_number} ${control.name} ========`);
    const items = await s.from('journal_entry_items')
      .select('amount, type, journal_entry_id, journal_entries!inner ( company_id, entry_date, description, journal_number, vendor_id, customer_id, bill_id, invoice_id )')
      .eq('account_id', control.id)
      .eq('journal_entries.company_id', co.id);
    const rows = (items.data ?? []) as Array<{
      amount: number; type: string; journal_entry_id: string;
      journal_entries: {
        entry_date: string; description: string; journal_number: string;
        vendor_id: string | null; customer_id: string | null;
        bill_id: string | null; invoice_id: string | null;
      };
    }>;
    const increases = control.account_role === 'trade_payable' ? 'credit' : 'debit';
    let trade = 0;
    let nonTrade = 0;
    const nonTradeRows: string[] = [];
    for (const r of rows) {
      const j = r.journal_entries;
      const signed = (r.type === increases ? 1 : -1) * c(r.amount);
      // Trade means the movement is tied to a bill or an invoice.
      const isTrade = Boolean(j.bill_id || j.invoice_id);
      if (isTrade) trade += signed;
      else {
        nonTrade += signed;
        nonTradeRows.push(
          `    ${j.journal_number} ${j.entry_date} ${r.type.padEnd(6)} ${R(c(r.amount)).padStart(12)} ` +
          `signed=${R(signed).padStart(12)} ${loanJournalIds.has(r.journal_entry_id) ? '[LOAN]' : '      '} ${j.description}`,
        );
      }
    }
    console.log(`  movements: ${rows.length}`);
    console.log(`  tied to a bill/invoice (trade): ${R(trade)}`);
    console.log(`  NOT tied to a document        : ${R(nonTrade)}`);
    console.log(`  total                         : ${R(trade + nonTrade)}`);
    console.log(NL + '  --- movements not tied to a document ---');
    for (const line of nonTradeRows) console.log(line);
  }

  console.log(NL + '======== WHAT THE LOAN ITSELF PUT THERE ========');
  const allLoanJournals = await s.from('journal_entries')
    .select('id, journal_number, entry_date, description')
    .eq('company_id', co.id)
    .or('description.ilike.%loan%,description.ilike.%kudzanai%');
  for (const j of allLoanJournals.data ?? []) {
    const it = await s.from('journal_entry_items').select('amount, type, account_id').eq('journal_entry_id', j.id);
    console.log(`  ${j.journal_number} ${j.entry_date} ${j.description}`);
    for (const x of it.data ?? []) {
      const a = byId.get(x.account_id);
      console.log(`      ${x.type.padEnd(6)} ${String(x.amount).padStart(12)}  ${a?.account_number} ${a?.name}`);
    }
  }

  console.log(NL + '======== BANK / CASH ACCOUNTS AVAILABLE ========');
  const banks = await s.from('bank_accounts')
    .select('id, name, chart_of_account_id, is_active')
    .eq('company_id', co.id);
  for (const b of banks.data ?? []) {
    const a = byId.get(b.chart_of_account_id as string);
    console.log(`  ${String(b.name).padEnd(30)} -> ${a?.account_number ?? '??'} ${a?.name ?? 'UNLINKED'} active=${b.is_active}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
