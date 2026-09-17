/**
 * The purchase order document, end to end, against production.
 *
 * No tenant on this account had a single purchase order, so nothing about this
 * path had ever been exercised with real data. One is created here, read back
 * through GET_DOCUMENT, and checked as the supplier would read it: what to
 * supply, where, by when, and quoting what.
 */
import { connect, invoke, tech } from './edgeProbe';
import {
  buildPurchaseOrderDocument,
  purchaseOrderInstruction,
} from '../../src/lib/purchaseOrders/purchaseOrderDocument';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

function report() {
  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail) process.exit(1);
}

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });
  const stamp = Date.now();
  const TODAY = new Date().toISOString().slice(0, 10);

  const vendor = await api.from('vendors').select('id, name').eq('company_id', co.id)
    .ilike('name', 'kudzanai').maybeSingle();
  if (!vendor.data) throw new Error('Expected vendor not found.');

  const poNumber = 'PODOC-' + stamp;
  console.log('======== RAISING A PURCHASE ORDER ========');
  const created = await invoke(api, 'purchase-orders', {
    method: 'POST', company_id: co.id,
    poData: {
      vendor_id: vendor.data.id,
      po_number: poNumber,
      po_date: TODAY,
      delivery_date: '2026-10-15',
      status: 'sent',
      notes: 'Deliver to the loading bay before 16:00.',
      items: [
        { description: 'Steel brackets', quantity: 40, unit_cost: 12.5 },
        { description: 'Delivery', quantity: 1, unit_cost: 350 },
      ],
    },
  });
  check('the purchase order saved', created.ok, created.ok ? poNumber : tech(created));
  if (!created.ok) { report(); return; }
  const poId = (created.body as { id: string }).id;

  console.log(NL + '======== THE DOCUMENT ========');
  const res = await invoke(api, 'purchase-orders', {
    method: 'GET_DOCUMENT', company_id: co.id, poId,
  });
  check('GET_DOCUMENT answered', res.ok, res.ok ? '' : tech(res));
  if (!res.ok) { report(); return; }

  const model = buildPurchaseOrderDocument(res.body as never);
  check('it names what was ordered',
    model.lines.map((l) => l.description).join(' | ') === 'Steel brackets | Delivery',
    model.lines.map((l) => l.description).join(' | '));
  check('the line total is quantity times cost', c(model.lines[0].amount) === c(500), String(model.lines[0].amount));
  check('the order total adds up', c(model.total) === c(850), String(model.total));
  check('the supplier is named', model.supplier.name === vendor.data.name, model.supplier.name);
  check('the company is named', !!model.company.name && model.company.name !== 'Your Company', model.company.name);
  check('a logo is available to print', !!model.company.logoUrl);
  check('it says where to deliver', model.deliverTo.length > 0, model.deliverTo.join(' / '));
  check('it says when', model.deliveryDate === '2026-10-15', model.deliveryDate);
  check('the notes are carried', /loading bay/.test(model.notes), model.notes);

  const instruction = purchaseOrderInstruction(model);
  check('the instruction quotes the order number', instruction.includes(poNumber), instruction.slice(0, 90));
  check('and the delivery date', instruction.includes('2026-10-15'));

  console.log(NL + '======== A CANCELLED ORDER TELLS THE SUPPLIER TO STOP ========');
  const cancelled = await invoke(api, 'purchase-orders', {
    method: 'CANCEL', company_id: co.id, poId,
  });
  if (cancelled.ok) {
    const after = await invoke(api, 'purchase-orders', { method: 'GET_DOCUMENT', company_id: co.id, poId });
    const m2 = buildPurchaseOrderDocument(after.body as never);
    check('it reads as cancelled', m2.isCancelled, m2.statusLabel);
    check('and says not to supply against it',
      /Do not supply/.test(purchaseOrderInstruction(m2)),
      purchaseOrderInstruction(m2).slice(0, 80));
    check('the total is unchanged by cancelling', c(m2.total) === c(850), String(m2.total));
  } else {
    check('the order could be cancelled', false, tech(cancelled));
  }

  console.log(NL + '======== TENANT ISOLATION ========');
  const other = companies.find((x) => x.id !== co.id);
  if (other) {
    const cross = await invoke(api, 'purchase-orders', {
      method: 'GET_DOCUMENT', company_id: other.id, poId,
    });
    check('another company cannot fetch this purchase order', !cross.ok, 'status ' + cross.status);
  }

  report();
  console.log('test purchase order: ' + poNumber);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
