/**
 * B1/B2 continuation — draft snapshot required (certified versions reject EXTRACT).
 * Run: npx tsx scripts/frp-live-proofs-b.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function loadEnvFile() {
  const envPath = join(process.cwd(), '.env');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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

function netFromItems(items: any[] | null | undefined) {
  let debit = 0;
  let credit = 0;
  for (const it of items || []) {
    if (it.type === 'debit') debit += Number(it.amount || 0);
    else credit += Number(it.amount || 0);
  }
  return { debit, credit, net: Math.round((debit - credit) * 100) / 100 };
}

function findCtbLine(lines: any[], account: { id: string; name: string; account_number: number }) {
  return (
    lines.find((l) => String(l.line_key) === account.id) ||
    lines.find((l) => String(l.source_ref?.account_id || '') === account.id) ||
    lines.find((l) => l.account_name === account.name) ||
    lines.find((l) => String(l.account_code || '') === String(account.account_number))
  );
}

function assetsLine(stmts: any[]) {
  const sfp = (stmts || []).find((s) => s.statement_type === 'financial_position');
  if (!sfp) return null;
  const lines = sfp.lines || [];
  return (
    lines.find((l: any) => l.line_code === 'sfp.assets' || l.line_code === 'sfp.total_assets') ||
    lines.find((l: any) => /asset/i.test(l.label || '')) ||
    null
  );
}

async function pipelineDraftExtractCertifyGenerate(
  supabase: SupabaseClient,
  companyId: string,
  workspaceId: string,
  label: string,
) {
  const draft = await invokeEfs(supabase, companyId, 'CREATE_SNAPSHOT_DRAFT', {
    workspace_id: workspaceId,
  });
  dump(`${label}_CREATE_SNAPSHOT_DRAFT`, draft.ok ? draft.data : draft.error);
  const versionId =
    (draft.data as any)?.version?.id ||
    (draft.data as any)?.snapshot_version_id ||
    (draft.data as any)?.snapshot_version?.id;
  if (!versionId) return { versionId: null as string | null, extract: draft, certify: null, gen: null, stmts: null, ctb: null };

  const extract = await invokeEfs(supabase, companyId, 'EXTRACT_FACT_SNAPSHOT', {
    snapshot_version_id: versionId,
  });
  dump(`${label}_EXTRACT_FACT_SNAPSHOT`, { ok: extract.ok, error: extract.error, data: extract.data });

  // Native CTB after extract
  const listCtb = await invokeEfs(supabase, companyId, 'FRP_LIST_CANONICAL_TB', {
    workspace_id: workspaceId,
  });
  const ctbs = (listCtb.data as any)?.canonical_trial_balances || [];
  const native = (ctbs as any[])
    .filter((c) => c.source_kind === 'native_gl' && c.snapshot_version_id === versionId)
    .sort((a, b) => String(b.sealed_at || '').localeCompare(String(a.sealed_at || '')))[0]
    || (ctbs as any[])
      .filter((c) => c.source_kind === 'native_gl')
      .sort((a, b) => String(b.sealed_at || '').localeCompare(String(a.sealed_at || '')))[0];

  let ctbFull = null;
  if (native?.id) {
    const got = await invokeEfs(supabase, companyId, 'FRP_GET_CANONICAL_TB', {
      canonical_tb_id: native.id,
    });
    dump(`${label}_NATIVE_CTB`, got.ok ? got.data : got.error);
    ctbFull = got.ok ? got.data : null;
  } else {
    dump(`${label}_NATIVE_CTB`, { note: 'no native_gl CTB for this version', list: listCtb.data });
  }

  const certify = await invokeEfs(supabase, companyId, 'CERTIFY_SNAPSHOT_VERSION', {
    snapshot_version_id: versionId,
  });
  dump(`${label}_CERTIFY`, { ok: certify.ok, error: certify.error, data: certify.data });

  const gen = await invokeEfs(supabase, companyId, 'GENERATE_STATEMENTS', {
    workspace_id: workspaceId,
    snapshot_version_id: versionId,
  });
  dump(`${label}_GENERATE_STATEMENTS`, { ok: gen.ok, error: gen.error, data: gen.data });

  const stmts = await invokeEfs(supabase, companyId, 'GET_STATEMENTS', {
    workspace_id: workspaceId,
    snapshot_version_id: versionId,
  });
  dump(`${label}_GET_STATEMENTS`, stmts.ok ? stmts.data : stmts.error);

  return { versionId, extract, certify, gen, stmts: stmts.data, ctb: ctbFull };
}

async function main() {
  const supabase = createClient(URL, ANON);
  const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (auth.error) {
    dump('AUTH_FAILED', auth.error);
    process.exit(1);
  }

  const companyId = '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752'; // Spaceman
  // Open workspace (not the already-certified V6.10.2 engagement)
  const workspaceId = '699186a6-1bc8-438e-b528-0fa5e143b9b5'; // FY 2026 Financial Statements
  const reportingPeriodId = 'fa7fafa5-f37c-45a6-a0ca-37500fcb8022';
  const frameworkPackId = '88b72727-a66a-4f87-8e33-a86f5bfe42dc';

  dump('B_CONTEXT', { companyId, workspaceId, reportingPeriodId, frameworkPackId });

  const { data: accounts, error: aErr } = await supabase
    .from('chart_of_accounts')
    .select('id, name, type, account_number')
    .eq('company_id', companyId)
    .order('name');
  dump('ACCOUNTS', { error: aErr, count: accounts?.length, sample: (accounts || []).slice(0, 20) });

  const targetAccount =
    (accounts || []).find((a) => /bank/i.test(a.name) && a.type === 'Asset') ||
    (accounts || []).find((a) => a.type === 'Asset');
  const offsetAccount =
    (accounts || []).find(
      (a) => a.id !== targetAccount?.id && (a.type === 'Income' || /revenue|sales|income/i.test(a.name)),
    ) ||
    (accounts || []).find((a) => a.id !== targetAccount?.id && a.type === 'Liability') ||
    (accounts || []).find((a) => a.id !== targetAccount?.id);

  dump('SELECTED_ACCOUNTS', { targetAccount, offsetAccount });
  if (!targetAccount || !offsetAccount) {
    dump('BLOCKER', 'Need two accounts');
    process.exit(1);
  }

  // ── B1 BEFORE ────────────────────────────────────────────────────────────
  console.log('\n\n######## B1 — BEFORE (draft → extract → certify → statements) ########\n');

  const { data: beforeItems } = await supabase
    .from('journal_entry_items')
    .select('type, amount, journal_entries!inner(company_id)')
    .eq('account_id', targetAccount.id)
    .eq('journal_entries.company_id', companyId);
  const tbBefore = netFromItems(beforeItems);
  dump('B1_TB_BEFORE', { account: targetAccount, ...tbBefore });

  const beforePipe = await pipelineDraftExtractCertifyGenerate(
    supabase,
    companyId,
    workspaceId,
    'B1_BEFORE',
  );
  const beforeCtbLines = ((beforePipe.ctb as any)?.lines || []) as any[];
  const beforeCtbLine = findCtbLine(beforeCtbLines, targetAccount);
  dump('B1_CTB_TARGET_LINE_BEFORE', beforeCtbLine || 'NOT_FOUND');

  const beforeStmts = Array.isArray(beforePipe.stmts)
    ? beforePipe.stmts
    : (beforePipe.stmts as any)?.statements || [];
  const beforeAssets = assetsLine(beforeStmts);
  dump('B1_STATEMENT_ASSETS_LINE_BEFORE', beforeAssets);

  // ── Post adjusting journal ───────────────────────────────────────────────
  const AJ_AMOUNT = 123.45;
  dump('B1_AJ_PLANNED', {
    amount: AJ_AMOUNT,
    debit: targetAccount,
    credit: offsetAccount,
    expected_tb_delta: AJ_AMOUNT,
  });

  const createJe = await invokeJournal(supabase, companyId, 'POST', {
    entryData: {
      entry_date: '2026-02-15',
      description: `FRP B1 live trace AJ ${Date.now()}`,
      items: [
        { account_id: targetAccount.id, type: 'debit', amount: AJ_AMOUNT },
        { account_id: offsetAccount.id, type: 'credit', amount: AJ_AMOUNT },
      ],
    },
  });
  dump('B1_JOURNAL_CREATE', { ok: createJe.ok, error: createJe.error, data: createJe.data });
  const jeId = (createJe.data as any)?.id;

  if (jeId) {
    const { data: jeRow, error: jeErr } = await supabase
      .from('journal_entries')
      .select('*, journal_entry_items(*)')
      .eq('id', jeId)
      .single();
    dump('B1_JOURNAL_ROW', { error: jeErr, row: jeRow });
  } else {
    const { data: recent } = await supabase
      .from('journal_entries')
      .select('*, journal_entry_items(*)')
      .eq('company_id', companyId)
      .ilike('description', '%FRP B1 live trace AJ%')
      .order('created_at', { ascending: false })
      .limit(1);
    dump('B1_JOURNAL_ROW_FALLBACK', recent?.[0] || createJe);
  }

  const { data: afterItems } = await supabase
    .from('journal_entry_items')
    .select('type, amount, journal_entries!inner(company_id)')
    .eq('account_id', targetAccount.id)
    .eq('journal_entries.company_id', companyId);
  const tbAfter = netFromItems(afterItems);
  dump('B1_TB_AFTER', {
    account: targetAccount,
    before: tbBefore,
    after: tbAfter,
    delta: Math.round((tbAfter.net - tbBefore.net) * 100) / 100,
    expected_delta: AJ_AMOUNT,
  });

  // ── B1 AFTER ─────────────────────────────────────────────────────────────
  console.log('\n\n######## B1 — AFTER (new draft → extract → certify → statements) ########\n');
  const afterPipe = await pipelineDraftExtractCertifyGenerate(
    supabase,
    companyId,
    workspaceId,
    'B1_AFTER',
  );
  const afterCtbLines = ((afterPipe.ctb as any)?.lines || []) as any[];
  const afterCtbLine = findCtbLine(afterCtbLines, targetAccount);
  dump('B1_CTB_TARGET_LINE_AFTER', afterCtbLine || 'NOT_FOUND');
  dump('B1_CTB_TARGET_DELTA', {
    before: beforeCtbLine,
    after: afterCtbLine,
    closing_delta:
      beforeCtbLine && afterCtbLine
        ? Math.round((Number(afterCtbLine.closing_balance) - Number(beforeCtbLine.closing_balance)) * 100) /
          100
        : null,
    expected: AJ_AMOUNT,
  });

  const afterStmts = Array.isArray(afterPipe.stmts)
    ? afterPipe.stmts
    : (afterPipe.stmts as any)?.statements || [];
  const afterAssets = assetsLine(afterStmts);
  dump('B1_STATEMENT_ASSETS_LINE_AFTER', afterAssets);
  dump('B1_STATEMENT_ASSETS_DELTA', {
    before: beforeAssets,
    after: afterAssets,
    amount_delta:
      beforeAssets && afterAssets
        ? Math.round((Number(afterAssets.amount) - Number(beforeAssets.amount)) * 100) / 100
        : null,
    expected: AJ_AMOUNT,
  });

  // ── B2 convergence ───────────────────────────────────────────────────────
  console.log('\n\n######## B2 — NATIVE VS IMPORTED CONVERGENCE ########\n');

  // Use AFTER native CTB as source of truth for equivalent import
  const nativeCtb = afterPipe.ctb as any;
  if (!nativeCtb?.canonical_trial_balance?.id && !nativeCtb?.lines) {
    dump('B2_BLOCKER', 'No native CTB from B1_AFTER pipeline to compare against.');
  } else {
    const nativeMeta = nativeCtb.canonical_trial_balance || nativeCtb;
    const nativeLines = (nativeCtb.lines || []) as any[];
    dump('B2_NATIVE_CTB_FULL', nativeCtb);

    const csvLines = ['account_code,account_name,account_type,debit,credit'];
    for (const l of nativeLines) {
      const code = (l.account_code || l.line_key || `X${l.sort_order}`).toString().replace(/,/g, '');
      const name = String(l.account_name || 'Account').replace(/,/g, ' ');
      csvLines.push(
        `${code},${name},${l.account_type || 'Asset'},${Number(l.debit || 0)},${Number(l.credit || 0)}`,
      );
    }
    const equivCsv = csvLines.join('\n');
    dump('B2_EQUIVALENT_IMPORT_CSV', equivCsv);

    const src = await invokeEfs(supabase, companyId, 'FRP_CREATE_SOURCE', {
      workspace_id: workspaceId,
      reporting_period_id: reportingPeriodId,
      snapshot_version_id: afterPipe.versionId,
      source_kind: 'imported_tb',
      source_system: 'csv',
      label: `B2 convergence ${Date.now()}`,
    });
    dump('B2_CREATE_SOURCE', src.ok ? src.data : src.error);
    const sourceId = (src.data as any)?.source?.id;

    const imp = await invokeEfs(supabase, companyId, 'FRP_IMPORT_TRIAL_BALANCE', {
      source_id: sourceId,
      csv_text: equivCsv,
      file_name: 'native-equivalent.csv',
      period_start: nativeMeta.period_start,
      period_end: nativeMeta.period_end,
    });
    dump('B2_IMPORT', { ok: imp.ok, error: imp.error, data: imp.data });
    const importId = (imp.data as any)?.import?.id;

    const ms = await invokeEfs(supabase, companyId, 'FRP_ENSURE_MAPPING_SET', {
      framework_pack_id: frameworkPackId,
      source_system: 'csv',
      version_label: 'v1-b2-convergence',
    });
    const mappingSetId = (ms.data as any)?.mapping_set?.id;

    if (importId) {
      const map = await invokeEfs(supabase, companyId, 'FRP_RUN_MAPPING_ENGINE', {
        import_id: importId,
        mapping_set_id: mappingSetId,
      });
      dump('B2_MAP', { ok: map.ok, error: map.error, data: map.data });

      const seal = await invokeEfs(supabase, companyId, 'FRP_SEAL_CANONICAL_TB_FROM_IMPORT', {
        import_id: importId,
        snapshot_version_id: afterPipe.versionId,
      });
      dump('B2_SEAL_IMPORTED', { ok: seal.ok, error: seal.error, data: seal.data });
      const importedId = (seal.data as any)?.canonical_trial_balance?.id;

      if (importedId) {
        const impFull = await invokeEfs(supabase, companyId, 'FRP_GET_CANONICAL_TB', {
          canonical_tb_id: importedId,
        });
        dump('B2_IMPORTED_CTB_FULL', impFull.ok ? impFull.data : impFull.error);
        const impLines = ((impFull.data as any)?.lines || []) as any[];

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
        const diff: any[] = [];
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
                ? Math.abs(Number(nv) - Number(iv)) < 0.005 || String(nv ?? '') === String(iv ?? '')
                : false;
            if (!match) lineMatch = false;
            fieldDiffs[f] = { native: nv ?? null, imported: iv ?? null, match };
          }
          diff.push({
            key: k,
            present_in_native: !!n,
            present_in_imported: !!i,
            line_match: lineMatch,
            fields: fieldDiffs,
          });
        }
        dump('B2_FIELD_BY_FIELD_DIFF', {
          native_ctb_id: nativeMeta.id,
          imported_ctb_id: importedId,
          native_line_count: nativeLines.length,
          imported_line_count: impLines.length,
          lines_compared: diff.length,
          lines_matching: diff.filter((r) => r.line_match).length,
          lines_mismatching: diff.filter((r) => !r.line_match).length,
          diff,
        });
      }
    }
  }

  writeFileSync(
    join(OUT_DIR, 'b1-b2-summary.json'),
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        targetAccount,
        offsetAccount,
        aj_amount: AJ_AMOUNT,
        tbBefore,
        tbAfter,
        beforeVersion: beforePipe.versionId,
        afterVersion: afterPipe.versionId,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
