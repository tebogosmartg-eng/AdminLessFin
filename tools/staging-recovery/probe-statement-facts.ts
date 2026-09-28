/**
 * Read-only: the sealed facts behind a workspace's statements, arranged to show
 * whether the statements and notes can agree. Changes nothing.
 *
 *   npx tsx tools/staging-recovery/probe-statement-facts.ts <company_id> <workspace_id>
 */
import { createClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const [companyId, workspaceId] = process.argv.slice(2);
const env = loadE2EEnv();
const c = createClient(env.supabaseUrl, env.supabaseAnonKey);
await c.auth.signInWithPassword({ email: env.email, password: env.password });

async function call(method: string, body: Record<string, unknown>) {
  const { data, error } = await c.functions.invoke('financial-statements', {
    body: { method, company_id: companyId, ...body },
  });
  if (error) throw new Error(`${method}: ${error.message}`);
  return data;
}

const stmts = await call('GET_STATEMENTS', { workspace_id: workspaceId });
const snapshot = stmts.statements[0]?.snapshot_version_id;
console.log('snapshot version', snapshot, 'generated', stmts.statements[0]?.generated_at);
const facts = await call('GET_FINANCIAL_FACTS', { snapshot_version_id: snapshot, workspace_id: workspaceId });
console.log('period', JSON.stringify(facts.period));

type Row = { id: string; name: string; type: string; category?: string; subcategory?: string; account_role?: string; balance?: number; opening_balance?: number; closing_balance?: number; period_activity?: number };
const prior = new Map<string, Row>((facts.balances_prior_as_of as Row[]).map((r) => [r.id, r]));
const act = new Map<string, Row>((facts.period_activity as Row[]).map((r) => [r.id, r]));
const sums: Record<string, { closing: number; prior: number; activity: number; opening: number }> = {};
console.log('\ntype | category | name | closing | prior_as_of | opening | activity | role');
for (const r of facts.balances_as_of as Row[]) {
  const p = prior.get(r.id);
  const a = act.get(r.id);
  const line = [r.type, r.category, r.name, r.balance, p?.balance ?? '-', a?.opening_balance ?? '-', a?.period_activity ?? '-', r.account_role ?? ''];
  if ([r.balance, p?.balance, a?.period_activity].some((v) => Number(v || 0) !== 0)) console.log(line.join(' | '));
  const s = (sums[r.type] ??= { closing: 0, prior: 0, activity: 0, opening: 0 });
  s.closing += Number(r.balance || 0);
  s.prior += Number(p?.balance || 0);
  s.activity += Number(a?.period_activity || 0);
  s.opening += Number(a?.opening_balance || 0);
}
console.log('\ntotals by type', JSON.stringify(sums, null, 1));
const ca = (facts as { canonical_aggregation?: Record<string, unknown> }).canonical_aggregation;
console.log('\ncanonical_aggregation in facts response:', ca ? Object.keys(ca).join(',') : '(not returned)');
console.log('cash_flow facts', JSON.stringify(facts.cash_flow));

console.log('\ncomparative year sealed:', Array.isArray(facts.prior_period_activity), '| prior cash flow sealed:', Array.isArray(facts.prior_cash_flow));
for (const s of stmts.statements as Array<{ statement_type: string; snapshot_version_id: string; lines: Array<Record<string, unknown>> }>) {
  if (s.snapshot_version_id !== snapshot) continue;
  console.log(`\n== ${s.statement_type}`);
  for (const l of s.lines) console.log(`  ${l.line_code} | ${l.label} | ${l.amount ?? ''} | ${l.prior_amount ?? ''}`);
}
