/**
 * Re-seal CERT TX's AFS workspace from accounting — the same call chain the
 * workspace dashboard's "Update from accounting" runs.
 *
 *   npx tsx tools/staging-recovery/cert-reseal.ts [workspace-id]
 */
import { connect, invoke } from './edgeProbe';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';
const WORKSPACE = process.argv[2] || '0d534936-3535-422c-b2c6-472da049451c';

async function main() {
  const { supabase } = await connect('x');
  const call = async (method: string, body: Record<string, unknown> = {}) => {
    const r = await invoke(supabase, 'financial-statements', { method, company_id: COMPANY, workspace_id: WORKSPACE, ...body });
    if (!r.ok) throw new Error(`${method}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body as Record<string, unknown>;
  };

  const draft = await call('CREATE_SNAPSHOT_DRAFT');
  const versionId = (draft as { version?: { id?: string }; snapshot_version?: { id?: string }; id?: string }).version?.id
    ?? (draft as { snapshot_version?: { id?: string } }).snapshot_version?.id
    ?? (draft as { id?: string }).id;
  console.log('draft version:', versionId ?? JSON.stringify(draft).slice(0, 200));

  const extract = await call('EXTRACT_FACT_SNAPSHOT', { snapshot_version_id: versionId });
  console.log('facts sealed:', JSON.stringify(extract).slice(0, 160));
  await call('CERTIFY_SNAPSHOT_VERSION', { snapshot_version_id: versionId });
  console.log('certified');
  await call('GENERATE_STATEMENTS', { snapshot_version_id: versionId });
  console.log('statements generated');
  const validation = await call('RUN_VALIDATION', { snapshot_version_id: versionId });
  console.log('validation:', JSON.stringify(validation).slice(0, 200));
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
