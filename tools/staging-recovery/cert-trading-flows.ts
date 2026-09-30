/**
 * CERT TX trading flows, through the product engines end to end:
 * stock received into the inventory sub-ledger, sold on real invoices
 * (revenue + COGS + VAT + AR), a customer receipt, and December supplier
 * bills left unpaid (AP). Idempotent: every step checks before it acts.
 *
 *   npx tsx tools/staging-recovery/cert-trading-flows.ts
 */
import { connect, invoke } from './edgeProbe';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';
const WIDGET = 'a5e30a44-404d-401b-b2d0-9671f1d85e35';
const CUSTOMER = '4353a541-76b6-47e7-858a-5b37185223e4';

async function main() {
  const { supabase } = await connect('x');
  const call = async (fn: string, body: Record<string, unknown>) => {
    const r = await invoke(supabase, fn, { company_id: COMPANY, ...body });
    if (!r.ok) throw new Error(`${fn}.${body.method}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body as Record<string, unknown>;
  };

  const { data: coa } = await supabase.from('chart_of_accounts').select('id, name').eq('company_id', COMPANY);
  const account = (name: string) => {
    const hit = (coa ?? []).find((a) => String(a.name).trim().toLowerCase() === name.toLowerCase());
    if (!hit) throw new Error(`No account: ${name}`);
    return hit.id as string;
  };
  const bank = account('Bank - Current Account');
  const inventory = account('Inventory');
  // 5000 "Cost of Sales" is a blocked header account in this chart; the
  // postable cogs-role account is 5020 "Purchases".
  const cogs = account('Purchases');
  const salesGoods = account('Sales - Goods');
  const ar = account('Accounts Receivable (Trade Debtors)');
  const ap = account('Accounts Payable (Trade Creditors)');
  const vatOut = account('VAT Output (Payable)');
  const vatIn = account('VAT Input (Receivable)');
  const repairs = account('Repairs and Maintenance');
  const telephone = account('Telephone and Internet');

  // Tax rate (15% VAT)
  const taxRates = (await call('tax-rates', { method: 'GET' })) as unknown as Array<{ id: string; name: string; rate: number }>;
  const vat = taxRates.find((t) => Number(t.rate) === 15) ?? taxRates[0];
  if (!vat) throw new Error('No tax rate configured.');
  console.log(`tax rate: ${vat.name} ${vat.rate}%`);

  // 1. The widget must name its stock accounts before it may move stock.
  const products = (await call('products', { method: 'GET' })) as unknown as Array<Record<string, unknown>>;
  const widget = products.find((p) => p.id === WIDGET);
  if (!widget) throw new Error('CERT Widget not found');
  if (widget.inventory_asset_account_id !== inventory || widget.cogs_account_id !== cogs) {
    await call('products', {
      method: 'PUT',
      productId: WIDGET,
      productData: { inventory_asset_account_id: inventory, cogs_account_id: cogs, income_account_id: salesGoods, price: 1000 },
    });
    console.log('ok product accounts set (inventory / cogs / income)');
  } else {
    console.log('skip product accounts (already set)');
  }

  // 2. Vendor
  const vendors = (await call('vendors', { method: 'GET' })) as unknown as Array<{ id: string; name: string }>;
  let vendor = vendors.find((v) => v.name === 'Mzansi Trading Supplies (Pty) Ltd');
  if (!vendor) {
    vendor = (await call('vendors', {
      method: 'POST',
      vendorData: { name: 'Mzansi Trading Supplies (Pty) Ltd', email: 'accounts@mzansitrading.example' },
    })) as unknown as { id: string; name: string };
    console.log(`ok vendor created ${vendor.id}`);
  } else {
    console.log('skip vendor (exists)');
  }

  // 3. Receive stock (cash purchase, inventory sub-ledger movement)
  const register = (await call('inventory', { method: 'GET_REGISTER' })) as { rows?: Array<{ product_id: string; qty_on_hand?: number }> };
  const onHand = (register.rows ?? []).find((r) => r.product_id === WIDGET);
  const alreadyReceived = onHand && Number(onHand.qty_on_hand ?? 0) > 0;
  const invoicesNow = (await call('invoices', { method: 'GET_ALL' })) as unknown as Array<{ id: string; invoice_number: string; total_amount: number }>;
  const haveInv2 = invoicesNow.find((i) => i.invoice_number === 'INV-00002');
  const haveInv3 = invoicesNow.find((i) => i.invoice_number === 'INV-00003');
  if (!alreadyReceived && !haveInv2) {
    const rec = await call('inventory', {
      method: 'RECEIVE',
      productId: WIDGET,
      qty: 370,
      unitCost: 500,
      date: '2026-11-20',
      inventoryAccountId: inventory,
      offsetAccountId: bank,
      vendorId: vendor.id,
      description: 'Stock received from Mzansi Trading Supplies — 370 widgets at R500',
    });
    console.log('ok stock received', JSON.stringify(rec).slice(0, 120));
  } else {
    console.log('skip receive (stock already on hand or invoices posted)');
  }

  // 4. Invoices (December, one paid later, one left outstanding)
  const mkInvoice = async (num: string, date: string, due: string, qty: number) =>
    (await call('invoices', {
      method: 'CREATE_WITH_TIMESHEETS',
      invoiceData: {
        customer_id: CUSTOMER,
        invoice_date: date,
        due_date: due,
        invoice_number: num,
        accounts_receivable_id: ar,
        inventory_asset_account_id: inventory,
        tax_payable_account_id: vatOut,
        description: `Invoice ${num}`,
        p_items: [
          {
            product_id: WIDGET,
            description: 'CERT Widget',
            quantity: qty,
            unit_price: 1000,
            income_account_id: salesGoods,
            tax_rate_id: vat.id,
            project_id: null,
          },
        ],
      },
    })) as { id?: string };

  let inv2Id = haveInv2?.id;
  if (!haveInv2) {
    const r = await mkInvoice('INV-00002', '2026-12-05', '2027-01-05', 240);
    inv2Id = r.id;
    console.log(`ok INV-00002 posted (${inv2Id})`);
  } else console.log('skip INV-00002 (exists)');
  if (!haveInv3) {
    const r = await mkInvoice('INV-00003', '2026-12-18', '2027-01-18', 120);
    console.log(`ok INV-00003 posted (${r.id})`);
  } else console.log('skip INV-00003 (exists)');

  // 4b. The first run received the same delivery twice (the register guard
  // read the wrong field). Adjust the on-hand quantity back to what was
  // actually delivered less what was sold, the offset going back to bank.
  const productsNow = (await call('products', { method: 'GET' })) as unknown as Array<Record<string, unknown>>;
  const widgetNow = productsNow.find((p) => p.id === WIDGET);
  const qtyNow = Number(widgetNow?.quantity_on_hand ?? 0);
  if (qtyNow > 10) {
    const adj = await call('inventory', {
      method: 'ADJUST',
      productId: WIDGET,
      newQuantity: 10,
      adjustmentAccountId: bank,
      date: '2026-11-20',
      reason: 'Reversal of duplicated goods receipt (received twice in error)',
    });
    console.log('ok duplicate receipt adjusted out', JSON.stringify(adj).slice(0, 120));
  } else {
    console.log(`skip adjustment (on hand ${qtyNow})`);
  }

  // 5. Customer pays INV-00002 in full on 20 December
  if (inv2Id) {
    const settlement = (await call('payments', { method: 'GET_INVOICE_SETTLEMENT', invoice_id: inv2Id })) as {
      outstanding?: number;
      allocations?: unknown[];
    };
    const outstanding = Number(settlement.outstanding ?? NaN);
    if (Number.isNaN(outstanding) || outstanding > 0) {
      await call('payments', {
        method: 'RECORD_CUSTOMER_RECEIPT',
        customerId: CUSTOMER,
        amount: 276000,
        payment_date: '2026-12-20',
        deposit_account_id: bank,
        accounts_receivable_id: ar,
        allocations: [{ invoice_id: inv2Id, amount: 276000 }],
        description: 'Receipt — settlement of INV-00002',
      });
      console.log('ok receipt for INV-00002 recorded');
    } else console.log('skip receipt (INV-00002 settled)');
  }

  // 6. December supplier bills, unpaid at year end
  const bills = (await call('bills', { method: 'GET' })) as unknown as Array<{ bill_number: string }>;
  const mkBill = async (num: string, date: string, expenseId: string, amount: number, description: string) => {
    if ((bills ?? []).find((b) => b.bill_number === num)) {
      console.log(`skip bill ${num} (exists)`);
      return;
    }
    await call('bills', {
      method: 'POST',
      billData: {
        vendor_id: vendor!.id,
        bill_date: date,
        due_date: '2027-01-15',
        bill_number: num,
        accounts_payable_id: ap,
        tax_receivable_account_id: vatIn,
        description,
        p_items: [
          { product_id: null, quantity: 1, unit_cost: amount, expense_account_id: expenseId, tax_rate_id: vat.id, project_id: null },
        ],
      },
    });
    console.log(`ok bill ${num} posted`);
  };
  await mkBill('MZ-2026-118', '2026-12-10', repairs, 28000, 'Workshop service and repairs — December');
  await mkBill('MZ-2026-131', '2026-12-28', telephone, 6000, 'Connectivity — December');

  console.log('\ndone.');
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
