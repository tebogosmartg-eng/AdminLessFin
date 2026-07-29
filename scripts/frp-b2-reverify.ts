/**
 * B2 re-verify after sign-convention fix.
 * Same Spaceman entity; fresh native draft CTB vs imported-equivalent.
 * Requires Income + Liability + Equity in the set.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

function loadEnvFile() {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile();

const OUT = join(process.cwd(), 'scripts', 'frp-live-proof-output');
mkdirSync(OUT, { recursive: true });

function dump(label: string, data: unknown) {
  console.log(`\n========== ${label} ==========\n`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

async function invokeEfs(
  supabase: SupabaseClient,
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.functions.invoke('financial-statements', {
    body: { method, company_id: companyId, ...payload },
  });
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
    return { ok: false as const, error: (data as any).error, data };
  }
  return { ok: true as const, error: null, data };
}

async function main() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  const auth = await supabase.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (auth.error) {
    dump('AUTH_FAILED', auth.error);
    process.exit(1);
  }

  const companyId = '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';
  const workspaceId = '699186a6-1bc8-438e-b528-0fa5e143b9b5';
  const reportingPeriodId = 'fa7fafa5-f37c-45a6-a0ca-37500fcb8022';
  const frameworkPackId = '88b72727-a66a-4f87-8e33-a86f5bfe42dc';

  const draft = await invokeEfs(supabase, companyId, 'CREATE_SNAPSHOT_DRAFT', {
    workspace_id: workspaceId,
  });
  dump('CREATE_SNAPSHOT_DRAFT', draft.ok ? draft.data : draft.error);
  const versionId =
    (draft.data as any)?.version?.id || (draft.data as any)?.snapshot_version_id;
  if (!versionId) process.exit(1);

  const extract = await invokeEfs(supabase, companyId, 'EXTRACT_FACT_SNAPSHOT', {
    snapshot_version_id: versionId,
  });
  dump('EXTRACT', { ok: extract.ok, error: extract.error });

  const list = await invokeEfs(supabase, companyId, 'FRP_LIST_CANONICAL_TB', {
    workspace_id: workspaceId,
  });
  const ctbs = ((list.data as any)?.canonical_trial_balances || []) as any[];
  const native = ctbs
    .filter((c) => c.source_kind === 'native_gl' && c.snapshot_version_id === versionId)
    .sort((a, b) => String(b.sealed_at).localeCompare(String(a.sealed_at)))[0]
    || ctbs
      .filter((c) => c.source_kind === 'native_gl')
      .sort((a, b) => String(b.sealed_at).localeCompare(String(a.sealed_at)))[0];

  if (!native?.id) {
    dump('NO_NATIVE', list.data);
    process.exit(1);
  }

  const nativeFull = await invokeEfs(supabase, companyId, 'FRP_GET_CANONICAL_TB', {
    canonical_tb_id: native.id,
  });
  dump('NATIVE_CTB_FULL', nativeFull.ok ? nativeFull.data : nativeFull.error);
  const nativeLines = ((nativeFull.data as any)?.lines || []) as any[];
  const types = new Set(nativeLines.map((l) => l.account_type));
  dump('NATIVE_TYPE_COVERAGE', {
    types: [...types],
    hasIncome: types.has('Income'),
    hasLiability: types.has('Liability'),
    hasEquity: types.has('Equity'),
  });

  const csvLines = ['account_code,account_name,account_type,debit,credit'];
  for (const l of nativeLines) {
    const code = String(l.account_code || l.line_key).replace(/,/g, '');
    const name = String(l.account_name || 'Account').replace(/,/g, ' ');
    csvLines.push(
      `${code},${name},${l.account_type},${Number(l.debit || 0)},${Number(l.credit || 0)}`,
    );
  }
  const csv = csvLines.join('\n');
  dump('EQUIVALENT_CSV', csv);

  const src = await invokeEfs(supabase, companyId, 'FRP_CREATE_SOURCE', {
    workspace_id: workspaceId,
    reporting_period_id: reportingPeriodId,
    snapshot_version_id: versionId,
    source_kind: 'imported_tb',
    source_system: 'csv',
    label: `B2 reverify ${Date.now()}`,
  });
  const sourceId = (src.data as any)?.source?.id;
  dump('CREATE_SOURCE', src.ok ? src.data : src.error);

  const meta = (nativeFull.data as any)?.canonical_trial_balance;
  const imp = await invokeEfs(supabase, companyId, 'FRP_IMPORT_TRIAL_BALANCE', {
    source_id: sourceId,
    csv_text: csv,
    file_name: 'b2-reverify.csv',
    period_start: meta.period_start,
    period_end: meta.period_end,
  });
  dump('IMPORT', { ok: imp.ok, error: imp.error, data: imp.data });
  const importId = (imp.data as any)?.import?.id;

  const ms = await invokeEfs(supabase, companyId, 'FRP_ENSURE_MAPPING_SET', {
    framework_pack_id: frameworkPackId,
    source_system: 'csv',
    version_label: 'v1-b2-reverify',
  });
  const mappingSetId = (ms.data as any)?.mapping_set?.id;

  const map = await invokeEfs(supabase, companyId, 'FRP_RUN_MAPPING_ENGINE', {
    import_id: importId,
    mapping_set_id: mappingSetId,
  });
  dump('MAP', { ok: map.ok, error: map.error, data: map.data });

  const seal = await invokeEfs(supabase, companyId, 'FRP_SEAL_CANONICAL_TB_FROM_IMPORT', {
    import_id: importId,
    snapshot_version_id: versionId,
  });
  dump('SEAL_IMPORTED', { ok: seal.ok, error: seal.error, data: seal.data });
  const importedId = (seal.data as any)?.canonical_trial_balance?.id;
  if (!importedId) process.exit(1);

  const impFull = await invokeEfs(supabase, companyId, 'FRP_GET_CANONICAL_TB', {
    canonical_tb_id: importedId,
  });
  dump('IMPORTED_CTB_FULL', impFull.ok ? impFull.data : impFull.error);
  const impLines = ((impFull.data as any)?.lines || []) as any[];

  function keyOf(l: any) {
    return `${String(l.account_code || '').trim().toLowerCase()}|${String(l.account_name || '')
      .trim()
      .toLowerCase()}|${l.account_type}`;
  }
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
  const nativeMap = new Map(nativeLines.map((l) => [keyOf(l), l]));
  const impMap = new Map(impLines.map((l) => [keyOf(l), l]));
  const allKeys = Array.from(new Set([...nativeMap.keys(), ...impMap.keys()])).sort();
  const diff: any[] = [];
  for (const k of allKeys) {
    const n = nativeMap.get(k);
    const i = impMap.get(k);
    const fieldDiffs: Record<string, { native: unknown; imported: unknown; match: boolean }> = {};
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

  const payload = {
    native_ctb_id: native.id,
    imported_ctb_id: importedId,
    native_line_count: nativeLines.length,
    imported_line_count: impLines.length,
    lines_compared: diff.length,
    lines_matching: diff.filter((r) => r.line_match).length,
    lines_mismatching: diff.filter((r) => !r.line_match).length,
    diff,
  };
  dump('B2_FIELD_BY_FIELD_DIFF', payload);
  writeFileSync(join(OUT, 'b2-reverify-diff.json'), JSON.stringify(payload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
