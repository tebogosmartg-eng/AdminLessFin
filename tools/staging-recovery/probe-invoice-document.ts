/**
 * Invoices in the states a document must survive: draft (no journal at all),
 * void, and paid. None of these are exceptional -- they are simply invoices --
 * and a document renderer that only handles the happy one is not finished.
 */
import { connect, invoke, tech } from './edgeProbe';
import { buildInvoiceDocument } from '../../src/lib/invoices/invoiceDocument';

const NL = String.fromCharCode(10);
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  for (const status of ['draft', 'void', 'paid', 'sent']) {
    const found = await api.from('invoices')
      .select('id, invoice_number, journal_entry_id')
      .eq('company_id', co.id).eq('status', status).limit(1);
    const inv = (found.data ?? [])[0];
    console.log(NL + '======== ' + status.toUpperCase() + ' ========');
    if (!inv) {
      console.log('  none in this company; skipped');
      continue;
    }
    const res = await invoke(api, 'invoices', {
      method: 'GET_DOCUMENT', company_id: co.id, invoiceId: inv.id,
    });
    if (!res.ok) {
      check('a ' + status + ' invoice produces a document', false, tech(res));
      continue;
    }
    const m = buildInvoiceDocument(res.body as never);
    check('a ' + status + ' invoice produces a document', true,
      String(inv.invoice_number) + (inv.journal_entry_id ? '' : ' (no journal)'));
    check('  it has a company name', !!m.company.name);
    check('  it has a customer name', !!m.customer.name);
    check('  every line it does have is labelled',
      m.lines.every((l) => l.description.trim().length > 0),
      m.lines.length + ' line(s)');
    check('  its figures are numbers, not NaN',
      [m.subtotal, m.taxTotal, m.total, m.amountPaid, m.amountDue].every((n) => Number.isFinite(n)),
      'total ' + m.total + ', due ' + m.amountDue);
    check('  its status is put in words', !!m.statusLabel, m.statusLabel);
    if (status === 'void') check('  it is marked void', m.isVoid);
    if (status === 'paid') check('  nothing is chased on it', m.isOverdue === false);
  }

  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
