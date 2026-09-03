import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);
async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  console.log('=== LOANS MAPPED TO A TRADE CONTROL ACCOUNT ===');
  for (const co of companies) {
    const loans = await s.from('loans').select('id, principal_amount, status, liability_account_id').eq('company_id', co.id);
    if (!(loans.data ?? []).length) continue;
    const coa = await s.from('chart_of_accounts')
      .select('id, account_number, name, type, account_role').eq('company_id', co.id);
    const byId = new Map((coa.data ?? []).map((a) => [a.id, a]));
    for (const l of loans.data ?? []) {
      const acc = byId.get(l.liability_account_id);
      const bad = acc && ['trade_payable', 'trade_receivable'].includes(String(acc.account_role));
      console.log(`  ${co.name} loan ${l.id.slice(0, 8)} R${l.principal_amount} -> ` +
        `${acc?.account_number} ${acc?.name} [${acc?.type}/${acc?.account_role ?? 'no role'}] ${bad ? '<< TRADE CONTROL ACCOUNT' : 'ok'}`);
    }
  }
  console.log(NL + '=== ACCOUNTS AVAILABLE FOR A LOAN LIABILITY (Spaceman) ===');
  const sp = companies.find((c) => c.name === 'Spaceman')!;
  const coa = await s.from('chart_of_accounts')
    .select('account_number, name, type, account_role, category')
    .eq('company_id', sp.id).eq('type', 'Liability').order('account_number');
  for (const a of coa.data ?? []) {
    console.log(`  ${a.account_number} ${String(a.name).padEnd(26)} ${a.category ?? '-'} role=${a.account_role ?? 'none'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
