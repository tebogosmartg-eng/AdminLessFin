import { connect } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const cid = company.id;

  const ambiguous = await s.from('journal_entries')
    .select('id, financial_years ( year_code )').eq('company_id', cid).limit(1);
  console.log('ambiguous  :', ambiguous.error ? `${ambiguous.error.code} ${ambiguous.error.message}` : 'OK');

  const hinted = await s.from('journal_entries')
    .select('id, financial_years!journal_entries_financial_year_id_fkey ( year_code )')
    .eq('company_id', cid).limit(1);
  console.log('hinted     :', hinted.error ? `${hinted.error.code} ${hinted.error.message}` : `OK ${JSON.stringify(hinted.data)}`);

  // The full Account Activity shape, hinted.
  const full = await s.from('journal_entries')
    .select(`
      id, entry_date, description, journal_number, vendor_id, customer_id, attachment_url,
      financial_year_id, accounting_period_id, created_at,
      vendors ( name ), customers ( name ),
      posting_requests!journal_entry_id ( id, module, document_type, document_id, status, source, created_by, reference, committed_at ),
      accounting_periods ( period_number ),
      financial_years!journal_entries_financial_year_id_fkey ( year_code )
    `).eq('company_id', cid).limit(2);
  console.log('full shape :', full.error ? `${full.error.code} ${full.error.message}` : `OK ${full.data?.length} rows`);
  if (full.data?.[0]) console.log('  sample:', JSON.stringify(full.data[0]).slice(0, 300));
}
main().catch((e) => { console.error(e); process.exit(1); });
