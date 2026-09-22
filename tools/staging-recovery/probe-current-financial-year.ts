/**
 * Does every surface agree which financial year is current?
 *
 * Read-only. `financial_years` has no is_active column, so the current year was
 * inferred separately by the frontend and by the edge functions, with rules
 * that were not equivalent. It is now decided once by financial_year_current()
 * and carried on the row as is_current. This checks every surface reports the
 * same year.
 *
 *   npx tsx tools/staging-recovery/probe-current-financial-year.ts
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
let agree = 0;
const conflicts: string[] = [];

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');

  for (const co of companies) {
    await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

    const [years, ctx, dash] = await Promise.all([
      invoke(api, 'accounting', { method: 'GET_FINANCIAL_YEARS', company_id: co.id }),
      invoke(api, 'accounting', { method: 'GET_ENTERPRISE_CONTEXT', company_id: co.id }),
      invoke(api, 'accounting', { method: 'GET_ACCOUNTING_DASHBOARD', company_id: co.id }),
    ]);

    const rows = (Array.isArray(years.body) ? years.body : []) as Array<{
      id: string; year_code: string; start_date: string; end_date: string; status: string; is_current?: boolean;
    }>;
    if (!rows.length) {
      console.log(`${co.name.slice(0, 28).padEnd(30)} no financial year`);
      continue;
    }

    const flagged = rows.filter((y) => y.is_current);
    const ctxYear = (ctx.body as { current_financial_year?: { id?: string; year_code?: string } } | null)
      ?.current_financial_year;
    const dashYear = (dash.body as { context?: { currentYear?: { id?: string; year_code?: string } } } | null)
      ?.context?.currentYear
      ?? (dash.body as { currentYear?: { id?: string; year_code?: string } } | null)?.currentYear;

    const openContainingToday = rows.filter((y) => {
      const today = new Date().toISOString().slice(0, 10);
      return ['open', 'reopened'].includes(y.status) && y.start_date <= today && today <= y.end_date;
    }).length;

    const label = co.name.slice(0, 28).padEnd(30);
    if (flagged.length !== 1) {
      conflicts.push(`${co.name}: ${flagged.length} years flagged is_current`);
      console.log(`${label} FLAGGED ${flagged.length}  ${years.ok ? '' : tech(years)}`);
      continue;
    }

    const flaggedYear = flagged[0];
    const ctxMatches = !ctxYear || ctxYear.id === flaggedYear.id;
    const dashMatches = !dashYear || dashYear.id === flaggedYear.id;
    if (ctxMatches && dashMatches) agree++;
    else {
      conflicts.push(
        `${co.name}: list says ${flaggedYear.year_code}, ` +
        `context says ${ctxYear?.year_code ?? 'n/a'}, dashboard says ${dashYear?.year_code ?? 'n/a'}`,
      );
    }

    console.log(
      `${label} current=${String(flaggedYear.year_code).padEnd(8)}` +
      ` ${flaggedYear.start_date}..${flaggedYear.end_date}` +
      ` openContainingToday=${openContainingToday}` +
      ` ${ctxMatches && dashMatches ? 'all agree' : 'DISAGREE'}`,
    );
  }

  console.log(`${NL}${agree} companies where every surface names the same year`);
  if (conflicts.length) {
    console.log('conflicts:');
    conflicts.forEach((c) => console.log(`  - ${c}`));
  } else {
    console.log('no conflicts');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
