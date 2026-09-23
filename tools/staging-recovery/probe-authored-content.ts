/**
 * Prove that editing generated note content now persists.
 *
 * Before SAVE_AUTHORED_CONTENT, framework-composed narrative had no row, so the
 * save path sent a synthetic id to a handler matching on a uuid column and the
 * edit came back "Paragraph not found." This drives the real chain against the
 * live project: save into a note that was never assembled, read it back, edit it
 * again, and confirm the second save updates rather than duplicates.
 *
 *   npx tsx tools/staging-recovery/probe-authored-content.ts <company-id> <workspace-id>
 */
import { connect, invoke } from './edgeProbe';

const DISCLOSURE = 'DISC.PPE';

async function main() {
  const [companyId, workspaceId] = process.argv.slice(2);
  if (!companyId || !workspaceId) throw new Error('Pass the company id and workspace id.');
  const { supabase } = await connect();

  const call = async (method: string, extra: Record<string, unknown> = {}) => {
    const r = await invoke(supabase, 'financial-statements', {
      method,
      company_id: companyId,
      ...extra,
    });
    if (!r.ok) {
      console.log(`FAIL ${method} :: ${JSON.stringify(r.body).slice(0, 400)}`);
      throw new Error(`${method} failed`);
    }
    return r.body as Record<string, unknown>;
  };

  const stamp = new Date().toISOString();
  const first = `Probe wrote this at ${stamp}.`;

  console.log('— first save (the note may not exist yet) —');
  const a = await call('SAVE_AUTHORED_CONTENT', {
    workspace_id: workspaceId,
    disclosure_code: DISCLOSURE,
    note_title: 'Property, plant and equipment',
    content_kind: 'paragraph',
    content_code: 'PROBE1',
    body: first,
  });
  console.log(`  materialised=${a.materialised} instance=${a.disclosure_instance_id}`);

  console.log('— read back —');
  const list = (await call('LIST_DISCLOSURE_INSTANCES', { workspace_id: workspaceId })) as unknown as Array<{
    id: string;
    disclosure_code: string;
    efs_disclosure_paragraphs?: Array<{ id: string; paragraph_code: string; body: string }>;
  }>;
  const note = list.find((n) => n.disclosure_code === DISCLOSURE);
  const para = note?.efs_disclosure_paragraphs?.find((p) => p.paragraph_code === 'PROBE1');
  console.log(`  stored body: ${JSON.stringify(para?.body)}`);
  if (para?.body !== first) throw new Error('The first save did not persist.');

  console.log('— second save must update, not duplicate —');
  const second = `${first} Edited again.`;
  const b = await call('SAVE_AUTHORED_CONTENT', {
    workspace_id: workspaceId,
    disclosure_code: DISCLOSURE,
    content_kind: 'paragraph',
    content_code: 'PROBE1',
    body: second,
  });
  console.log(`  materialised=${b.materialised} (expected false)`);

  const list2 = (await call('LIST_DISCLOSURE_INSTANCES', { workspace_id: workspaceId })) as unknown as Array<{
    disclosure_code: string;
    efs_disclosure_paragraphs?: Array<{ paragraph_code: string; body: string }>;
  }>;
  const paras = (list2.find((n) => n.disclosure_code === DISCLOSURE)?.efs_disclosure_paragraphs || [])
    .filter((p) => p.paragraph_code === 'PROBE1');
  console.log(`  rows with code PROBE1: ${paras.length} (expected 1)`);
  console.log(`  stored body: ${JSON.stringify(paras[0]?.body)}`);

  const ok = paras.length === 1 && paras[0].body === second && b.materialised === false;
  console.log(ok ? '\nPASS — generated content is editable and persists.' : '\nFAIL');
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
