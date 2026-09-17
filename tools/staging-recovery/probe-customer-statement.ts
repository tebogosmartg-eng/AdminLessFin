/**
 * Is the customer statement's opening balance real?
 *
 * GET_DETAILS computes it by walking every journal_entry_item belonging to the
 * customer and adding debits, subtracting credits. Both branches of its
 * if/else do that -- the AR test changes nothing -- and a balanced journal has
 * equal debits and credits, so the sum should always be zero no matter what
 * the customer actually owed at the period start.
 *
 * This checks the claim against real data: pick customers with activity before
 * a period, ask for a statement starting inside it, and compare the reported
 * opening balance with the receivables control movements that actually
 * preceded it.
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  const ar = await api.from('chart_of_accounts')
    .select('id, name').eq('company_id', co.id).eq('account_role', 'trade_receivable');
  const arIds = new Set((ar.data ?? []).map((a) => a.id as string));
  console.log('AR control accounts: ' + [...arIds].length);

  const customers = await api.from('customers').select('id, name').eq('company_id', co.id).limit(6);

  const FROM = '2026-09-10';
  const TO = '2026-12-31';

  for (const cust of customers.data ?? []) {
    // What the ledger says was owed immediately before FROM: the net of the
    // receivables control movements on this customer's journals.
    const prior = await api.from('journal_entry_items')
      .select('amount, type, account_id, journal_entries!inner(company_id, customer_id, entry_date)')
      .eq('journal_entries.company_id', co.id)
      .eq('journal_entries.customer_id', cust.id)
      .lt('journal_entries.entry_date', FROM);

    if (prior.error) { console.log(NL + cust.name + ': ERR ' + prior.error.message); continue; }

    let truthCents = 0;
    let allMovesCents = 0;
    for (const item of prior.data ?? []) {
      const signed = (item.type === 'debit' ? 1 : -1) * c(item.amount);
      allMovesCents += signed;
      if (arIds.has(item.account_id as string)) truthCents += signed;
    }

    const res = await invoke(api, 'customers', {
      method: 'GET_DETAILS', company_id: co.id, customerId: cust.id,
      date_from: FROM, date_to: TO,
    });
    if (!res.ok) { console.log(NL + cust.name + ': ERR ' + tech(res)); continue; }
    const reported = c((res.body as { opening_balance?: number }).opening_balance);

    console.log(NL + '======== ' + cust.name + ' ========');
    console.log('  journal lines before ' + FROM + ': ' + (prior.data ?? []).length);
    console.log('  receivables control movement (the truth): ' + truthCents / 100);
    console.log('  every line, debits less credits:          ' + allMovesCents / 100);
    console.log('  opening balance GET_DETAILS reports:      ' + reported / 100);
    console.log('  ' + (reported === truthCents ? 'MATCHES the ledger' : 'DOES NOT MATCH the ledger'));
    if (reported === allMovesCents && truthCents !== allMovesCents) {
      console.log('  ...and equals the all-lines sum, which is the bug.');
    }
  }
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
