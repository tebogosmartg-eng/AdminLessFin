import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;

  const r = await invoke(s, 'accounting', {
    method: 'GET_ACCOUNTING_AUDIT', company_id, page: 1, page_size: 50, table_name: 'all',
  });
  const b = r.body as { rows?: Array<Record<string, unknown>>; total?: number };
  console.log(`GET_ACCOUNTING_AUDIT status=${r.status} total=${b?.total} rows=${b?.rows?.length} ${tech(r)}`);
  if (b?.rows?.[0]) console.log('  sample:', JSON.stringify(b.rows[0]).slice(0, 260));

  // What tables does the page's filter list vs what actually has audit rows?
  const all = await s.from('audit_logs').select('table_name').eq('company_id', company_id).limit(1000);
  const counts: Record<string, number> = {};
  for (const row of all.data ?? []) counts[row.table_name] = (counts[row.table_name] ?? 0) + 1;
  console.log('\naudit rows by table (whole company):');
  for (const [t, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`   ${String(c).padStart(4)}  ${t}`);

  const PAGE_FILTER = ['journal_entries','journal_entry_items','posting_requests','chart_of_accounts','financial_years','accounting_periods'];
  const shown = Object.entries(counts).filter(([t]) => PAGE_FILTER.includes(t)).reduce((a, [, c]) => a + c, 0);
  const hidden = Object.entries(counts).filter(([t]) => !PAGE_FILTER.includes(t));
  console.log(`\nvisible on the Audit Trail page : ${shown}`);
  console.log(`hidden by its table filter      : ${hidden.reduce((a, [, c]) => a + c, 0)} across ${hidden.length} tables`);
  console.log(`   hidden tables: ${hidden.map(([t, c]) => `${t}(${c})`).join(', ')}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
