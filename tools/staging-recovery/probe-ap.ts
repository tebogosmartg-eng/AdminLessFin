import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const bills = await invoke(s, 'bills', { method: 'GET', company_id });
  const rows = (bills.body as Array<Record<string, unknown>>) ?? [];
  const byStatus: Record<string, number> = {};
  for (const b of rows) byStatus[String(b.status)] = (byStatus[String(b.status)] ?? 0) + 1;
  console.log('bills by status:', JSON.stringify(byStatus));
  console.log('sample bill fields:', Object.keys(rows[0] ?? {}).join(', '));
  console.log('sample:', JSON.stringify(rows.find((b) => b.status === 'open') ?? rows[0]).slice(0, 400));

  const rpc = await s.rpc('get_vendor_ap_balances', { p_company_id: company_id });
  console.log(`\nget_vendor_ap_balances: ${rpc.error ? 'ERR ' + rpc.error.message : `${rpc.data?.length} rows`}`);
  if (rpc.data?.length) console.log('  ', JSON.stringify(rpc.data[0]));

  // Ground truth: outstanding AP per vendor straight from the ledger.
  const ap = await s.from('chart_of_accounts').select('id, name')
    .eq('company_id', company_id).eq('account_role', 'trade_payable');
  console.log('\ntrade_payable accounts:', JSON.stringify(ap.data));
}
main().catch((e) => { console.error(e); process.exit(1); });
