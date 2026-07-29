/**
 * Live proofs for FRP A1/A2 (seal imbalance + duplicate codes) and B1/B2 (trace + convergence).
 * Run: npx tsx scripts/frp-live-proofs.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function loadEnvFile() {
  const envPath = join(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile();

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

if (!URL || !ANON || !EMAIL || !PASSWORD) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / E2E_EMAIL / E2E_PASSWORD');
  process.exit(1);
}

const OUT_DIR = join(process.cwd(), 'scripts', 'frp-live-proof-output');
mkdirSync(OUT_DIR, { recursive: true });

function dump(label: string, data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  console.log(`\n========== ${label} ==========\n`);
  console.log(text);
  return text;
}

async function invokeEfs(
  supabase: SupabaseClient,
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
) {
  const body = { method, company_id: companyId, ...payload };
  const { data, error } = await supabase.functions.invoke('financial-statements', { body });
  if (error) {
    let detail: unknown = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        detail = await ctx.clone().json();
      } catch {
        try {
          detail = await ctx.clone().text();
        } catch {
          detail = error.message;
        }
      }
    }
    return { ok: false as const, error: detail, data: null };
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return { ok: false as const, error: (data as { error: unknown }).error, data };
  }
  return { ok: true as const, error: null, data };
}

async function invokeJournal(
  supabase: SupabaseClient,
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
) {
  const body = { method, company_id: companyId, ...payload };
  const { data, error } = await supabase.functions.invoke('journal-entries', { body });
  if (error) {
    let detail: unknown = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        detail = await ctx.clone().json();
      } catch {
        try {
          detail = await ctx.clone().text();
        } catch {
          detail = error.message;
        }
      }
    }
    return { ok: false as const, error: detail, data: null };
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return { ok: false as const, error: (data as { error: unknown }).error, data };
  }
  return { ok: true as const, error: null, data };
}

const BALANCED_CSV = [
  'account_code,account_name,account_type,debit,credit',
  '1000,Bank,Asset,50000,0',
  '2000,Payables,Liability,0,20000',
  '3000,Capital,Equity,0,30000',
].join('\n');

const UNBALANCED_CSV = [
  'account_code,account_name,account_type,debit,credit',
  '1000,Bank,Asset,50000,0',
  '2000,Payables,Liability,0,20000',
  '3000,Capital,Equity,0,25000',
].join('\n');

const DUPLICATE_CSV = [
  'account_code,account_name,account_type,debit,credit',
  '1000,Bank,Asset,50000,0',
  '1000,Bank Duplicate,Asset,0,0',
  '2000,Payables,Liability,0,20000',
  '3000,Capital,Equity,0,30000',
].join('\n');

async function main() {
  const log: Record<string, unknown> = { startedAt: new Date().toISOString() };
  const supabase = createClient(URL, ANON);
  const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (auth.error || !auth.data.session) {
    dump('AUTH_FAILED', auth.error);
    process.exit(1);
  }
  dump('AUTH_OK', { user: auth.data.user?.email, user_id: auth.data.user?.id });

  const { data: memberships, error: mErr } = await supabase
    .from('company_users')
    .select('company_id, role, companies(id, name)')
    .eq('user_id', auth.data.user!.id);
  if (mErr) {
    dump('MEMBERSHIPS_ERROR', mErr);
    process.exit(1);
  }
  dump('MEMBERSHIPS', memberships);
  const preferred =
    (memberships || []).find((m: any) => (m.companies as any)?.name === 'Spaceman') ||
    (memberships || [])[0];
  if (!preferred) {
    dump('NO_COMPANY', 'No company membership for E2E user');
    process.exit(1);
  }
  const companyId = preferred.company_id as string;
  const companyName = (preferred.companies as any)?.name;
  dump('COMPANY', { companyId, companyName });

  // Resolve workspace / period / framework from existing EFS data
  const ws = await invokeEfs(supabase, companyId, 'ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR', {});
  dump('ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR', ws.ok ? ws.data : ws.error);
  const workspaces = Array.isArray(ws.data)
    ? ws.data
    : ((ws.data as any)?.workspaces || (ws.data as any)?.data || []);
  const workspace =
    (workspaces || []).find((w: any) => String(w.name || '').includes('V6.10')) ||
    (workspaces || [])[0];

  if (!workspace) {
    dump('BLOCKER', 'No reporting workspace found for company. Need an existing EFS workspace/period.');
    process.exit(1);
  }
  dump('WORKSPACE', workspace);

  const periodId =
    workspace.reporting_period_id ||
    workspace.efs_reporting_periods?.id ||
    workspace.period_id;
  const bindings = workspace.efs_framework_bindings || [];
  const frameworkPackId =
    workspace.framework_pack_id ||
    bindings[0]?.efs_framework_packs?.id ||
    workspace.bound_framework_pack_id;

  // Get dashboard / snapshot context
  const dash = await invokeEfs(supabase, companyId, 'GET_WORKSPACE_DASHBOARD', {
    workspace_id: workspace.id,
  });
  dump('GET_WORKSPACE_DASHBOARD', dash.ok ? dash.data : dash.error);
  const dashData = dash.data as any;
  const reportingPeriodId =
    periodId ||
    dashData?.period?.id ||
    dashData?.reporting_period?.id ||
    dashData?.workspace?.reporting_period_id;
  const fwPackId =
    frameworkPackId ||
    dashData?.framework_pack?.id ||
    dashData?.workspace?.framework_pack_id;
  const snapshotVersionId =
    dashData?.snapshot?.currentVersion?.id ||
    dashData?.snapshot?.current_version?.id ||
    dashData?.current_version?.id ||
    null;

  dump('CONTEXT_IDS', {
    workspace_id: workspace.id,
    reporting_period_id: reportingPeriodId,
    framework_pack_id: fwPackId,
    snapshot_version_id: snapshotVersionId,
  });

  if (!reportingPeriodId) {
    dump('BLOCKER', 'No reporting_period_id resolved.');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PART A2 — duplicate account codes rejected on import
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n######## PART A2 — DUPLICATE ACCOUNT CODES ########\n');

  const srcDup = await invokeEfs(supabase, companyId, 'FRP_CREATE_SOURCE', {
    workspace_id: workspace.id,
    reporting_period_id: reportingPeriodId,
    snapshot_version_id: snapshotVersionId,
    source_kind: 'imported_tb',
    source_system: 'csv',
    label: `A2 duplicate proof ${Date.now()}`,
  });
  dump('A2_UPSERT_SOURCE', srcDup.ok ? srcDup.data : srcDup.error);
  const sourceDupId = (srcDup.data as any)?.source?.id || (srcDup.data as any)?.id;
  if (!sourceDupId) {
    dump('A2_BLOCKER', 'Could not create CTB source for duplicate import test.');
  } else {
    const dupFail = await invokeEfs(supabase, companyId, 'FRP_IMPORT_TRIAL_BALANCE', {
      source_id: sourceDupId,
      csv_text: DUPLICATE_CSV,
      file_name: 'duplicate-codes.csv',
      period_start: '2025-04-01',
      period_end: '2026-03-31',
    });
    dump('A2_IMPORT_DUPLICATE_SHOULD_FAIL', {
      ok: dupFail.ok,
      error: dupFail.error,
      data: dupFail.data,
    });

    const dupOk = await invokeEfs(supabase, companyId, 'FRP_IMPORT_TRIAL_BALANCE', {
      source_id: sourceDupId,
      csv_text: BALANCED_CSV,
      file_name: 'balanced-unique-codes.csv',
      period_start: '2025-04-01',
      period_end: '2026-03-31',
    });
    dump('A2_IMPORT_UNIQUE_SHOULD_PASS', {
      ok: dupOk.ok,
      error: dupOk.error,
      data: dupOk.data,
    });
    log.a2 = { fail: dupFail, pass: dupOk, source_id: sourceDupId };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PART A1 — unbalanced seal hard-fail
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n######## PART A1 — UNBALANCED SEAL HARD-FAIL ########\n');

  const srcUb = await invokeEfs(supabase, companyId, 'FRP_CREATE_SOURCE', {
    workspace_id: workspace.id,
    reporting_period_id: reportingPeriodId,
    snapshot_version_id: snapshotVersionId,
    source_kind: 'imported_tb',
    source_system: 'csv',
    label: `A1 unbalanced proof ${Date.now()}`,
  });
  dump('A1_UPSERT_SOURCE', srcUb.ok ? srcUb.data : srcUb.error);
  const sourceUbId = (srcUb.data as any)?.source?.id || (srcUb.data as any)?.id;

  if (!sourceUbId) {
    dump('A1_BLOCKER', 'Could not create CTB source for unbalanced seal test.');
  } else {
    const impUb = await invokeEfs(supabase, companyId, 'FRP_IMPORT_TRIAL_BALANCE', {
      source_id: sourceUbId,
      csv_text: UNBALANCED_CSV,
      file_name: 'unbalanced.csv',
      period_start: '2025-04-01',
      period_end: '2026-03-31',
    });
    dump('A1_IMPORT_UNBALANCED', { ok: impUb.ok, error: impUb.error, data: impUb.data });
    const importUbId = (impUb.data as any)?.import?.id;

    let mappingSetId: string | null = null;
    if (fwPackId) {
      const ms = await invokeEfs(supabase, companyId, 'FRP_ENSURE_MAPPING_SET', {
        framework_pack_id: fwPackId,
        source_system: 'csv',
        version_label: 'v1-proof',
        label: 'Proof mapping set',
      });
      dump('A1_ENSURE_MAPPING_SET', ms.ok ? ms.data : ms.error);
      mappingSetId = (ms.data as any)?.mapping_set?.id || null;
    }

    if (importUbId) {
      const mapUb = await invokeEfs(supabase, companyId, 'FRP_RUN_MAPPING_ENGINE', {
        import_id: importUbId,
        mapping_set_id: mappingSetId,
      });
      dump('A1_RUN_MAPPING_UNBALANCED', { ok: mapUb.ok, error: mapUb.error, data: mapUb.data });

      const sealUb = await invokeEfs(supabase, companyId, 'FRP_SEAL_CANONICAL_TB_FROM_IMPORT', {
        import_id: importUbId,
        snapshot_version_id: snapshotVersionId,
      });
      dump('A1_SEAL_UNBALANCED_SHOULD_FAIL', {
        ok: sealUb.ok,
        error: sealUb.error,
        data: sealUb.data,
      });
      log.a1_fail = sealUb;
    }

    // Balanced path
    const srcBal = await invokeEfs(supabase, companyId, 'FRP_CREATE_SOURCE', {
      workspace_id: workspace.id,
      reporting_period_id: reportingPeriodId,
      snapshot_version_id: snapshotVersionId,
      source_kind: 'imported_tb',
      source_system: 'csv',
      label: `A1 balanced proof ${Date.now()}`,
    });
    dump('A1_UPSERT_SOURCE_BALANCED', srcBal.ok ? srcBal.data : srcBal.error);
    const sourceBalId = (srcBal.data as any)?.source?.id || (srcBal.data as any)?.id;
    const impBal = await invokeEfs(supabase, companyId, 'FRP_IMPORT_TRIAL_BALANCE', {
      source_id: sourceBalId,
      csv_text: BALANCED_CSV,
      file_name: 'balanced.csv',
      period_start: '2025-04-01',
      period_end: '2026-03-31',
    });
    dump('A1_IMPORT_BALANCED', { ok: impBal.ok, error: impBal.error, data: impBal.data });
    const importBalId = (impBal.data as any)?.import?.id;
    if (importBalId) {
      const mapBal = await invokeEfs(supabase, companyId, 'FRP_RUN_MAPPING_ENGINE', {
        import_id: importBalId,
        mapping_set_id: mappingSetId,
      });
      dump('A1_RUN_MAPPING_BALANCED', { ok: mapBal.ok, error: mapBal.error, data: mapBal.data });
      const sealBal = await invokeEfs(supabase, companyId, 'FRP_SEAL_CANONICAL_TB_FROM_IMPORT', {
        import_id: importBalId,
        snapshot_version_id: snapshotVersionId,
      });
      dump('A1_SEAL_BALANCED_SHOULD_PASS', {
        ok: sealBal.ok,
        error: sealBal.error,
        data: sealBal.data,
      });
      log.a1_pass = sealBal;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PART B1 — live trace chain
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n######## PART B1 — LIVE TRACE CHAIN ########\n');

  // Trial balance via accounts + journal balance query or reports
  const { data: accounts, error: aErr } = await supabase
    .from('chart_of_accounts')
    .select('id, name, type, account_number, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');
  dump('B1_ACCOUNTS_SAMPLE', {
    error: aErr,
    count: accounts?.length,
    sample: (accounts || []).slice(0, 15),
  });

  // Prefer an Asset account that appears on statements (e.g. Bank / Cash / Receivable)
  const targetAccount =
    (accounts || []).find((a) => /bank|cash|receiv/i.test(a.name) && a.type === 'Asset') ||
    (accounts || []).find((a) => a.type === 'Asset') ||
    (accounts || [])[0];

  const offsetAccount =
    (accounts || []).find(
      (a) => a.id !== targetAccount?.id && (a.type === 'Income' || /revenue|sales|income/i.test(a.name)),
    ) ||
    (accounts || []).find((a) => a.id !== targetAccount?.id && a.type === 'Liability') ||
    (accounts || []).find((a) => a.id !== targetAccount?.id);

  dump('B1_SELECTED_ACCOUNTS', { targetAccount, offsetAccount });

  if (!targetAccount || !offsetAccount) {
    dump('B1_BLOCKER', 'Need at least two accounts to post an adjusting journal.');
  } else {
    // Current TB balance for target via journal_entry_items sum
    const { data: beforeItems, error: beforeErr } = await supabase
      .from('journal_entry_items')
      .select('type, amount, journal_entries!inner(company_id, entry_date, id)')
      .eq('account_id', targetAccount.id)
      .eq('journal_entries.company_id', companyId);
    dump('B1_TB_BEFORE_RAW_ITEMS', { error: beforeErr, count: beforeItems?.length });

    function netFromItems(items: any[] | null | undefined) {
      let debit = 0;
      let credit = 0;
      for (const it of items || []) {
        if (it.type === 'debit') debit += Number(it.amount || 0);
        else credit += Number(it.amount || 0);
      }
      return { debit, credit, net: Math.round((debit - credit) * 100) / 100 };
    }
    const tbBefore = netFromItems(beforeItems);
    dump('B1_TB_BEFORE_NET', { account_id: targetAccount.id, name: targetAccount.name, ...tbBefore });

    // Statement before — list statement instances / lines for financial_position
    const stmtsBefore = await invokeEfs(supabase, companyId, 'LIST_STATEMENT_INSTANCES', {
      workspace_id: workspace.id,
    });
    dump('B1_STATEMENTS_BEFORE', stmtsBefore.ok ? stmtsBefore.data : stmtsBefore.error);

    const AJ_AMOUNT = 123.45;
    dump('B1_AJ_AMOUNT', {
      amount: AJ_AMOUNT,
      debit_account: targetAccount.name,
      credit_account: offsetAccount.name,
      note: 'Debit target asset, credit offset — target TB net should increase by 123.45',
    });

    const createJe = await invokeJournal(supabase, companyId, 'POST', {
      entryData: {
        entry_date: '2026-03-15',
        description: `FRP B1 live trace adjusting entry ${Date.now()}`,
        items: [
          { account_id: targetAccount.id, type: 'debit', amount: AJ_AMOUNT },
          { account_id: offsetAccount.id, type: 'credit', amount: AJ_AMOUNT },
        ],
      },
    });
    dump('B1_JOURNAL_CREATE', { ok: createJe.ok, error: createJe.error, data: createJe.data });

    const jeId =
      (createJe.data as any)?.id ||
      (createJe.data as any)?.journal_entry?.id ||
      (createJe.data as any)?.entry?.id;

    if (jeId) {
      const { data: jeRow, error: jeErr } = await supabase
        .from('journal_entries')
        .select('*, journal_entry_items(*)')
        .eq('id', jeId)
        .single();
      dump('B1_JOURNAL_ROW', { error: jeErr, row: jeRow });
    } else {
      // Fallback: latest matching description
      const { data: recent, error: rErr } = await supabase
        .from('journal_entries')
        .select('*, journal_entry_items(*)')
        .eq('company_id', companyId)
        .ilike('description', '%FRP B1 live trace%')
        .order('created_at', { ascending: false })
        .limit(1);
      dump('B1_JOURNAL_ROW_FALLBACK', { error: rErr, row: recent?.[0], createResponse: createJe });
    }

    const { data: afterItems, error: afterErr } = await supabase
      .from('journal_entry_items')
      .select('type, amount, journal_entries!inner(company_id, entry_date, id)')
      .eq('account_id', targetAccount.id)
      .eq('journal_entries.company_id', companyId);
    const tbAfter = netFromItems(afterItems);
    dump('B1_TB_AFTER_NET', {
      error: afterErr,
      account_id: targetAccount.id,
      name: targetAccount.name,
      before: tbBefore,
      after: tbAfter,
      delta: Math.round((tbAfter.net - tbBefore.net) * 100) / 100,
      expected_delta: AJ_AMOUNT,
    });

    // Re-extract fact snapshot / CTB from native GL
    const extract = await invokeEfs(supabase, companyId, 'EXTRACT_FACT_SNAPSHOT', {
      workspace_id: workspace.id,
      snapshot_version_id: snapshotVersionId,
      reporting_period_id: reportingPeriodId,
    });
    dump('B1_EXTRACT_FACT_SNAPSHOT', { ok: extract.ok, error: extract.error, data: extract.data });

    const listCtb = await invokeEfs(supabase, companyId, 'FRP_LIST_CANONICAL_TB', {
      workspace_id: workspace.id,
      reporting_period_id: reportingPeriodId,
    });
    dump('B1_LIST_CANONICAL_TB', { ok: listCtb.ok, error: listCtb.error, data: listCtb.data });

    const ctbList = (listCtb.data as any)?.canonical_trial_balances || (listCtb.data as any) || [];
    const nativeCtbs = (Array.isArray(ctbList) ? ctbList : []).filter(
      (c: any) => c.source_kind === 'native_gl',
    );
    const latestNative = nativeCtbs.sort((a: any, b: any) =>
      String(b.sealed_at || b.created_at || '').localeCompare(String(a.sealed_at || a.created_at || '')),
    )[0];

    if (latestNative?.id) {
      const ctbGet = await invokeEfs(supabase, companyId, 'FRP_GET_CANONICAL_TB', {
        canonical_tb_id: latestNative.id,
      });
      dump('B1_CANONICAL_TB_AFTER', { ok: ctbGet.ok, error: ctbGet.error, data: ctbGet.data });
      const lines = (ctbGet.data as any)?.lines || [];
      const ctbLine = lines.find(
        (l: any) =>
          l.account_code === String(targetAccount.account_number || '') ||
          l.account_name === targetAccount.name ||
          String(l.source_ref?.account_id || '') === targetAccount.id ||
          String(l.line_key) === targetAccount.id,
      );
      dump('B1_CANONICAL_TB_TARGET_LINE', ctbLine || 'NOT_FOUND_IN_CTB_LINES');
    } else {
      dump('B1_CANONICAL_TB_AFTER', 'No native_gl Canonical TB found after extract');
    }

    // Regenerate statements
    const gen = await invokeEfs(supabase, companyId, 'GENERATE_STATEMENTS', {
      workspace_id: workspace.id,
      snapshot_version_id: snapshotVersionId,
    });
    dump('B1_GENERATE_STATEMENTS', { ok: gen.ok, error: gen.error, data: gen.data });

    const stmtsAfter = await invokeEfs(supabase, companyId, 'LIST_STATEMENT_INSTANCES', {
      workspace_id: workspace.id,
    });
    dump('B1_STATEMENTS_AFTER', stmtsAfter.ok ? stmtsAfter.data : stmtsAfter.error);

    // Try to pull statement lines for financial_position
    const afterList = Array.isArray(stmtsAfter.data)
      ? stmtsAfter.data
      : (stmtsAfter.data as any)?.instances || (stmtsAfter.data as any)?.statements || [];
    const sfp =
      (afterList || []).find((s: any) => s.statement_type === 'financial_position') ||
      (afterList || [])[0];
    if (sfp?.id) {
      const linesRes = await invokeEfs(supabase, companyId, 'GET_STATEMENT_INSTANCE', {
        statement_instance_id: sfp.id,
        workspace_id: workspace.id,
      });
      dump('B1_SFP_AFTER_DETAIL', linesRes.ok ? linesRes.data : linesRes.error);
    }

    log.b1 = {
      targetAccount,
      offsetAccount,
      aj_amount: AJ_AMOUNT,
      tbBefore,
      tbAfter,
      extract_ok: extract.ok,
      generate_ok: gen.ok,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PART B2 — convergence native vs imported
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n######## PART B2 — NATIVE VS IMPORTED CONVERGENCE ########\n');

  // Seal native CTB via extract if not already
  const extract2 = await invokeEfs(supabase, companyId, 'EXTRACT_FACT_SNAPSHOT', {
    workspace_id: workspace.id,
    snapshot_version_id: snapshotVersionId,
    reporting_period_id: reportingPeriodId,
  });
  dump('B2_EXTRACT_NATIVE', { ok: extract2.ok, error: extract2.error, data: extract2.data });

  const listCtb2 = await invokeEfs(supabase, companyId, 'FRP_LIST_CANONICAL_TB', {
    workspace_id: workspace.id,
    reporting_period_id: reportingPeriodId,
  });
  dump('B2_LIST_CTB', { ok: listCtb2.ok, error: listCtb2.error, data: listCtb2.data });
  const allCtb = (listCtb2.data as any)?.canonical_trial_balances || listCtb2.data || [];
  const native = (Array.isArray(allCtb) ? allCtb : [])
    .filter((c: any) => c.source_kind === 'native_gl')
    .sort((a: any, b: any) =>
      String(b.sealed_at || '').localeCompare(String(a.sealed_at || '')),
    )[0];

  if (!native?.id) {
    dump('B2_BLOCKER', 'No sealed native_gl Canonical TB available after extract.');
  } else {
    const nativeFull = await invokeEfs(supabase, companyId, 'FRP_GET_CANONICAL_TB', {
      canonical_tb_id: native.id,
    });
    dump('B2_NATIVE_CTB_FULL', nativeFull.ok ? nativeFull.data : nativeFull.error);
    const nativeLines = ((nativeFull.data as any)?.lines || []) as any[];

    // Build equivalent import CSV from native lines (using debit/credit from CTB)
    const csvLines = ['account_code,account_name,account_type,debit,credit'];
    for (const l of nativeLines) {
      const code = l.account_code || l.line_key || `X${l.sort_order}`;
      const name = (l.account_name || 'Account').replace(/,/g, ' ');
      const type = l.account_type || 'Asset';
      csvLines.push(`${code},${name},${type},${Number(l.debit || 0)},${Number(l.credit || 0)}`);
    }
    const equivCsv = csvLines.join('\n');
    dump('B2_EQUIVALENT_IMPORT_CSV', equivCsv);

    const srcImp = await invokeEfs(supabase, companyId, 'FRP_CREATE_SOURCE', {
      workspace_id: workspace.id,
      reporting_period_id: reportingPeriodId,
      snapshot_version_id: snapshotVersionId,
      source_kind: 'imported_tb',
      source_system: 'csv',
      label: `B2 convergence import ${Date.now()}`,
    });
    dump('B2_UPSERT_IMPORT_SOURCE', srcImp.ok ? srcImp.data : srcImp.error);
    const srcImpId = (srcImp.data as any)?.source?.id || (srcImp.data as any)?.id;

    const imp = await invokeEfs(supabase, companyId, 'FRP_IMPORT_TRIAL_BALANCE', {
      source_id: srcImpId,
      csv_text: equivCsv,
      file_name: 'native-equivalent.csv',
      period_start: (nativeFull.data as any)?.canonical_trial_balance?.period_start,
      period_end: (nativeFull.data as any)?.canonical_trial_balance?.period_end,
    });
    dump('B2_IMPORT_EQUIVALENT', { ok: imp.ok, error: imp.error, data: imp.data });
    const impId = (imp.data as any)?.import?.id;

    let mappingSetId2: string | null = null;
    if (fwPackId) {
      const ms = await invokeEfs(supabase, companyId, 'FRP_ENSURE_MAPPING_SET', {
        framework_pack_id: fwPackId,
        source_system: 'csv',
        version_label: 'v1-convergence',
      });
      mappingSetId2 = (ms.data as any)?.mapping_set?.id || null;
    }
    if (impId) {
      const map = await invokeEfs(supabase, companyId, 'FRP_RUN_MAPPING_ENGINE', {
        import_id: impId,
        mapping_set_id: mappingSetId2,
      });
      dump('B2_MAP_EQUIVALENT', { ok: map.ok, error: map.error, data: map.data });
      const seal = await invokeEfs(supabase, companyId, 'FRP_SEAL_CANONICAL_TB_FROM_IMPORT', {
        import_id: impId,
        snapshot_version_id: snapshotVersionId,
      });
      dump('B2_SEAL_IMPORTED', { ok: seal.ok, error: seal.error, data: seal.data });
      const importedCtbId =
        (seal.data as any)?.canonical_trial_balance?.id ||
        (seal.data as any)?.ctb?.id;
      if (importedCtbId) {
        const impFull = await invokeEfs(supabase, companyId, 'FRP_GET_CANONICAL_TB', {
          canonical_tb_id: importedCtbId,
        });
        dump('B2_IMPORTED_CTB_FULL', impFull.ok ? impFull.data : impFull.error);
        const impLines = ((impFull.data as any)?.lines || []) as any[];

        // Field-by-field diff keyed by account_code + account_name + account_type
        function keyOf(l: any) {
          return `${String(l.account_code || '').trim().toLowerCase()}|${String(l.account_name || '')
            .trim()
            .toLowerCase()}|${l.account_type}`;
        }
        const nativeMap = new Map(nativeLines.map((l) => [keyOf(l), l]));
        const impMap = new Map(impLines.map((l) => [keyOf(l), l]));
        const allKeys = Array.from(new Set([...nativeMap.keys(), ...impMap.keys()])).sort();
        const fields = [
          'account_code',
          'account_name',
          'account_type',
          'taxonomy_line_code',
          'opening_balance',
          'closing_balance',
          'period_activity',
          'debit',
          'credit',
        ] as const;
        const diffRows: any[] = [];
        for (const k of allKeys) {
          const n = nativeMap.get(k);
          const i = impMap.get(k);
          const fieldDiffs: Record<string, { native: unknown; imported: unknown; match: boolean }> =
            {};
          let lineMatch = !!n && !!i;
          for (const f of fields) {
            const nv = n ? n[f] : null;
            const iv = i ? i[f] : null;
            const match =
              n && i
                ? String(nv ?? '') === String(iv ?? '') ||
                  (typeof nv === 'number' || typeof iv === 'number'
                    ? Math.abs(Number(nv || 0) - Number(iv || 0)) < 0.005
                    : false)
                : false;
            if (!match) lineMatch = false;
            fieldDiffs[f] = { native: nv ?? null, imported: iv ?? null, match };
          }
          diffRows.push({
            key: k,
            present_in_native: !!n,
            present_in_imported: !!i,
            line_match: lineMatch,
            fields: fieldDiffs,
          });
        }
        dump('B2_FIELD_BY_FIELD_DIFF', {
          native_ctb_id: native.id,
          imported_ctb_id: importedCtbId,
          native_line_count: nativeLines.length,
          imported_line_count: impLines.length,
          lines_compared: diffRows.length,
          lines_matching: diffRows.filter((r) => r.line_match).length,
          lines_mismatching: diffRows.filter((r) => !r.line_match).length,
          diff: diffRows,
        });
        log.b2 = {
          native_ctb_id: native.id,
          imported_ctb_id: importedCtbId,
          matching: diffRows.filter((r) => r.line_match).length,
          mismatching: diffRows.filter((r) => !r.line_match).length,
        };
      }
    }
  }

  log.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT_DIR, 'run-summary.json'), JSON.stringify(log, null, 2));
  console.log(`\nSummary written to ${join(OUT_DIR, 'run-summary.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
