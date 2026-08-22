/**
 * Live Chart of Accounts classification proof — read-only.
 *
 * Captures, for the authenticated company:
 *   - every account with its type / category / subcategory
 *   - which accounts the classification model considers unclassified
 *   - the hierarchical Trial Balance hierarchy actually returned by the edge
 *   - Trial Balance integrity (balanced, closing DR = CR) so a before/after
 *     comparison proves classification changed no ledger amount
 *
 *   npx tsx tools/coa-classification/verify-classification-live.ts [label]
 *
 * Writes tests/e2e/artifacts/coa-classification-<label>.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';
import {
  isClassificationRequired,
  resolveAccountHierarchy,
} from '../../src/lib/accounting/accountClassification';

const label = process.argv[2] || 'snapshot';
const OUT_DIR = path.join(process.cwd(), 'tests/e2e/artifacts');
const OUT = path.join(OUT_DIR, `coa-classification-${label}.json`);

type Account = {
  id: string;
  account_number: number;
  name: string;
  type: string;
  category?: string | null;
  subcategory?: string | null;
  is_active?: boolean | null;
  balance?: number | null;
};

function tally(values: Array<string | null | undefined>) {
  const out: Record<string, number> = {};
  for (const v of values) {
    const key = v == null || v === '' ? '(null)' : v;
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const env = loadE2EEnv();
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);

  const signIn = await supabase.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`Auth failed: ${signIn.error?.message || 'no session'}`);
  }

  const session = await supabase.functions.invoke('user-session', { body: { method: 'GET' } });
  const companyId =
    session.data?.activeCompany?.id || env.companyId || session.data?.companies?.[0]?.id;
  if (!companyId) throw new Error('No company on the authenticated user.');

  const accountsRes = await supabase.functions.invoke('chart-of-accounts', {
    body: { method: 'GET', company_id: companyId },
  });
  if (accountsRes.error) throw new Error(`GET accounts failed: ${accountsRes.error.message}`);
  const accounts: Account[] = Array.isArray(accountsRes.data) ? accountsRes.data : [];

  // Reporting window: current calendar year, wide enough to include activity.
  const year = new Date().getUTCFullYear();
  const startDate = `${year - 1}-01-01`;
  const endDate = `${year}-12-31`;

  const tbRes = await supabase.functions.invoke('accounting', {
    body: {
      method: 'GET_HIERARCHICAL_TRIAL_BALANCE',
      company_id: companyId,
      start_date: startDate,
      end_date: endDate,
    },
  });
  if (tbRes.error) throw new Error(`Hierarchical TB failed: ${tbRes.error.message}`);

  const tb = tbRes.data as {
    rows?: Array<Record<string, unknown>>;
    totals?: Record<string, number>;
    balanced?: boolean;
  };
  const tbRows = tb?.rows ?? [];

  const hierarchyPaths = tally(
    tbRows.map((r) => `${r.hierarchy_l1} > ${r.hierarchy_l2} > ${r.hierarchy_l3}`),
  );
  // l3 === l2 is the DESIGNED signal for "this account carries no statement
  // line" — the Trial Balance renders that as a single level. A genuine defect
  // is a repeated level with a DIFFERENT classification above it, or the same
  // label appearing at l1 and l2.
  const collapsedLevels = Object.keys(hierarchyPaths).filter((p) => {
    const [, l2, l3] = p.split(' > ');
    return l2 === l3;
  });
  const repeatedHeadings = Object.keys(hierarchyPaths).filter((p) => {
    const [l1, l2] = p.split(' > ');
    return l1 === l2 && l1 !== 'Equity';
  });

  const unclassified = accounts
    .filter((a) => a.is_active !== false && isClassificationRequired(a))
    .map((a) => ({
      account_number: a.account_number,
      name: a.name,
      type: a.type,
      category: a.category ?? null,
    }));

  const report = {
    label,
    captured_at: new Date().toISOString(),
    company_id: companyId,
    period: { startDate, endDate },
    account_count: accounts.length,
    active_account_count: accounts.filter((a) => a.is_active !== false).length,
    category_tally: tally(accounts.map((a) => a.category)),
    subcategory_tally: tally(accounts.map((a) => a.subcategory)),
    unclassified_count: unclassified.length,
    unclassified,
    // Signed balance per account — the Phase 12 data-integrity fingerprint.
    balance_fingerprint: Object.fromEntries(
      accounts
        .slice()
        .sort((a, b) => a.account_number - b.account_number)
        .map((a) => [String(a.account_number), Number(a.balance ?? 0)]),
    ),
    trial_balance: {
      row_count: tbRows.length,
      balanced: tb?.balanced ?? null,
      totals: tb?.totals ?? null,
      hierarchy_paths: hierarchyPaths,
      collapsed_single_levels: collapsedLevels,
      repeated_headings: repeatedHeadings,
    },
    // What the classification model says the hierarchy SHOULD be, computed from
    // the Chart of Accounts alone. Compared against what the edge returned.
    expected_hierarchy: Object.fromEntries(
      accounts
        .slice()
        .sort((a, b) => a.account_number - b.account_number)
        .map((a) => {
          const h = resolveAccountHierarchy(a);
          return [String(a.account_number), `${h.l1} > ${h.l2} > ${h.l3}`];
        }),
    ),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(`Company ................ ${companyId}`);
  console.log(`Accounts ............... ${report.account_count} (${report.active_account_count} active)`);
  console.log(`Unclassified ........... ${report.unclassified_count}`);
  console.log(`Category tally ......... ${JSON.stringify(report.category_tally)}`);
  console.log(`TB rows / balanced ..... ${report.trial_balance.row_count} / ${report.trial_balance.balanced}`);
  console.log(`TB hierarchy paths ..... ${JSON.stringify(report.trial_balance.hierarchy_paths, null, 2)}`);
  console.log(`Collapsed levels ....... ${collapsedLevels.length} (rendered as one level)`);
  console.log(`Repeated headings ...... ${JSON.stringify(repeatedHeadings)}`);
  console.log(`Written ................ ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
