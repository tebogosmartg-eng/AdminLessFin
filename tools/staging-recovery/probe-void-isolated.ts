/**
 * Isolated test: does voiding a bill clear the supplier's outstanding balance?
 * Creates a dedicated supplier + bill, measures, voids, measures again, and
 * leaves everything in place so the journals can be inspected.
 */
import { connect, invoke, tech } from './edgeProbe';
const NL = String.fromCharCode(10);
const stamp = Date.now();

async function apBalance(s: Awaited<ReturnType<typeof connect>>['supabase'], companyId: string, vendorId: string) {
  const ap = await s.rpc('get_vendor_ap_balances', { p_company_id: companyId });
  return ((ap.data as Array<{ vendor_id: string; balance: number }>) ?? []).find((x) => x.vendor_id === vendorId)?.balance ?? 0;
}

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const company_id = company.id;

  const coa = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id });
  const accounts = (coa.body as Array<Record<string, unknown>>) ?? [];
  const apAcc = accounts.find((a) => a.account_role === 'trade_payable');
  const expAcc = accounts.find((a) => a.type === 'Expense' && a.allow_manual_posting !== false);
  console.log(`AP account: ${apAcc?.account_number} ${apAcc?.name}`);

  const vend = await invoke(s, 'vendors', {
    method: 'POST', company_id, vendorData: { name: `VOIDTEST ${stamp}`, email: 'voidtest@example.com' },
  });
  const vendorId = (vend.body as { id?: string } | null)?.id;
  if (!vendorId) { console.log(`VENDOR CREATE FAILED: ${vend.status} ${tech(vend)}`); return; }
  console.log(`vendor: ${vendorId}`);

  const billNumber = `VOIDTEST-${stamp}`;
  const made = await invoke(s, 'bills', {
    method: 'POST', company_id,
    billData: {
      vendor_id: vendorId, bill_date: '2026-08-22', due_date: '2026-09-22', bill_number: billNumber,
      accounts_payable_id: apAcc?.id, description: 'Void isolation test',
      p_items: [{ product_id: null, quantity: 1, unit_cost: 750, expense_account_id: expAcc?.id, tax_rate_id: null, project_id: null }],
    },
  });
  console.log(`bill create: ${made.status} ${made.ok ? 'ok' : tech(made)}`);

  const bill = await s.from('bills').select('*').eq('company_id', company_id).eq('bill_number', billNumber).maybeSingle();
  if (!bill.data) { console.log('BILL NOT FOUND AFTER CREATE — investigate'); return; }
  const b = bill.data as Record<string, unknown>;
  console.log(`bill row: id=${b.id} status=${b.status} total=${b.total_amount} je=${b.journal_entry_id}`);

  const beforeBal = await apBalance(s, company_id, vendorId);
  console.log(NL + `AP balance BEFORE void: ${beforeBal}`);

  const voided = await invoke(s, 'bills', { method: 'VOID', company_id, billId: b.id });
  console.log(`void: ${voided.status} ${voided.ok ? 'ok' : tech(voided)}`);

  const afterBal = await apBalance(s, company_id, vendorId);
  console.log(`AP balance AFTER  void: ${afterBal}`);
  console.log(afterBal === 0 ? 'PASS — voided bill no longer owed' : `INVESTIGATE — still ${afterBal}`);

  const billAfter = await s.from('bills').select('status').eq('id', b.id as string).maybeSingle();
  console.log(`bill status after void: ${(billAfter.data as { status?: string })?.status}`);

  console.log(NL + '=== JOURNALS FOR THIS VENDOR ===');
  const jes = await s.from('journal_entries').select('id, journal_number, description, vendor_id, bill_id').eq('vendor_id', vendorId);
  for (const j of jes.data ?? []) {
    console.log(`  ${j.journal_number} vendor_id=${j.vendor_id ? 'SET' : 'NULL'} bill_id=${j.bill_id ?? 'NULL'} :: ${j.description}`);
  }
  console.log(NL + '=== JOURNALS MENTIONING THE BILL NUMBER (any vendor_id) ===');
  const rel = await s.from('journal_entries').select('journal_number, description, vendor_id, bill_id')
    .eq('company_id', company_id).ilike('description', `%${billNumber}%`);
  for (const j of rel.data ?? []) {
    console.log(`  ${j.journal_number} vendor_id=${j.vendor_id ? 'SET' : 'NULL'} bill_id=${j.bill_id ?? 'NULL'} :: ${j.description}`);
  }
  console.log(NL + `(vendor ${vendorId} / bill ${b.id} left in place for inspection)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
