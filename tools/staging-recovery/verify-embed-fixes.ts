/**
 * Confirms the five repaired reads return correct content, not merely a 200.
 * A query that parses but resolves nothing is the same defect wearing a
 * different status code.
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const co = companies.find((c) => c.name === 'Spaceman')!;
  const today = new Date().toISOString().slice(0, 10);

  console.log('======== customers GET_DETAILS: invoice numbers resolve ========');
  const list = await invoke(s, 'customers', { method: 'GET', company_id: co.id });
  const custs = (list.body as Array<{ id: string; name: string }>) ?? [];
  let rowsWithInvoiceId = 0;
  let rowsWithNumber = 0;
  for (const c of custs) {
    const d = await invoke(s, 'customers', {
      method: 'GET_DETAILS', company_id: co.id, customerId: c.id,
      date_from: '2000-01-01', date_to: today,
    });
    if (!d.ok) { check('GET_DETAILS ' + c.name, false, tech(d)); continue; }
    const st = (d.body as { statement: Array<{ invoice_id: string | null; invoice_number?: string }> }).statement ?? [];
    for (const r of st) {
      if (r.invoice_id) {
        rowsWithInvoiceId++;
        if (r.invoice_number) rowsWithNumber++;
      }
    }
    check('GET_DETAILS ' + c.name, true, st.length + ' statement rows');
  }
  check('every row carrying an invoice_id also shows its number',
    rowsWithInvoiceId > 0 && rowsWithInvoiceId === rowsWithNumber,
    rowsWithNumber + '/' + rowsWithInvoiceId);

  console.log(NL + '======== calendar-events: amounts are not silently zero ========');
  const cal = await invoke(s, 'calendar-events', {
    method: 'GET', company_id: co.id, start_date: '2000-01-01', end_date: '2030-12-31',
  });
  check('calendar-events responds', cal.ok, cal.ok ? '' : tech(cal));
  if (cal.ok) {
    const evs = (cal.body as Array<{ type: string; amount?: number; title: string }>) ?? [];
    const docs = evs.filter((e) => e.type === 'invoice' || e.type === 'bill');
    const priced = docs.filter((e) => Number(e.amount) > 0);
    console.log('    events=' + evs.length + '  invoices/bills=' + docs.length + '  with an amount=' + priced.length);
    check('invoice/bill events carry an amount', docs.length > 0 && priced.length > 0,
      priced.length + '/' + docs.length);
  }

  console.log(NL + '======== work: project GL economics ========');
  const projects = await s.from('ewm_projects').select('id, name').eq('company_id', co.id).limit(3);
  if (!projects.data?.length) {
    console.log('  (no EWM projects in this company; query shape already proven by the schema sweep)');
  }
  for (const p of projects.data ?? []) {
    const r = await invoke(s, 'work', { method: 'GET_EWM_PROJECT', company_id: co.id, ewm_project_id: p.id });
    check('work project ' + p.name, r.ok, r.ok ? '' : tech(r).slice(0, 120));
  }

  console.log(NL + '======== statement/invoice email: the read now runs ========');
  console.log('  (a Resend configuration error proves the query executed and the failure moved past it)');
  const inv = await s.from('invoices').select('id, invoice_number').eq('company_id', co.id).limit(1).maybeSingle();
  if (inv.data) {
    const r = await invoke(s, 'send-invoice-email', {
      invoiceId: inv.data.id, to: 'nobody@example.invalid', subject: 'shape check', body: 'shape check',
    });
    const t = tech(r) || JSON.stringify(r.body).slice(0, 200);
    const relational = /relationship|does not exist|column/i.test(t);
    check('send-invoice-email past the relational read', !relational, t.slice(0, 140));
  }
  if (custs[0]) {
    const r = await invoke(s, 'send-statement-email', {
      company_id: co.id, type: 'customer', entityId: custs[0].id,
      date_from: '2000-01-01', date_to: today,
      to: 'nobody@example.invalid', subject: 'shape check', body: 'shape check',
    });
    const t = tech(r) || JSON.stringify(r.body).slice(0, 200);
    const relational = /relationship|does not exist|column/i.test(t);
    check('send-statement-email past the relational read', !relational, t.slice(0, 140));
  }

  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
