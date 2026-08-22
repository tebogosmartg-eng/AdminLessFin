import { connect } from './edgeProbe';
async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const imports = await s.from('bank_statement_imports').select('id, file_name')
    .eq('company_id', company.id).like('file_name', 'SR-STATEMENT-%');
  console.log(`probe imports: ${imports.data?.length ?? 0} ${imports.error?.message ?? ''}`);
  for (const imp of imports.data ?? []) {
    const dl = await s.from('bank_statement_lines').delete().eq('statement_import_id', imp.id);
    const di = await s.from('bank_statement_imports').delete().eq('id', imp.id);
    console.log(`  ${imp.file_name}: lines ${dl.error ? 'ERR ' + dl.error.message : 'deleted'}, import ${di.error ? 'ERR ' + di.error.message : 'deleted'}`);
  }
  const left = await s.from('bank_statement_lines').select('id', { count: 'exact', head: true }).eq('company_id', company.id);
  console.log(`statement lines remaining: ${left.count}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
