/**
 * Reproduces the 500 the browser console shows on the customers function.
 *
 * Walks every company: the list call the Customers page makes, then the
 * GET_DETAILS call the Customer Detail page makes for each customer, printing
 * the real error body that supabase-js hides on error.context.
 */
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);
const FROM = '2000-01-01';
const TO = new Date().toISOString().slice(0, 10);

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  console.log('companies: ' + companies.length);

  for (const co of companies) {
    const list = await invoke(s, 'customers', { method: 'GET', company_id: co.id });
    const rows = (list.body as Array<{ id: string; name: string }>) ?? [];
    console.log(NL + '======== ' + co.name + ' ========');
    console.log('  GET: status=' + list.status + ' customers=' + (list.ok ? rows.length : 'n/a'));
    if (!list.ok) {
      console.log('    body: ' + JSON.stringify(list.body).slice(0, 600));
      continue;
    }
    for (const cust of rows) {
      const d = await invoke(s, 'customers', {
        method: 'GET_DETAILS',
        company_id: co.id,
        customerId: cust.id,
        date_from: FROM,
        date_to: TO,
      });
      const mark = d.ok ? 'ok  ' : 'FAIL';
      console.log('  ' + mark + ' GET_DETAILS ' + cust.name + ' status=' + d.status);
      if (!d.ok) console.log('    body: ' + JSON.stringify(d.body).slice(0, 900));
    }
  }

  console.log(NL + '======== SAME CALL, NO DATE RANGE ========');
  const co = companies.find((c) => c.name === 'Spaceman') ?? companies[0];
  const list = await invoke(s, 'customers', { method: 'GET', company_id: co.id });
  const first = ((list.body as Array<{ id: string; name: string }>) ?? [])[0];
  if (first) {
    const d = await invoke(s, 'customers', { method: 'GET_DETAILS', company_id: co.id, customerId: first.id });
    console.log('  ' + (d.ok ? 'ok' : 'FAIL') + ' status=' + d.status + ' ' + JSON.stringify(d.body).slice(0, 500));
  }
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
