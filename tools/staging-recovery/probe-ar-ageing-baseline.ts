import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  console.log('=== DOES get_aged_receivables EXIST? ===');
  const probe = await s.rpc('get_aged_receivables', { p_company_id: companies[1].id });
  console.log(`  ${probe.error ? 'ERROR: ' + probe.error.message : 'CALLABLE, rows=' + ((probe.data as unknown[])?.length ?? 0)}`);

  console.log(NL + '=== AR CONTROL vs SUB-LEDGER, ALL COMPANIES ===');
  for (const co of companies) {
    const ar = await s.from('chart_of_accounts').select('id, account_number, name')
      .eq('company_id', co.id).eq('type', 'Asset').eq('account_role', 'trade_receivable');
    const ids = (ar.data ?? []).map((a) => a.id);
    if (!ids.length) { console.log(`  ${co.name.padEnd(30)} no AR control account`); continue; }
    let gl = 0; let attributed = 0; let unattributed = 0;
    for (let from = 0; ; from += 1000) {
      const page = await s.from('journal_entry_items')
        .select('amount, type, journal_entries!inner ( company_id, customer_id )')
        .in('account_id', ids).eq('journal_entries.company_id', co.id).range(from, from + 999);
      if (page.error) { console.log('   err ' + page.error.message); break; }
      const rows = page.data ?? [];
      for (const m of rows) {
        const signed = m.type === 'debit' ? c(m.amount) : -c(m.amount);
        gl += signed;
        const cid = (m as unknown as { journal_entries: { customer_id: string | null } }).journal_entries.customer_id;
        if (cid) attributed += signed; else unattributed += signed;
      }
      if (rows.length < 1000) break;
    }
    const bal = await s.rpc('get_customer_ar_balances', { p_company_id: co.id });
    const sub = ((bal.data as Array<{ balance: number }>) ?? []).reduce((t, v) => t + c(v.balance), 0);
    console.log(`  ${co.name.padEnd(30)} GL=${R(gl).padStart(12)} attributed=${R(attributed).padStart(12)} ` +
      `unattributed=${R(unattributed).padStart(10)} subledger=${R(sub).padStart(12)} ${sub === attributed ? 'AGREE' : 'DIFFER'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
