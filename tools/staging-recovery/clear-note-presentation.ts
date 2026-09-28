/**
 * Clear a note's leftover presentation: what was placed, and what was withheld.
 *
 * The browser test that proves reordering and removal work moves a paragraph,
 * hides another, and puts both back. A run that failed between those steps left
 * the property note in the demo company permanently rearranged, and one
 * paragraph permanently withheld — presentation, not accounting, but still a
 * change to a real company's document that nobody asked for. A withheld
 * paragraph also loses its move buttons, so the leftover does not merely look
 * wrong, it makes the note unworkable until it is cleared.
 *
 * Reads the presentation, drops the entries for one disclosure, writes it back.
 * Nothing else in the document is touched.
 *
 *   npx tsx tools/staging-recovery/clear-note-presentation.ts <company-id> <workspace-id> DISC.PPE [--apply]
 */
import { connect, invoke } from './edgeProbe';

type Presentation = {
  hidden?: Record<string, boolean>;
  order?: Record<string, number>;
  [key: string]: unknown;
};

async function main() {
  const [companyId, workspaceId, disclosure] = process.argv.slice(2);
  const apply = process.argv.includes('--apply');
  if (!companyId || !workspaceId || !disclosure) {
    throw new Error('Pass the company id, the workspace id and the disclosure code.');
  }
  const { supabase } = await connect();

  const call = async (method: string, extra: Record<string, unknown> = {}) => {
    const r = await invoke(supabase, 'financial-statements', {
      method,
      company_id: companyId,
      ...extra,
    });
    if (!r.ok) throw new Error(`${method}: ${JSON.stringify(r.body).slice(0, 400)}`);
    return r.body as Record<string, unknown>;
  };

  const read = await call('GET_DOCUMENT_PRESENTATION', { workspace_id: workspaceId });
  const overrides = (read.overrides || {}) as Presentation;
  const order = { ...(overrides.order || {}) };
  const hidden = { ...(overrides.hidden || {}) };

  const prefix = `${disclosure.toUpperCase()}:`;
  const placed = Object.keys(order).filter((k) => k.startsWith(prefix));
  const withheld = Object.keys(hidden).filter((k) => k.startsWith(prefix));

  if (placed.length === 0 && withheld.length === 0) {
    console.log(`Nothing to clear: no presentation recorded for ${disclosure}.`);
    return;
  }

  console.log(`Recorded for ${disclosure}:`);
  for (const key of placed) console.log(`  placed    ${key} = ${order[key]}`);
  for (const key of withheld) console.log(`  withheld  ${key} = ${hidden[key]}`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to remove them.');
    return;
  }

  for (const key of placed) delete order[key];
  for (const key of withheld) delete hidden[key];
  await call('SAVE_DOCUMENT_PRESENTATION', {
    workspace_id: workspaceId,
    overrides: { ...overrides, order, hidden, updatedAt: new Date().toISOString() },
  });
  console.log(
    `\nCleared ${placed.length} placement(s) and ${withheld.length} withheld entries. ` +
      `${disclosure} is back as the framework builds it.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
