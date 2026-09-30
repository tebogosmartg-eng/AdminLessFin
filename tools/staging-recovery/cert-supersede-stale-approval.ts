/**
 * One-off: the CERT TX review was approved before "reopen supersedes the
 * approval" existed, so the reopened draft still shows it approved. Finalise
 * and reopen through the product's own actions: the reopen now supersedes the
 * stale review, and the next review starts from draft.
 *
 *   npx tsx tools/staging-recovery/cert-supersede-stale-approval.ts
 */
import { connect, invoke } from './edgeProbe';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';
const WORKSPACE = '0d534936-3535-422c-b2c6-472da049451c';

async function main() {
  const { supabase } = await connect('x');
  const call = async (method: string, body: Record<string, unknown> = {}) => {
    const r = await invoke(supabase, 'financial-statements', { method, company_id: COMPANY, workspace_id: WORKSPACE, ...body });
    if (!r.ok) throw new Error(`${method}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body as Record<string, unknown>;
  };
  const dash = (await call('GET_WORKSPACE_DASHBOARD')) as { snapshot?: { currentVersion?: { id?: string; status?: string } } };
  const version = dash.snapshot?.currentVersion;
  if (version?.status !== 'frozen') {
    await call('FREEZE_SNAPSHOT_VERSION', { snapshot_version_id: version?.id });
    console.log('finalised', version?.id);
  }
  await call('CREATE_SNAPSHOT_DRAFT', { force_successor: true });
  console.log('reopened');
  const review = (await call('GET_REVIEW_DASHBOARD')) as { review?: { stage?: string } | null };
  console.log('open review after reopen:', review.review ? review.review.stage : 'none (superseded)');
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
