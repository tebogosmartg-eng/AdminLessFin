/**
 * A set reopened for changes is a draft snapshot version with nothing sealed
 * on it. Its notes and policies must still read the sealed facts of the
 * version it reopened. Lists the company's draft versions with a
 * predecessor, and asks GET_FINANCIAL_FACTS for each.
 *
 *   npx tsx tools/staging-recovery/probe-draft-facts.ts "CERT TX"
 */
import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase, company } = await connect(process.argv[2] || 'CERT TX');
  console.log(`company: ${company.name}  ${company.id}`);
  const { data: versions, error } = await supabase
    .from('efs_snapshot_versions')
    .select('id, status, version_no, predecessor_id')
    .eq('company_id', company.id)
    .order('version_no', { ascending: false })
    .limit(20);
  if (error) throw error;
  for (const v of versions || []) {
    const r = await invoke(supabase, 'financial-statements', {
      method: 'GET_FINANCIAL_FACTS',
      company_id: company.id,
      snapshot_version_id: v.id,
    });
    const b = r.body as { version_status?: string; sealed_version_id?: string; fixed_asset_register?: unknown[] } | null;
    console.log(
      `v${v.version_no} ${v.status.padEnd(17)} pred=${v.predecessor_id ? 'yes' : 'no '} -> ${
        r.ok ? `facts from ${b?.sealed_version_id === v.id ? 'itself' : `predecessor ${b?.sealed_version_id}`}, register=${b?.fixed_asset_register?.length ?? 'n/a'}` : `refused: ${JSON.stringify(r.body).slice(0, 120)}`
      }`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
