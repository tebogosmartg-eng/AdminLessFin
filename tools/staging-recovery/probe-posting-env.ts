import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);
async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const per = await s.from('accounting_periods').select('*').eq('id', 'f4e2c1e8-ad4d-4d9b-aedc-90c2dc777b53').maybeSingle();
  console.log('=== PERIOD OF JE-000017 ===');
  if (per.error) console.log('  err ' + per.error.message);
  for (const k of Object.keys(per.data ?? {})) console.log(`  ${k}: ${JSON.stringify((per.data as Record<string, unknown>)[k])}`);

  const fy = await s.from('financial_years').select('*').eq('id', '5cc2035d-d408-4ca0-b505-a045a1102395').maybeSingle();
  console.log(NL + '=== FINANCIAL YEAR ===');
  for (const k of Object.keys(fy.data ?? {})) console.log(`  ${k}: ${JSON.stringify((fy.data as Record<string, unknown>)[k])}`);

  console.log(NL + '=== ALL PERIODS (company) ===');
  const all = await s.from('accounting_periods').select('*').eq('company_id', company.id).order('start_date');
  for (const p of all.data ?? []) {
    const rec = p as Record<string, unknown>;
    console.log(`  ${rec.start_date} -> ${rec.end_date}  status=${rec.status} closed=${rec.is_closed ?? 'n/a'}`);
  }

  console.log(NL + '=== LOANS ===');
  const loans = await s.from('loans').select('*').eq('company_id', company.id);
  for (const l of loans.data ?? []) {
    const rec = l as Record<string, unknown>;
    console.log('  ' + JSON.stringify(rec));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
