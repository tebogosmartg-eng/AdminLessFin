/**
 * Time the framework-change chain against the live project.
 *   npx tsx tools/staging-recovery/probe-framework-switch.ts <company-id> <workspace-id>
 */
import { connect, invoke } from './edgeProbe';

async function main() {
  const [companyId, workspaceId] = process.argv.slice(2);
  if (!companyId || !workspaceId) throw new Error('Pass the company id and workspace id.');
  const { supabase } = await connect();

  const call = async (method: string, extra: Record<string, unknown> = {}) => {
    const t0 = Date.now();
    const r = await invoke(supabase, 'financial-statements', { method, company_id: companyId, ...extra });
    const ms = Date.now() - t0;
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${method} ${ms}ms${r.ok ? '' : ' :: ' + JSON.stringify(r.body).slice(0, 400)}`);
    return r;
  };

  const packs = (await call('LIST_FRAMEWORK_PACKS')).body as Array<{ id: string; framework_key: string }>;
  const grap = packs.find((p) => p.framework_key === 'GRAP')!;
  const sme = packs.find((p) => p.framework_key === 'IFRS_SME')!;

  for (const [name, pack] of [['GRAP', grap], ['IFRS_SME', sme]] as const) {
    console.log(`\n--- switching to ${name} ---`);
    const t0 = Date.now();
    await call('BIND_FRAMEWORK', { framework_pack_id: pack.id, workspace_id: workspaceId });
    await call('ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK', {
      workspace_id: workspaceId,
      framework_pack_id: pack.id,
    });
    await call('GENERATE_STATEMENTS', { workspace_id: workspaceId });
    console.log(`total ${Date.now() - t0}ms`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
