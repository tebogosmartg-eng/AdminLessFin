/**
 * What Receive Payments actually does to the books.
 *
 * Two questions the code raises and only the data can answer:
 *   1. a payment on account credits the debtors control -- does anything ever
 *      mark the invoices it settles as paid?
 *   2. does the customer's aged position still agree with their control balance
 *      afterwards?
 */
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;

  const coa = await s.from('chart_of_accounts')
    .select('id, account_number, name, account_role')
    .eq('company_id', co.id);
  const ar = (coa.data ?? []).find((a) => a.account_role === 'trade_receivable')!;
  console.log('AR control: ' + ar.account_number + ' ' + ar.name);

  const custs = await s.from('customers').select('id, name').eq('company_id', co.id);
  const invs = await s.from('invoices')
    .select('id, invoice_number, customer_id, status, invoice_date, journal_entry_id')
    .eq('company_id', co.id);

  // Every movement on the debtors control, split by what it is attached to.
  const items = await s.from('journal_entry_items')
    .select('amount, type, journal_entries!inner ( company_id, entry_date, description, journal_number, customer_id, invoice_id )')
    .eq('account_id', ar.id)
    .eq('journal_entries.company_id', co.id);
  type Row = {
    amount: number; type: string;
    journal_entries: { entry_date: string; description: string; journal_number: string; customer_id: string | null; invoice_id: string | null };
  };
  const rows = (items.data ?? []) as Row[];

  console.log(NL + '======== INVOICES AND WHAT IS RECORDED AGAINST THEM ========');
  for (const cust of custs.data ?? []) {
    const mine = rows.filter((r) => r.journal_entries.customer_id === cust.id);
    if (!mine.length) continue;
    const control = mine.reduce((t, r) => t + (r.type === 'debit' ? c(r.amount) : -c(r.amount)), 0);
    const linked = mine.filter((r) => r.journal_entries.invoice_id);
    const onAccount = mine.filter((r) => !r.journal_entries.invoice_id && r.type === 'credit');
    const onAccountTotal = onAccount.reduce((t, r) => t + c(r.amount), 0);

    console.log(NL + '--- ' + cust.name + ' ---');
    console.log('  control account balance      : ' + R(control));
    console.log('  movements linked to an invoice: ' + linked.length);
    console.log('  payments on account (no link) : ' + onAccount.length + '  totalling ' + R(onAccountTotal));

    const theirInvoices = (invs.data ?? []).filter((i) => i.customer_id === cust.id);
    let stillOpen = 0;
    for (const inv of theirInvoices) {
      const je = await s.from('journal_entry_items').select('amount, type').eq('journal_entry_id', inv.journal_entry_id);
      const gross = (je.data ?? []).filter((x) => x.type === 'debit').reduce((t, x) => t + c(x.amount), 0);
      const paidLinked = mine.filter((r) => r.journal_entries.invoice_id === inv.id && r.type === 'credit')
        .reduce((t, r) => t + c(r.amount), 0);
      const open = !['paid', 'void', 'cancelled'].includes(String(inv.status));
      if (open) stillOpen += gross - paidLinked;
      console.log('    ' + String(inv.invoice_number).padEnd(22) + String(inv.status).padEnd(10) +
        'gross ' + R(gross).padStart(12) + '  linked payments ' + R(paidLinked).padStart(12) +
        (open ? '   <- still counted as open' : ''));
    }
    console.log('  aged as open by the analysis : ' + R(stillOpen));
    console.log('  control account says they owe: ' + R(control));
    if (stillOpen !== control) {
      console.log('  ** MISMATCH ' + R(stillOpen - control) + ' -- the customer has paid but the invoice is still open **');
    }
  }

  console.log(NL + '======== WHAT THE RECEIVE PAYMENTS SCREEN LISTS ========');
  const bal = await invoke(s, 'payments', { method: 'GET_AR_BALANCES', company_id: co.id });
  for (const b of (bal.body as Array<{ customer_name: string; balance: number }>) ?? []) {
    console.log('  ' + String(b.customer_name).padEnd(24) + R(c(b.balance)).padStart(14));
  }
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
