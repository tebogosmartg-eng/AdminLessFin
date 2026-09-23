/**
 * Drive a Financial Statements engagement end to end against the live project
 * and print the Statement of Financial Position and Financial Performance it
 * produces, so the detail can be read against the trial balance.
 *
 *   npx tsx tools/staging-recovery/probe-statement-detail.ts <company-id>
 */
import { connect, invoke } from './edgeProbe';

type Line = {
  line_code: string;
  label: string;
  section: string;
  level?: number;
  amount: number | null;
  prior_amount?: number | null;
  is_header?: boolean;
  is_subtotal?: boolean;
  is_total?: boolean;
  is_grand_total?: boolean;
  is_reconciling?: boolean;
  accounts?: Array<{ name?: string; amount: number }>;
};

function money(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function render(title: string, lines: Line[]): void {
  console.log(`\n=== ${title} ===`);
  for (const l of lines) {
    const indent = '  '.repeat(l.level ?? 0);
    const marker = l.is_reconciling ? ' <-- RECONCILING' : '';
    const label = `${indent}${l.label}`;
    const amt = l.is_header ? '' : money(l.amount);
    const prior = l.prior_amount != null ? money(l.prior_amount) : '';
    console.log(`${label.padEnd(52)}${amt.padStart(16)}${prior.padStart(16)}${marker}`);
  }
}

async function main() {
  const companyId = process.argv[2];
  if (!companyId) throw new Error('Pass the company id.');
  const { supabase } = await connect();

  const step = async (method: string, extra: Record<string, unknown> = {}) => {
    const r = await invoke(supabase, 'financial-statements', { method, company_id: companyId, ...extra });
    if (!r.ok) throw new Error(`${method}: ${JSON.stringify(r.body ?? r.error)}`);
    return r.body as Record<string, unknown>;
  };

  const years = (await invoke(supabase, 'accounting', {
    method: 'GET_FINANCIAL_YEARS',
    company_id: companyId,
  })).body as Array<{ id: string; year_code: string; is_current?: boolean }>;
  const fy = years.find((y) => y.is_current) ?? years[0];
  if (!fy) throw new Error('No financial year.');
  console.log(`Financial year: ${fy.year_code}`);

  const ensured = await step('ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR', { financial_year_id: fy.id });
  const workspace = (ensured.workspace ?? ensured) as { id: string };
  console.log(`Workspace: ${workspace.id} (created=${ensured.created})`);

  const draft = await step('CREATE_SNAPSHOT_DRAFT', { workspace_id: workspace.id, force_successor: true });
  const version = (draft.version ?? {}) as { id: string };
  console.log(`Snapshot version: ${version.id}`);

  await step('EXTRACT_FACT_SNAPSHOT', { workspace_id: workspace.id, snapshot_version_id: version.id });
  await step('CERTIFY_SNAPSHOT_VERSION', { workspace_id: workspace.id, snapshot_version_id: version.id });
  await step('GENERATE_STATEMENTS', { workspace_id: workspace.id, snapshot_version_id: version.id });

  const raw = await step('GET_STATEMENTS', { workspace_id: workspace.id });
  const statements = (Array.isArray(raw) ? raw : (raw.statements ?? raw.data ?? [])) as Array<{
    statement_type: string;
    title: string;
    lines: Line[];
  }>;

  for (const s of statements) {
    if (s.statement_type === 'financial_position' || s.statement_type === 'financial_performance') {
      render(s.title, s.lines || []);
    }
  }

  const sfp = statements.find((s) => s.statement_type === 'financial_position');
  const reconciling = (sfp?.lines || []).filter((l) => l.is_reconciling);
  const total = (sfp?.lines || []).find((l) => l.line_code === 'sfp.total_assets');
  const grand = (sfp?.lines || []).find((l) => l.line_code === 'sfp.total_liabilities_and_equity');
  console.log('\n--- checks ---');
  console.log(`lines on the Statement of Financial Position: ${(sfp?.lines || []).length}`);
  console.log(`reconciling lines (should be 0): ${reconciling.length}`);
  console.log(
    `balances: total assets ${money(total?.amount ?? null)} vs total equity and liabilities ${money(grand?.amount ?? null)}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
