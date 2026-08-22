import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const vendors = await invoke(s, 'vendors', { method: 'GET', company_id });
  const list = (vendors.body as Array<Record<string, unknown>>) ?? [];
  const ap = await s.rpc('get_vendor_ap_balances', { p_company_id: company_id });
  const balances = (ap.data as Array<{ vendor_id: string; vendor_name: string; balance: number }>) ?? [];
  const owing = balances.filter((b) => Number(b.balance) !== 0);
  console.log('vendors with a balance:', JSON.stringify(owing));

  for (const b of owing.slice(0, 2)) {
    const r = await invoke(s, 'vendors', {
      method: 'GET_DETAILS', company_id, vendorId: b.vendor_id,
      date_from: '2020-01-01', date_to: new Date().toISOString().slice(0, 10),
    });
    if (!r.ok) { console.log(`${b.vendor_name}: FAIL ${tech(r)}`); continue; }
    const body = r.body as { statement?: unknown[]; opening_balance?: number; ageing?: Record<string, unknown> };
    console.log(`\n${b.vendor_name}`);
    console.log(`  ledger AP balance : ${b.balance}`);
    console.log(`  statement lines   : ${body.statement?.length}`);
    console.log(`  opening balance   : ${body.opening_balance}`);
    console.log(`  ageing            : ${JSON.stringify({ ...body.ageing, bills: undefined })}`);
    const bills = (body.ageing?.bills as Array<Record<string, unknown>>) ?? [];
    for (const bill of bills.slice(0, 5)) {
      console.log(`     ${bill.bill_number} due ${bill.due_date} overdue ${bill.days_overdue}d ${bill.outstanding} -> ${bill.bucket}`);
    }
    const total = Number(body.ageing?.total ?? 0);
    console.log(`  ageing total vs AP: ${total} vs ${b.balance} ${Math.abs(total - Number(b.balance)) < 0.01 ? 'MATCH' : 'DIFFERS (payments on account / older bills)'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
