import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const coa = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id });
  const accounts = (coa.body as Array<Record<string, unknown>>) ?? [];
  const byId = new Map(accounts.map((a) => [a.id as string, a]));
  const products = await invoke(s, 'products', { method: 'GET', company_id });
  const prods = (products.body as Array<Record<string, unknown>>) ?? [];

  // The Bill form's own option list.
  const expenseOptions = accounts.filter((a) => a.type === 'Expense');
  console.log(`Bill form expense options (type === 'Expense'): ${expenseOptions.length}`);
  console.log(`  ${expenseOptions.map((a) => a.name).join(', ')}\n`);

  for (const p of prods) {
    const cogsId = p.cogs_account_id as string | null;
    const incomeId = p.income_account_id as string | null;
    const cogsAcct = cogsId ? byId.get(cogsId) : null;
    const selectable = cogsId ? expenseOptions.some((a) => a.id === cogsId) : null;
    console.log(`${String(p.name).slice(0, 40).padEnd(42)} type=${String(p.type).padEnd(10)}`);
    console.log(`   income_account_id : ${incomeId ? `${byId.get(incomeId)?.name ?? 'MISSING FROM COA'}` : 'null'}`);
    console.log(`   cogs_account_id   : ${cogsId ? `${cogsAcct?.name ?? 'MISSING FROM COA'} (type=${cogsAcct?.type ?? '?'})` : 'null'}`);
    if (cogsId) {
      console.log(`   selectable in Bill form expense dropdown? ${selectable ? 'YES' : 'NO  <-- form would set a value the dropdown cannot show'}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
