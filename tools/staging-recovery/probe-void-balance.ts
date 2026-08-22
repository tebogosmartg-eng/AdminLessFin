/**
 * Does voiding a bill actually clear the supplier's outstanding balance?
 * Inspects the journals behind the closure-suite vendor.
 */
import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const v = await s.from('vendors').select('id, name').eq('company_id', company.id).ilike('name', 'CLOSURE Supplier%').maybeSingle();
  if (!v.data) { console.log('closure vendor not found'); return; }
  console.log(`vendor ${v.data.name} ${v.data.id}`);

  const bills = await s.from('bills').select('*').eq('vendor_id', v.data.id);
  console.log(NL + '=== BILLS ===');
  for (const b of bills.data ?? []) {
    const rec = b as Record<string, unknown>;
    console.log(`  ${rec.bill_number} status=${rec.status} total=${rec.total_amount} je=${rec.journal_entry_id}`);
  }

  console.log(NL + '=== JOURNALS CARRYING THIS VENDOR ===');
  const jes = await s.from('journal_entries').select('id, journal_number, entry_date, description, vendor_id').eq('vendor_id', v.data.id);
  for (const j of jes.data ?? []) {
    const it = await s.from('journal_entry_items')
      .select('type, amount, account_id, chart_of_accounts ( account_number, name, account_role )')
      .eq('journal_entry_id', j.id);
    console.log(`  ${j.journal_number} ${j.entry_date} ${j.description}`);
    for (const x of it.data ?? []) {
      const a = (x as unknown as { chart_of_accounts: { account_number: number; name: string; account_role: string | null } }).chart_of_accounts;
      console.log(`      ${x.type.padEnd(6)} ${String(x.amount).padStart(10)}  ${a?.account_number} ${a?.name} ${a?.account_role ?? ''}`);
    }
  }

  console.log(NL + '=== ALL JOURNALS MENTIONING THE VOIDED BILL (any vendor_id) ===');
  const voided = (bills.data ?? []).find((b) => String((b as Record<string, unknown>).status).toLowerCase() === 'void'
    || String((b as Record<string, unknown>).status).toLowerCase() === 'voided');
  const num = voided ? String((voided as Record<string, unknown>).bill_number) : 'CLOSURE-POBILL';
  const rel = await s.from('journal_entries').select('id, journal_number, description, vendor_id, bill_id')
    .eq('company_id', company.id).ilike('description', `%${num}%`);
  for (const j of rel.data ?? []) {
    console.log(`  ${j.journal_number} vendor_id=${j.vendor_id ?? 'NULL'} bill_id=${j.bill_id ?? 'NULL'} :: ${j.description}`);
  }

  console.log(NL + '=== RPC BALANCE ===');
  const ap = await s.rpc('get_vendor_ap_balances', { p_company_id: company.id });
  const row = ((ap.data as Array<{ vendor_id: string; vendor_name: string; balance: number }>) ?? []).find((x) => x.vendor_id === v.data!.id);
  console.log(`  ${row?.vendor_name} balance=${row?.balance}`);
  console.log(NL + '  (get_vendor_ap_balances only counts journal lines whose journal_entries.vendor_id is set)');
}
main().catch((e) => { console.error(e); process.exit(1); });
