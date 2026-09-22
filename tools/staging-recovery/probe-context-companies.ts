/**
 * Lists the staging user's companies with their financial years (ids, names,
 * year codes, which is current). Read-only. Used to pick real companies for
 * tests/e2e/playwright/11-global-context.spec.ts.
 */
import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase, companies } = await connect();
  const sess = await invoke(supabase, 'user-session', { method: 'GET' });
  const active = (sess.body as any)?.activeCompany?.id;
  const out: any[] = [];
  for (const c of companies as any[]) {
    const years = await invoke(supabase, 'accounting', { method: 'GET_FINANCIAL_YEARS', company_id: c.id });
    const rows = (years.body as any[]) || [];
    out.push({
      id: c.id, name: c.name, role: c.user_role, tax_id: c.tax_id ?? null, active: c.id === active,
      years: rows.map((y) => `${y.year_code}${y.is_current ? '*' : ''}:${y.status}:${y.start_date}..${y.end_date}`),
    });
  }
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
