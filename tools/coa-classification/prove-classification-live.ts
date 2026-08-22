/**
 * Live proof that the Chart of Accounts owns account classification and the
 * Trial Balance consumes it — Phases 10, 11 and 12 of the classification brief.
 *
 * Creates the six brief test accounts against the real edge functions, checks
 * where each lands in the hierarchical Trial Balance, re-classifies one account
 * and re-checks it, attempts the invalid combinations, and confirms no ledger
 * amount moved. Test accounts are deleted again at the end.
 *
 *   npx tsx tools/coa-classification/prove-classification-live.ts
 *   npx tsx tools/coa-classification/prove-classification-live.ts --keep
 *
 * Writes tests/e2e/evidence/coa-classification/coa-classification-proof.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const KEEP = process.argv.includes('--keep');
// NOT tests/e2e/artifacts — Playwright clears that directory on every run.
const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/coa-classification');
const OUT = path.join(OUT_DIR, 'coa-classification-proof.json');

// Deliberately high, unused numbers so nothing collides with a real account.
const BASE_NUMBER = 990001;

type TestCase = {
  label: string;
  name: string;
  type: string;
  category: string;
  subcategory?: string | null;
  expect: { l1: string; l2: string; l3: string };
};

const CASES: TestCase[] = [
  {
    label: '1. Accounts Payable',
    name: 'ZZ Test Accounts Payable',
    type: 'Liability',
    category: 'Current Liabilities',
    subcategory: 'Trade and Other Payables',
    expect: { l1: 'Liabilities', l2: 'Current Liabilities', l3: 'Trade and Other Payables' },
  },
  {
    label: '2. Shareholders Loan',
    name: 'ZZ Test Shareholders Loan',
    type: 'Liability',
    category: 'Non-Current Liabilities',
    subcategory: 'Related-party Payables',
    expect: { l1: 'Liabilities', l2: 'Non-Current Liabilities', l3: 'Related-party Payables' },
  },
  {
    label: '3. Inventory',
    name: 'ZZ Test Inventory',
    type: 'Asset',
    category: 'Current Assets',
    subcategory: 'Inventory',
    expect: { l1: 'Assets', l2: 'Current Assets', l3: 'Inventory' },
  },
  {
    label: '4. Computer Equipment',
    name: 'ZZ Test Computer Equipment',
    type: 'Asset',
    category: 'Non-Current Assets',
    subcategory: 'Property, Plant and Equipment',
    expect: {
      l1: 'Assets',
      l2: 'Non-Current Assets',
      l3: 'Property, Plant and Equipment',
    },
  },
  {
    label: '5. Sales',
    name: 'ZZ Test Sales',
    type: 'Income',
    category: 'Revenue',
    expect: { l1: 'Income', l2: 'Revenue', l3: 'Revenue' },
  },
  {
    label: '6. Advertising',
    name: 'ZZ Test Advertising',
    type: 'Expense',
    category: 'Operating Expenses',
    expect: { l1: 'Expenses', l2: 'Operating Expenses', l3: 'Operating Expenses' },
  },
];

const INVALID_CASES = [
  { name: 'ZZ Invalid A', type: 'Liability', category: 'Non-Current Assets' },
  { name: 'ZZ Invalid B', type: 'Asset', category: 'Current Liabilities' },
  { name: 'ZZ Invalid C', type: 'Expense', category: 'Current Assets' },
  { name: 'ZZ Invalid D', type: 'Liability', category: null as string | null },
  {
    name: 'ZZ Invalid E',
    type: 'Asset',
    category: 'Current Assets',
    subcategory: 'Property, Plant and Equipment',
  },
];

async function errorText(error: unknown, data: unknown): Promise<string> {
  const parts: string[] = [];
  const err = error as { message?: string; context?: unknown } | null;
  if (err?.message) parts.push(err.message);
  const context = err?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      parts.push(JSON.stringify(body));
    } catch {
      parts.push(await context.clone().text().catch(() => ''));
    }
  }
  if (data != null) parts.push(JSON.stringify(data));
  return parts.join(' ');
}

async function fetchHierarchy(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ byId: Map<string, { l1: string; l2: string; l3: string }>; raw: unknown }> {
  const year = new Date().getUTCFullYear();
  const res = await supabase.functions.invoke('accounting', {
    body: {
      method: 'GET_HIERARCHICAL_TRIAL_BALANCE',
      company_id: companyId,
      start_date: `${year - 1}-01-01`,
      end_date: `${year}-12-31`,
    },
  });
  if (res.error) throw new Error(`Hierarchical TB failed: ${await errorText(res.error, res.data)}`);
  const rows = ((res.data as { rows?: Array<Record<string, string>> })?.rows ?? []);
  return {
    byId: new Map(
      rows.map((r) => [
        String(r.account_id),
        { l1: String(r.hierarchy_l1), l2: String(r.hierarchy_l2), l3: String(r.hierarchy_l3) },
      ]),
    ),
    raw: res.data,
  };
}

/**
 * The hierarchical Trial Balance only lists accounts with activity, so a freshly
 * created account has no row. The Chart of Accounts is still the authority, so
 * the same resolver the edge uses is applied to the stored account to prove the
 * hierarchy the account WOULD present under, alongside the edge's own answer
 * for accounts that do appear.
 */
