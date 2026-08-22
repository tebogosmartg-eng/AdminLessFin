/**
 * Did the backfill repair reversals posted before the attribution fix?
 * The vendor from the pre-fix reproduction (011dffd2) had a voided R750 bill
 * whose reversal carried no vendor_id, so the supplier still showed 750 owing.
 */
import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);

async function main() {
  const { supabase: s, company } = await connect('Spaceman');

  console.log('=== reversals still lacking party attribution ===');
  const rev = await s.from('posting_requests').select('journal_entry_id, reversal_of_id')
    .eq('company_id', company.id).not('reversal_of_id', 'is', null);
  const ids = (rev.data ?? []).map((r) => r.journal_entry_id).filter(Boolean) as string[];
  let unattributed = 0;
  let attributed = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const je = await s.from('journal_entries').select('id, journal_number, vendor_id, customer_id')
      .in('id', ids.slice(i, i + 100));
    for (const j of je.data ?? []) {
      if (!j.vendor_id && !j.customer_id) unattributed++; else attributed++;
    }
  }
  console.log(`  posting-engine reversals: ${ids.length}  attributed=${attributed}  unattributed=${unattributed}`);
  console.log('  (unattributed is expected only where the SOURCE journal had no party either)');

  console.log(NL + '=== the pre-fix reproduction vendor ===');
  const v = await s.from('vendors').select('id, name').eq('company_id', company.id)
    .ilike('name', 'VOIDTEST%').order('created_at');
  const ap = await s.rpc('get_vendor_ap_balances', { p_company_id: company.id });
  const rows = (ap.data as Array<{ vendor_id: string; vendor_name: string; balance: number }>) ?? [];
  for (const vend of v.data ?? []) {
    const bal = rows.find((r) => r.vendor_id === vend.id)?.balance ?? 0;
    console.log(`  ${vend.name}: balance=${bal} ${bal === 0 ? 'PASS (void cleared)' : 'STILL OWING'}`);
  }

  console.log(NL + '=== ledger integrity ===');
  const jes = await s.from('journal_entries').select('id').eq('company_id', company.id);
  const jids = (jes.data ?? []).map((j) => j.id);
  let dr = 0;
  let cr = 0;
  for (let i = 0; i < jids.length; i += 200) {
    const it = await s.from('journal_entry_items').select('type, amount').in('journal_entry_id', jids.slice(i, i + 200));
    for (const x of it.data ?? []) {
      const c = Math.round(Number(x.amount) * 100);
      if (x.type === 'debit') dr += c; else cr += c;
    }
  }
  console.log(`  debits=${dr}c credits=${cr}c diff=${dr - cr}c ${dr === cr ? 'PASS' : 'FAIL'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
