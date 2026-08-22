import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const year = new Date().getUTCFullYear();
  const period = { start_date: `${year - 2}-01-01`, end_date: `${year}-12-31` };

  const coa = await s.functions.invoke('chart-of-accounts', { body: { method: 'GET', company_id } });
  const ar = ((coa.data as Array<{ id: string; name: string }>) ?? []).find((a) => a.name === 'AR');

  const act = await invoke(s, 'accounting', {
    method: 'GET_ACCOUNT_ACTIVITY_WORKSPACE', company_id, account_id: ar?.id, ...period,
  });
  const b = act.body as Record<string, unknown>;
  console.log('ACCOUNT ACTIVITY  total=', b.total, ' activities=', (b.activities as unknown[])?.length);
  console.log('  header:', JSON.stringify(b.header).slice(0, 260));
  console.log('  first activity:', JSON.stringify((b.activities as unknown[])?.[0]).slice(0, 400));

  const audit = await invoke(s, 'audit-logs', { method: 'GET', company_id });
  const rows = audit.body as Array<Record<string, unknown>>;
  console.log('\nAUDIT rows=', rows.length);
  console.log('  keys:', Object.keys(rows[0] ?? {}).join(','));
  console.log('  first:', JSON.stringify(rows[0]).slice(0, 400));

  const tx = await invoke(s, 'banking', { method: 'GET_TRANSACTIONS', company_id });
  const txr = tx.body as Array<Record<string, unknown>>;
  console.log('\nBANK TX rows=', txr.length, 'keys:', Object.keys(txr[0] ?? {}).join(','));
  console.log('  first:', JSON.stringify(txr[0]).slice(0, 320));
}
main().catch((e) => { console.error(e); process.exit(1); });
