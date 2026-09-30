/**
 * List a company's AFS workspaces with their reporting periods — the ids the
 * other staging-recovery tools ask for on their command line.
 *
 *   npx tsx tools/staging-recovery/probe-afs-workspaces.ts "Spaceman"
 */
import { connect, invoke } from './edgeProbe';

async function main() {
  const target = process.argv[2] || 'Spaceman';
  const { supabase, company } = await connect(target);
  console.log(`company: ${company.name}  ${company.id}`);
  const r = await invoke(supabase, 'financial-statements', {
    method: 'LIST_WORKSPACES',
    company_id: company.id,
  });
  if (!r.ok) {
    console.log('LIST_WORKSPACES failed:', r.status, JSON.stringify(r.body).slice(0, 400));
    return;
  }
  const list = (r.body as { workspaces?: unknown[] })?.workspaces ?? r.body;
  for (const w of (list as Array<Record<string, unknown>>) || []) {
    console.log(
      `workspace: ${w.id}  status=${w.status}  period=${JSON.stringify(
        (w as { reporting_period?: { period_key?: string; label?: string } }).reporting_period?.period_key ??
          (w as { period_key?: string }).period_key ??
          w.name ??
          '',
      )}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
