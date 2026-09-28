/**
 * Remove disclosure content left behind by testing.
 *
 * Investigating the note editor meant adding tables and paragraphs in a company
 * with a real ledger. Those additions are not accounting entries, but they are
 * still content in someone's financial statements that nobody asked for, so
 * they come out again.
 *
 * Only two things are removed: a table still called "New table", which is the
 * name a table is given when it is created and which no one would leave, and a
 * paragraph with nothing written in it. Both go through the same delete the
 * product uses, so each removal is recorded against the engagement.
 *
 *   npx tsx tools/staging-recovery/remove-test-disclosure-content.ts <company-id> <workspace-id> [--apply]
 */
import { connect, invoke } from './edgeProbe';

type Row = { id: string; title?: string; body?: string; disclosure_code: string };

async function main() {
  const [companyId, workspaceId] = process.argv.slice(2);
  const apply = process.argv.includes('--apply');
  if (!companyId || !workspaceId) throw new Error('Pass the company id and the workspace id.');
  const { supabase } = await connect();

  const call = async (method: string, extra: Record<string, unknown> = {}) => {
    const r = await invoke(supabase, 'financial-statements', {
      method,
      company_id: companyId,
      ...extra,
    });
    if (!r.ok) throw new Error(`${method}: ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body;
  };

  const { data: instances, error } = await supabase
    .from('efs_disclosure_instances')
    .select('id, disclosure_code, efs_disclosure_tables(id, title), efs_disclosure_paragraphs(id, body)')
    .eq('workspace_id', workspaceId)
    .eq('company_id', companyId);
  if (error) throw error;

  const tables: Row[] = [];
  const paragraphs: Row[] = [];
  for (const inst of instances || []) {
    const i = inst as unknown as {
      disclosure_code: string;
      efs_disclosure_tables: Array<{ id: string; title: string }>;
      efs_disclosure_paragraphs: Array<{ id: string; body: string }>;
    };
    for (const t of i.efs_disclosure_tables || []) {
      if ((t.title || '').trim() === 'New table') {
        tables.push({ id: t.id, title: t.title, disclosure_code: i.disclosure_code });
      }
    }
    for (const p of i.efs_disclosure_paragraphs || []) {
      if (!(p.body || '').trim()) {
        paragraphs.push({ id: p.id, body: p.body, disclosure_code: i.disclosure_code });
      }
    }
  }

  if (tables.length === 0 && paragraphs.length === 0) {
    console.log('Nothing to remove.');
    return;
  }
  for (const t of tables) console.log(`  table      ${t.disclosure_code}  "${t.title}"  ${t.id}`);
  for (const p of paragraphs) console.log(`  paragraph  ${p.disclosure_code}  (empty)       ${p.id}`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to remove them.');
    return;
  }

  for (const t of tables) await call('DELETE_DISCLOSURE_TABLE', { table_id: t.id });
  for (const p of paragraphs) await call('DELETE_DISCLOSURE_PARAGRAPH', { paragraph_id: p.id });
  console.log(`\nRemoved ${tables.length} table(s) and ${paragraphs.length} empty paragraph(s).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
