/**
 * List the preparer's recorded on/off choices (DocOverrides.include) for a
 * company's AFS workspaces; with `--clear <key>` forget one, handing that
 * note or policy back to the engine's default. Writes through the product's
 * own SAVE_DOCUMENT_PRESENTATION, so it is audited like any edit.
 *
 *   npx tsx tools/staging-recovery/presentation-include-choices.ts "CERT TX 1785231635647"
 *   npx tsx tools/staging-recovery/presentation-include-choices.ts "CERT TX 1785231635647" --clear note:DISC.GENERAL
 */
import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase, company } = await connect(process.argv[2]);
  const at = process.argv.indexOf('--clear');
  const clear = at > 0 ? process.argv[at + 1] : null;
  console.log(`company: ${company.name}  ${company.id}`);
  const ws = await invoke(supabase, 'financial-statements', { method: 'LIST_WORKSPACES', company_id: company.id });
  const list = ((ws.body as { workspaces?: unknown[] })?.workspaces ?? ws.body) as Array<{ id: string; name?: string }>;
  for (const w of list || []) {
    const r = await invoke(supabase, 'financial-statements', {
      method: 'GET_DOCUMENT_PRESENTATION',
      company_id: company.id,
      workspace_id: w.id,
    });
    const overrides = (r.body as { overrides?: Record<string, unknown> })?.overrides;
    const include = (overrides?.include || {}) as Record<string, boolean>;
    console.log(`workspace ${w.id} ${w.name ?? ''}: ${JSON.stringify(include)}`);
    if (clear && clear in include && overrides) {
      const next = { ...include };
      delete next[clear];
      const saved = await invoke(supabase, 'financial-statements', {
        method: 'SAVE_DOCUMENT_PRESENTATION',
        company_id: company.id,
        workspace_id: w.id,
        overrides: { ...overrides, include: next },
      });
      console.log(saved.ok ? `  cleared ${clear}` : `  refused: ${JSON.stringify(saved.body).slice(0, 200)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
