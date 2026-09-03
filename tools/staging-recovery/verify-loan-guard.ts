/**
 * The guard must refuse a trade control account, accept a proper liability
 * account, and leave the existing mis-mapped loan untouched.
 */
import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const sp = companies.find((c) => c.name === 'Spaceman')!;
  const coa = await s.from('chart_of_accounts').select('id, account_number, name, account_role')
    .eq('company_id', sp.id).eq('type', 'Liability');
  const ap = (coa.data ?? []).find((a) => a.account_role === 'trade_payable')!;
  const ok = (coa.data ?? []).find((a) => !a.account_role)!;
  const lender = await s.from('vendors').select('id').eq('company_id', sp.id).limit(1).maybeSingle();

  const attempt = async (label: string, accountId: string) => {
    const r = await s.from('loans').insert({
      company_id: sp.id, lender_id: lender.data!.id, principal_amount: 1000,
      interest_rate: 10, term_months: 12, repayment_frequency: 'monthly',
      start_date: '2026-09-03', status: 'active', liability_account_id: accountId,
    }).select('id').maybeSingle();
    if (r.error) { console.log(`  ${label}: REFUSED -> ${r.error.message.slice(0, 140)}`); return null; }
    console.log(`  ${label}: ACCEPTED (id ${r.data!.id})`);
    return r.data!.id as string;
  };

  console.log('=== GUARD ===');
  await attempt(`trade control account ${ap.account_number} ${ap.name}`, ap.id);
  const good = await attempt(`ordinary liability ${ok.account_number} ${ok.name}`, ok.id);
  if (good) {
    const moved = await s.from('loans').update({ liability_account_id: ap.id }).eq('id', good);
    console.log(`  moving that loan ONTO the control account: ${moved.error ? 'REFUSED -> ' + moved.error.message.slice(0, 120) : 'ACCEPTED (BAD)'}`);
    await s.from('loans').delete().eq('id', good);
    console.log('  probe loan removed');
  }

  console.log(NL + '=== EXISTING LOAN UNTOUCHED ===');
  const existing = await s.from('loans').select('id, principal_amount, liability_account_id').eq('company_id', sp.id);
  for (const l of existing.data ?? []) {
    const acc = (coa.data ?? []).find((a) => a.id === l.liability_account_id);
    console.log(`  loan ${l.id.slice(0, 8)} R${l.principal_amount} -> ${acc?.account_number} ${acc?.name} (still as it was)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
