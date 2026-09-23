/**
 * Run the disclosure engine against a real company's sealed facts and print
 * what it generates, so the tables can be read before anyone opens a browser.
 *
 *   npx tsx tools/staging-recovery/probe-disclosure-engine.ts <company-id>
 */
import { connect, invoke } from './edgeProbe';
import { AccountIndex } from '../../src/lib/financialStatements/disclosures/accountIndex';
import { generateDisclosures } from '../../src/lib/financialStatements/disclosures/definitions';
import { formatCellValue } from '../../src/lib/financialStatements/disclosures/format';

async function main() {
  const [companyId] = process.argv.slice(2);
  if (!companyId) throw new Error('Pass the company id.');
  const { supabase } = await connect();

  const call = async (method: string, extra: Record<string, unknown> = {}) => {
    const r = await invoke(supabase, 'financial-statements', { method, company_id: companyId, ...extra });
    if (!r.ok) throw new Error(`${method}: ${JSON.stringify(r.body).slice(0, 400)}`);
    return r.body as Record<string, unknown>;
  };

  const workspaces = (await call('LIST_WORKSPACES')) as unknown as Array<{ id: string }>;
  const workspaceId = workspaces?.[0]?.id;
  if (!workspaceId) throw new Error('This company has no financial statements yet.');
  console.log(`workspace ${workspaceId}`);

  // Build the statements so a sealed fact snapshot exists.
  const draft = (await call('CREATE_SNAPSHOT_DRAFT', { workspace_id: workspaceId })) as {
    version?: { id: string };
  };
  const versionId = draft.version?.id;
  await call('EXTRACT_FACT_SNAPSHOT', { snapshot_version_id: versionId, workspace_id: workspaceId });
  await call('CERTIFY_SNAPSHOT_VERSION', { snapshot_version_id: versionId });
  await call('GENERATE_STATEMENTS', { workspace_id: workspaceId, snapshot_version_id: versionId });

  const facts = await call('GET_FINANCIAL_FACTS', {
    snapshot_version_id: versionId,
    workspace_id: workspaceId,
  });

  const index = new AccountIndex(facts as never);
  console.log(`accounts in the snapshot: ${index.rows.length}`);
  console.log(`comparatives available: ${index.hasComparatives}`);

  const disclosures = generateDisclosures({
    index,
    currentLabel: 'FY2026',
    priorLabel: 'FY2025',
    withComparatives: index.hasComparatives,
  });

  console.log(`\ngenerated ${disclosures.length} disclosures\n`);
  for (const d of disclosures) {
    console.log(`── ${d.code} — ${d.title}`);
    console.log(`   ${d.reason}`);
    for (const t of d.tables) {
      console.log(`\n   [${t.code}] ${t.title}`);
      const head = t.columns.map((c) => c.label || '').map((s) => s.padStart(16));
      console.log('   ' + head.join(''));
      let linked = 0;
      let calculated = 0;
      let manual = 0;
      for (const row of t.rows) {
        const cells = row.cells.map((c, i) => {
          if (c.origin === 'linked') linked += 1;
          else if (c.origin === 'calculated') calculated += 1;
          else if (i > 0) manual += 1;
          const text = formatCellValue(c.value, c.format);
          return i === 0 ? String(text || '').padEnd(40) : text.padStart(16);
        });
        console.log('   ' + cells.join(''));
      }
      console.log(`   cells — linked ${linked}, calculated ${calculated}, to enter ${manual}`);
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