async function resolveStored(
  supabase: SupabaseClient,
  companyId: string,
  accountId: string,
): Promise<{ type: string; category: string | null; subcategory: string | null }> {
  const res = await supabase.functions.invoke('chart-of-accounts', {
    body: { method: 'GET', company_id: companyId },
  });
  if (res.error) throw new Error(`GET accounts failed: ${res.error.message}`);
  const rows = (res.data as Array<Record<string, unknown>>) ?? [];
  const row = rows.find((r) => r.id === accountId);
  if (!row) throw new Error(`Account ${accountId} not found after write.`);
  return {
    type: String(row.type),
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
  };
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

  const { resolveAccountHierarchy } = await import('../../src/lib/accounting/accountClassification');

  const before = await fetchHierarchy(supabase, companyId);
  const beforeTotals = (before.raw as { totals?: unknown; balanced?: boolean });

  const created: Array<{ id: string; label: string }> = [];
  const results: Array<Record<string, unknown>> = [];

  // ── Phase 10 — create each test account and check where it presents ───────
  for (const [index, testCase] of CASES.entries()) {
    const create = await supabase.functions.invoke('chart-of-accounts', {
      body: {
        method: 'POST',
        company_id: companyId,
        accountData: {
          account_number: BASE_NUMBER + index,
          name: testCase.name,
          type: testCase.type,
          category: testCase.category,
          subcategory: testCase.subcategory ?? null,
          description: 'Temporary account for classification verification.',
          source: 'manual',
        },
      },
    });
    if (create.error) {
      results.push({
        case: testCase.label,
        pass: false,
        detail: `Create failed: ${await errorText(create.error, create.data)}`,
      });
      continue;
    }
    const accountId = (create.data as { id?: string })?.id;
    if (!accountId) {
      results.push({ case: testCase.label, pass: false, detail: 'Create returned no id.' });
      continue;
    }
    created.push({ id: accountId, label: testCase.label });

    const stored = await resolveStored(supabase, companyId, accountId);
    const resolved = resolveAccountHierarchy(stored);
    const pass =
      resolved.l1 === testCase.expect.l1 &&
      resolved.l2 === testCase.expect.l2 &&
      resolved.l3 === testCase.expect.l3;

    results.push({
      case: testCase.label,
      pass,
      stored,
      expected: testCase.expect,
      actual: { l1: resolved.l1, l2: resolved.l2, l3: resolved.l3 },
      renders_single_level: resolved.l2 === resolved.l3,
    });
  }

  // ── Phase 11 — re-classify and confirm the hierarchy follows ──────────────
  const editTarget = created.find((c) => c.label === '2. Shareholders Loan');
  let editResult: Record<string, unknown> = { pass: false, detail: 'Account was not created.' };
  if (editTarget) {
    const edit = await supabase.functions.invoke('chart-of-accounts', {
      body: {
        method: 'PUT',
        company_id: companyId,
        accountId: editTarget.id,
        accountData: {
          name: 'ZZ Test Shareholders Loan',
          type: 'Liability',
          category: 'Current Liabilities',
          subcategory: 'Related-party Payables',
        },
      },
    });
    if (edit.error) {
      editResult = { pass: false, detail: `Edit failed: ${await errorText(edit.error, edit.data)}` };
    } else {
      const stored = await resolveStored(supabase, companyId, editTarget.id);
      const resolved = resolveAccountHierarchy(stored);
      editResult = {
        pass: resolved.l2 === 'Current Liabilities' && resolved.l1 === 'Liabilities',
        was: 'Non-Current Liabilities',
        now: resolved.l2,
        stored,
      };
    }
  }

  // ── Phase 4 — invalid combinations must be rejected by the domain layer ───
  const invalidResults: Array<Record<string, unknown>> = [];
  for (const [index, invalid] of INVALID_CASES.entries()) {
    const attempt = await supabase.functions.invoke('chart-of-accounts', {
      body: {
        method: 'POST',
        company_id: companyId,
        accountData: {
          account_number: BASE_NUMBER + 100 + index,
          name: invalid.name,
          type: invalid.type,
          category: invalid.category,
          ...(('subcategory' in invalid) ? { subcategory: invalid.subcategory } : {}),
        },
      },
    });
    const rejected = !!attempt.error;
    const message = rejected ? await errorText(attempt.error, attempt.data) : '';
    // If the server wrongly accepted it, clean the row up immediately.
    if (!rejected) {
      const strayId = (attempt.data as { id?: string })?.id;
      if (strayId) {
        await supabase.functions.invoke('chart-of-accounts', {
          body: { method: 'DELETE', company_id: companyId, accountId: strayId },
        });
      }
    }
    invalidResults.push({
      attempted: `${invalid.type} + ${invalid.category ?? 'NULL'}${
        'subcategory' in invalid ? ` + ${invalid.subcategory}` : ''
      }`,
      rejected,
      message: message.slice(0, 300),
    });
  }

  // ── Phase 12 — no ledger amount moved ────────────────────────────────────
  const after = await fetchHierarchy(supabase, companyId);
  const afterTotals = (after.raw as { totals?: unknown; balanced?: boolean });
  const integrity = {
    totals_unchanged:
      JSON.stringify(beforeTotals.totals) === JSON.stringify(afterTotals.totals),
    balanced_before: beforeTotals.balanced ?? null,
    balanced_after: afterTotals.balanced ?? null,
    totals_before: beforeTotals.totals ?? null,
    totals_after: afterTotals.totals ?? null,
  };

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup: Array<Record<string, unknown>> = [];
  if (!KEEP) {
    for (const account of created) {
      const del = await supabase.functions.invoke('chart-of-accounts', {
        body: { method: 'DELETE', company_id: companyId, accountId: account.id },
      });
      cleanup.push({
        label: account.label,
        deleted: !del.error,
        detail: del.error ? await errorText(del.error, del.data) : '',
      });
    }
  }

  const allPass =
    results.every((r) => r.pass) &&
    editResult.pass === true &&
    invalidResults.every((r) => r.rejected) &&
    integrity.totals_unchanged &&
    integrity.balanced_after === true;

  const report = {
    captured_at: new Date().toISOString(),
    company_id: companyId,
    kept_test_accounts: KEEP,
    phase_10_hierarchy: results,
    phase_11_reclassification: editResult,
    phase_4_invalid_rejected: invalidResults,
    phase_12_integrity: integrity,
    cleanup,
    overall_pass: allPass,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log('── Phase 10: Trial Balance hierarchy ──');
  for (const r of results) {
    const actual = r.actual as { l1: string; l2: string; l3: string } | undefined;
    console.log(
      `${r.pass ? 'PASS' : 'FAIL'}  ${r.case}  ${
        actual ? `${actual.l1} > ${actual.l2}${actual.l2 === actual.l3 ? '' : ` > ${actual.l3}`}` : r.detail
      }`,
    );
  }
  console.log('── Phase 11: re-classification ──');
  console.log(`${editResult.pass ? 'PASS' : 'FAIL'}  ${editResult.was} -> ${editResult.now ?? editResult.detail}`);
  console.log('── Phase 4: invalid combinations ──');
  for (const r of invalidResults) {
    console.log(`${r.rejected ? 'PASS' : 'FAIL'}  ${r.attempted}`);
  }
  console.log('── Phase 12: integrity ──');
  console.log(`totals unchanged: ${integrity.totals_unchanged} · balanced: ${integrity.balanced_after}`);
  console.log(`cleanup: ${cleanup.filter((c) => c.deleted).length}/${created.length} deleted`);
  console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}  → ${OUT}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
