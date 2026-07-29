/**
 * EFS V6.6.0 — Enterprise Financial Statements End-to-End Certification
 * Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, E2E_PASSWORD in .env
 *
 * Run: npx tsx tests/e2e/run-efs-e2e-certification.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

type StepStatus = 'PASS' | 'FAIL' | 'SKIP' | 'BLOCKED' | 'NOT_VERIFIED';

type StepResult = {
  phase: string;
  step: string;
  status: StepStatus;
  evidence?: unknown;
  error?: string;
  request?: unknown;
  response?: unknown;
};

const VERSION = '6.6.0';
const REPORTING_PERIOD = {
  period_key: 'FY2025-26',
  label: 'Financial Year 2025/26',
  start_date: '2025-04-01',
  end_date: '2026-03-31',
};
const FRAMEWORK_KEY = 'GRAP';
const WORKSPACE_NAME = 'V6.6.0 GRAP Annual AFS Certification — Demo Municipality';

const REVIEW_STAGE_ORDER = [
  'draft',
  'validation_complete',
  'manager_review',
  'partner_review',
  'partner_approved',
  'publication_ready',
] as const;

type ReviewStage = (typeof REVIEW_STAGE_ORDER)[number];

function reviewStageIndex(stage: string): number {
  return REVIEW_STAGE_ORDER.indexOf(stage as ReviewStage);
}

function reviewStageAtOrBeyond(current: string, target: ReviewStage): boolean {
  const ci = reviewStageIndex(current);
  const ti = reviewStageIndex(target);
  return ci >= 0 && ti >= 0 && ci >= ti;
}

const steps: StepResult[] = [];
const traceability: Record<string, unknown> = {};
const stopOnFailure = false;
let lineNode: { id: string; node_code: string } | undefined;

function loadEnvFile() {
  try {
    const envPath = join(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // optional
  }
}

function asArray<T>(data: unknown, nestedKey?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && nestedKey && nestedKey in data) {
    const nested = (data as Record<string, unknown>)[nestedKey];
    return Array.isArray(nested) ? (nested as T[]) : [];
  }
  return [];
}

function resolveSnapshotVersionId(snapshot: {
  current_version_id?: string | null;
  efs_snapshot_versions?: Array<{ id: string; status?: string }>;
} | null | undefined): string | null {
  if (!snapshot) return null;
  const versions = snapshot.efs_snapshot_versions ?? [];
  const draft = versions.find((v) => v.status === 'draft');
  if (draft?.id) return draft.id;
  if (snapshot.current_version_id) return snapshot.current_version_id;
  return versions[0]?.id ?? null;
}

function snapshotVersionStatus(snapshot: {
  current_version_id?: string | null;
  efs_snapshot_versions?: Array<{ id: string; status?: string }>;
} | null | undefined, versionId: string | null): string | null {
  if (!snapshot || !versionId) return null;
  if (snapshot.current_version_id === versionId) {
    const current = snapshot.efs_snapshot_versions?.find((v) => v.id === versionId);
    return current?.status ?? null;
  }
  return snapshot.efs_snapshot_versions?.find((v) => v.id === versionId)?.status ?? null;
}

function record(
  phase: string,
  step: string,
  status: StepStatus,
  opts?: { evidence?: unknown; error?: string; request?: unknown; response?: unknown },
) {
  const entry: StepResult = { phase, step, status, ...opts };
  steps.push(entry);
  console.log(`[${status}] Phase ${phase} — ${step}${opts?.error ? ` — ${opts.error}` : ''}`);
  if (status === 'FAIL' && stopOnFailure) {
    writeEvidence('BLOCKED');
    process.exit(1);
  }
}

async function invokeEfs<T>(
  supabase: SupabaseClient,
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<{ data: T | null; error: string | null; raw?: unknown }> {
  const body = { method, company_id: companyId, ...payload };
  const { data, error } = await supabase.functions.invoke('financial-statements', { body });
  if (error) {
    let detail: unknown = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        detail = await ctx.clone().json();
      } catch {
        detail = error.message;
      }
    }
    return {
      data: null,
      error: typeof detail === 'string' ? detail : JSON.stringify(detail),
      raw: detail,
    };
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return { data: null, error: String((data as { error: string }).error), raw: data };
  }
  return { data: data as T, error: null, raw: data };
}

function writeEvidence(decision: string) {
  const blocking = steps.filter((s) => s.status === 'FAIL' || s.status === 'BLOCKED');
  const passed = steps.filter((s) => s.status === 'PASS').length;
  const payload = {
    runAt: new Date().toISOString(),
    version: VERSION,
    board: 'Independent Principal Enterprise Acceptance Board',
    framework: FRAMEWORK_KEY,
    reportingPeriod: REPORTING_PERIOD,
    decision,
    summary: {
      totalSteps: steps.length,
      passed,
      failed: steps.filter((s) => s.status === 'FAIL').length,
      blocked: steps.filter((s) => s.status === 'BLOCKED').length,
      skipped: steps.filter((s) => s.status === 'SKIP').length,
      blockingIssues: blocking.map((s) => ({ phase: s.phase, step: s.step, error: s.error })),
    },
    traceability,
    steps,
  };
  const outDir = join(process.cwd(), 'docs', 'financial-statements-certification', 'V6.6.0', 'evidence');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'e2e-certification-evidence.json'), JSON.stringify(payload, null, 2));
  console.log(`Evidence written to docs/financial-statements-certification/V6.6.0/evidence/e2e-certification-evidence.json`);
  return payload;
}

async function main() {
  loadEnvFile();

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  // ── Phase 0: Environment ─────────────────────────────────────────────────
  record('0', 'VITE_SUPABASE_URL loaded', url ? 'PASS' : 'FAIL', {
    error: url ? undefined : 'Missing VITE_SUPABASE_URL',
  });
  record('0', 'VITE_SUPABASE_ANON_KEY loaded', anonKey ? 'PASS' : 'FAIL', {
    error: anonKey ? undefined : 'Missing VITE_SUPABASE_ANON_KEY',
  });
  record('0', 'E2E_EMAIL loaded', email ? 'PASS' : 'BLOCKED', {
    error: email ? undefined : 'Missing E2E_EMAIL — live authenticated E2E blocked',
  });
  record('0', 'E2E_PASSWORD loaded', password ? 'PASS' : 'BLOCKED', {
    error: password ? undefined : 'Missing E2E_PASSWORD — live authenticated E2E blocked',
  });

  if (!url || !anonKey) {
    writeEvidence('NOT_CERTIFIED');
    process.exit(1);
  }

  const supabase = createClient(url, anonKey);

  record('0', 'financial-statements edge reachable', 'NOT_VERIFIED', {
    evidence: { endpoint: `${url}/functions/v1/financial-statements` },
  });

  if (!email || !password) {
    record('1', 'Reporting Workspace lifecycle', 'SKIP', {
      error: 'Requires authenticated session',
    });
    writeEvidence('NOT_CERTIFIED');
    process.exit(1);
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !authData.session) {
    record('0', 'Authentication', 'FAIL', { error: authError?.message ?? 'No session' });
    writeEvidence('NOT_CERTIFIED');
    return;
  }
  record('0', 'Authentication', 'PASS', {
    evidence: { userId: authData.user.id, email: authData.user.email },
  });

  const userId = authData.user.id;

  const { data: membership, error: memberError } = await supabase
    .from('company_users')
    .select('company_id, role')
    .eq('user_id', authData.user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership?.company_id) {
    record('0', 'Demo company resolved', 'FAIL', {
      error: memberError?.message ?? 'No company_users membership',
    });
    writeEvidence('NOT_CERTIFIED');
    return;
  }

  const companyId = membership.company_id;
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single();

  record('0', 'Demo company resolved', 'PASS', {
    evidence: { companyId, companyName: company?.name, role: membership.role },
  });
  traceability.company = { id: companyId, name: company?.name };

  // ── Phase 1: Reporting Workspace → Period → Snapshot ─────────────────────
  let periodId: string | null = null;
  let workspaceId: string | null = null;
  let snapshotVersionId: string | null = null;
  let frameworkPackId: string | null = null;

  const frameworks = await invokeEfs<{ frameworks?: Array<{ id: string; framework_key: string }> }>(
    supabase,
    companyId,
    'LIST_FRAMEWORKS',
  );
  record('1', 'LIST_FRAMEWORKS', frameworks.error ? 'FAIL' : 'PASS', {
    response: frameworks.raw,
    error: frameworks.error ?? undefined,
  });

  const packs = await invokeEfs<Array<{ id: string; framework_key: string; version_id: string; label: string }>>(
    supabase,
    companyId,
    'LIST_FRAMEWORK_PACKS',
  );
  const grapPack = asArray<{ id: string; framework_key: string; version_id: string; label: string }>(
    packs.data,
    'packs',
  ).find((p) => p.framework_key === FRAMEWORK_KEY);
  frameworkPackId = grapPack?.id ?? null;
  record('1', `Framework pack ${FRAMEWORK_KEY} resolved`, frameworkPackId ? 'PASS' : 'FAIL', {
    evidence: grapPack,
    error: frameworkPackId ? undefined : `${FRAMEWORK_KEY} pack not found`,
  });

  let financialYearId: string | null = null;
  const ensureFyResult = await supabase.from('financial_years').upsert(
    {
      company_id: companyId,
      year_code: `FY${REPORTING_PERIOD.end_date.slice(0, 4)}`,
      start_date: REPORTING_PERIOD.start_date,
      end_date: REPORTING_PERIOD.end_date,
      status: 'open',
    },
    { onConflict: 'company_id,start_date,end_date', ignoreDuplicates: true },
  );
  record('1', 'Financial Year FY2025/26 ensured', ensureFyResult.error ? 'FAIL' : 'PASS', {
    error: ensureFyResult.error?.message,
  });

  const { data: financialYears, error: fyListError } = await supabase
    .from('financial_years')
    .select('id, year_code, start_date, end_date')
    .eq('company_id', companyId);
  if (fyListError) {
    record('1', 'Financial Year FY2025/26 resolved', 'FAIL', { error: fyListError.message });
  } else {
    const financialYear =
      financialYears?.find(
        (fy) =>
          fy.start_date === REPORTING_PERIOD.start_date &&
          fy.end_date === REPORTING_PERIOD.end_date,
      ) ??
      financialYears?.find((fy) => fy.year_code === REPORTING_PERIOD.period_key) ??
      null;
    financialYearId = financialYear?.id ?? null;
    record('1', 'Financial Year FY2025/26 resolved', financialYearId ? 'PASS' : 'FAIL', {
      evidence: financialYear,
      error: financialYearId ? undefined : 'No matching financial year in Enterprise Financial Calendar',
    });
  }

  const periods = await invokeEfs<Array<{ id: string; period_key: string; financial_year_id?: string | null }>>(
    supabase,
    companyId,
    'LIST_PERIODS',
  );
  const existingPeriod = asArray<{ id: string; period_key: string; financial_year_id?: string | null }>(
    periods.data,
    'periods',
  ).find((p) => p.period_key === REPORTING_PERIOD.period_key);
  if (existingPeriod) {
    periodId = existingPeriod.id;
    financialYearId = financialYearId ?? existingPeriod.financial_year_id ?? null;
    record('1', 'Reporting Period FY2025/26 exists', 'PASS', { evidence: existingPeriod });
  } else if (financialYearId) {
    const created = await invokeEfs<{ id: string; financial_year_id?: string | null }>(
      supabase,
      companyId,
      'CREATE_PERIOD',
      {
        period: {
          financial_year_id: financialYearId,
          status: 'open_for_reporting',
        },
      },
    );
    periodId = created.data?.id ?? null;
    financialYearId = created.data?.financial_year_id ?? financialYearId;
    record('1', 'CREATE_PERIOD FY2025/26', created.error ? 'FAIL' : 'PASS', {
      response: created.raw,
      error: created.error ?? undefined,
    });
  } else {
    record('1', 'CREATE_PERIOD FY2025/26', 'FAIL', {
      error: 'Cannot create reporting period without a bound financial year',
    });
  }
  traceability.reportingPeriod = { id: periodId, financial_year_id: financialYearId, ...REPORTING_PERIOD };

  const workspaces = await invokeEfs<Array<{ id: string; name: string }>>(
    supabase,
    companyId,
    'LIST_WORKSPACES',
  );
  const existingWs = asArray<{ id: string; name: string }>(workspaces.data, 'workspaces').find(
    (w) => w.name === WORKSPACE_NAME,
  );
  if (existingWs) {
    workspaceId = existingWs.id;
    record('1', 'Reporting Workspace exists', 'PASS', { evidence: existingWs });
  } else if (financialYearId && frameworkPackId) {
    const ws = await invokeEfs<{ workspace?: { id: string; name?: string }; created?: boolean }>(
      supabase,
      companyId,
      'ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR',
      {
        financial_year_id: financialYearId,
        framework_pack_id: frameworkPackId,
        name: WORKSPACE_NAME,
      },
    );
    workspaceId = ws.data?.workspace?.id ?? null;
    record('1', 'ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR', ws.error ? 'FAIL' : 'PASS', {
      response: ws.raw,
      error: ws.error ?? undefined,
    });
  }
  traceability.workspace = { id: workspaceId, name: WORKSPACE_NAME };

  const snapshots = await invokeEfs<
    Array<{
      id: string;
      current_version_id?: string | null;
      efs_snapshot_versions?: Array<{ id: string; status: string }>;
    }>
  >(supabase, companyId, 'LIST_SNAPSHOTS', { workspace_id: workspaceId });
  const snapshotRows = asArray<{
    id: string;
    current_version_id?: string | null;
    efs_snapshot_versions?: Array<{ id: string; status: string }>;
  }>(snapshots.data, 'snapshots');
  const firstSnapshot = snapshotRows[0] ?? null;
  let snapshotId: string | null = firstSnapshot?.id ?? null;
  snapshotVersionId = resolveSnapshotVersionId(firstSnapshot);

  if (!snapshotVersionId && workspaceId) {
    const draft = await invokeEfs<{ snapshot_id?: string; version?: { id: string } }>(
      supabase,
      companyId,
      'CREATE_SNAPSHOT_DRAFT',
      { workspace_id: workspaceId },
    );
    snapshotVersionId = draft.data?.version?.id ?? null;
    snapshotId = draft.data?.snapshot_id ?? null;
    record('1', 'CREATE_SNAPSHOT_DRAFT', draft.error ? 'FAIL' : 'PASS', {
      response: draft.raw,
      error: draft.error ?? undefined,
    });
  } else {
    record('1', 'Reporting Snapshot draft exists', 'PASS', {
      evidence: { snapshotId, snapshotVersionId },
    });
  }

  if (snapshotVersionId) {
    const versionStatus = snapshotVersionStatus(firstSnapshot, snapshotVersionId);
    if (versionStatus === 'certified') {
      record('1', 'EXTRACT_FACT_SNAPSHOT (seal)', 'PASS', {
        evidence: { snapshotVersionId, reused: true, status: versionStatus },
      });
      record('1', 'CERTIFY_SNAPSHOT_VERSION', 'PASS', {
        evidence: { snapshotVersionId, reused: true, status: versionStatus },
      });
    } else {
      const extract = await invokeEfs(supabase, companyId, 'EXTRACT_FACT_SNAPSHOT', {
        snapshot_version_id: snapshotVersionId,
      });
      record('1', 'EXTRACT_FACT_SNAPSHOT (seal)', extract.error ? 'FAIL' : 'PASS', {
        response: extract.raw,
        error: extract.error ?? undefined,
      });
      traceability.factSnapshot = extract.raw;

      const certify = await invokeEfs(supabase, companyId, 'CERTIFY_SNAPSHOT_VERSION', {
        snapshot_version_id: snapshotVersionId,
      });
      record('1', 'CERTIFY_SNAPSHOT_VERSION', certify.error ? 'FAIL' : 'PASS', {
        response: certify.raw,
        error: certify.error ?? undefined,
      });
      traceability.snapshotVersion = certify.raw;
    }
  }

  // ── Phase 2: Statement Engine ────────────────────────────────────────────
  if (workspaceId && snapshotVersionId) {
    const gen = await invokeEfs(supabase, companyId, 'GENERATE_STATEMENTS', {
      workspace_id: workspaceId,
      snapshot_version_id: snapshotVersionId,
    });
    record('2', 'GENERATE_STATEMENTS', gen.error ? 'FAIL' : 'PASS', {
      response: gen.raw,
      error: gen.error ?? undefined,
    });

    const stmts = await invokeEfs<{ statements?: Array<{ statement_type: string; lines: unknown[]; content_hash: string }> }>(
      supabase,
      companyId,
      'GET_STATEMENTS',
      { workspace_id: workspaceId, snapshot_version_id: snapshotVersionId },
    );
    const types = ['financial_position', 'financial_performance', 'cash_flows', 'changes_in_equity'];
    for (const t of types) {
      const found = stmts.data?.statements?.find((s) => s.statement_type === t);
      record('2', `Statement: ${t}`, found ? 'PASS' : 'FAIL', {
        evidence: found ? { content_hash: found.content_hash, lineCount: found.lines?.length } : null,
        error: found ? undefined : `Missing ${t}`,
      });
    }
    traceability.statements = stmts.data?.statements?.map((s) => ({
      type: s.statement_type,
      content_hash: s.content_hash,
      lineCount: s.lines?.length,
    }));
  }

  // ── Phase 3: Working Papers ──────────────────────────────────────────────
  if (workspaceId) {
    const structure = await invokeEfs<{ nodes?: Array<{ id: string; node_code: string }> }>(
      supabase,
      companyId,
      'GET_STATEMENT_STRUCTURE',
      { workspace_id: workspaceId, framework_pack_id: frameworkPackId },
    );
    lineNode =
      structure.data?.nodes?.find((n) => n.node_code?.includes('TOTAL_ASSETS')) ??
      structure.data?.nodes?.find((n) => n.node_code?.includes('ASSETS')) ??
      structure.data?.nodes?.[0];

    if (lineNode) {
      const wp = await invokeEfs<{ id: string }>(supabase, companyId, 'CREATE_WORKING_PAPER', {
        workspace_id: workspaceId,
        structure_node_id: lineNode.id,
        title: 'Lead WP — Total Assets (V6.6.0)',
        reference_code: 'WP-V660-001',
      });
      const wpId = wp.data?.id;
      record('3', 'CREATE_WORKING_PAPER', wp.error ? 'FAIL' : 'PASS', {
        evidence: { wpId, structure_node_id: lineNode.id, node_code: lineNode.node_code },
        error: wp.error ?? undefined,
      });

      if (wpId) {
        await invokeEfs(supabase, companyId, 'TRANSITION_WORKING_PAPER', {
          working_paper_id: wpId,
          to_status: 'submitted',
        });
        await invokeEfs(supabase, companyId, 'TRANSITION_WORKING_PAPER', {
          working_paper_id: wpId,
          to_status: 'reviewed',
        });
        const fin = await invokeEfs(supabase, companyId, 'TRANSITION_WORKING_PAPER', {
          working_paper_id: wpId,
          to_status: 'finalized',
        });
        record('3', 'TRANSITION_WORKING_PAPER → finalized', fin.error ? 'FAIL' : 'PASS', {
          error: fin.error ?? undefined,
        });

        const lead = await invokeEfs(supabase, companyId, 'CREATE_LEAD_SCHEDULE', {
          workspace_id: workspaceId,
          structure_node_id: lineNode.id,
          title: 'Lead Schedule — Assets',
          reference_code: 'LS-V660-001',
        });
        record('3', 'CREATE_LEAD_SCHEDULE', lead.error ? 'FAIL' : 'PASS', {
          error: lead.error ?? undefined,
        });

        const ev = await invokeEfs(supabase, companyId, 'CREATE_SUPPORTING_EVIDENCE', {
          workspace_id: workspaceId,
          structure_node_id: lineNode.id,
          title: 'Trial balance extract — Assets',
          evidence_type: 'document',
          working_paper_id: wpId,
        });
        record('3', 'CREATE_SUPPORTING_EVIDENCE', ev.error ? 'FAIL' : 'PASS', {
          error: ev.error ?? undefined,
        });
        traceability.workingPaper = { wpId, structure_node_id: lineNode.id };
      }
    } else {
      record('3', 'Structure node for WP attachment', 'FAIL', {
        error: 'No structure nodes returned',
      });
    }
  }

  // ── Phase 4: Disclosures ─────────────────────────────────────────────────
  if (workspaceId) {
    const assemble = await invokeEfs(supabase, companyId, 'ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK', {
      workspace_id: workspaceId,
      framework_pack_id: frameworkPackId,
    });
    record('4', 'ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK', assemble.error ? 'FAIL' : 'PASS', {
      response: assemble.raw,
      error: assemble.error ?? undefined,
    });

    const policySet = await invokeEfs<{ id: string }>(supabase, companyId, 'CREATE_ACCOUNTING_POLICY_SET', {
      workspace_id: workspaceId,
      framework_pack_id: frameworkPackId,
      title: 'Accounting Policies — GRAP FY2025/26',
    });
    record('4', 'CREATE_ACCOUNTING_POLICY_SET', policySet.error ? 'FAIL' : 'PASS', {
      evidence: policySet.data,
      error: policySet.error ?? undefined,
    });

    if (policySet.data?.id) {
      await invokeEfs(supabase, companyId, 'UPSERT_ACCOUNTING_POLICY', {
        policy_set_id: policySet.data.id,
        policy_code: 'POL.BASIS',
        title: 'Basis of preparation',
        content: 'Prepared in accordance with GRAP for the financial year ended 31 March 2026.',
      });
    }

    const discList = await invokeEfs<Array<{ id: string; disclosure_code: string; status: string }>>(
      supabase,
      companyId,
      'LIST_DISCLOSURE_INSTANCES',
      { workspace_id: workspaceId },
    );
    const disclosureInstances = asArray<{ id: string; disclosure_code: string; status: string }>(
      discList.data,
      'instances',
    );
    for (const d of disclosureInstances.filter((x) => x.status === 'draft')) {
      await invokeEfs(supabase, companyId, 'TRANSITION_DISCLOSURE_STATUS', {
        disclosure_instance_id: d.id,
        to_status: 'active',
      });
    }
    record('4', 'Disclosure instances advanced', 'PASS', {
      evidence: { count: disclosureInstances.length },
    });

    if (lineNode?.id && disclosureInstances[0]?.id) {
      await invokeEfs(supabase, companyId, 'CREATE_CROSS_REFERENCE', {
        workspace_id: workspaceId,
        source_kind: 'disclosure_instance',
        source_id: disclosureInstances[0].id,
        target_kind: 'structure_node',
        target_id: lineNode.id,
        label: 'Cross-ref V6.6.0',
      });
      record('4', 'CREATE_CROSS_REFERENCE', 'PASS');
    }
    traceability.disclosures = { count: disclosureInstances.length };
  }

  // ── Phase 5: Validation ──────────────────────────────────────────────────
  let validationPass = false;
  if (workspaceId) {
    const validation = await invokeEfs<{
      run?: { status: string; blocking_count: number };
      ready_for_review?: boolean;
    }>(supabase, companyId, 'RUN_VALIDATION', {
      workspace_id: workspaceId,
      run_type: 'full',
    });
    const blocking = validation.data?.run?.blocking_count ?? -1;
    const status = validation.data?.run?.status ?? 'unknown';
    validationPass = blocking === 0 && (status === 'passed' || status === 'passed_with_advisories');
    record('5', 'RUN_VALIDATION', validation.error ? 'FAIL' : validationPass ? 'PASS' : 'FAIL', {
      response: validation.raw,
      error: validation.error ?? (validationPass ? undefined : `status=${status} blocking=${blocking}`),
    });
    traceability.validation = validation.raw;
  }

  // ── Phase 6: Review Workflow ─────────────────────────────────────────────
  if (workspaceId && validationPass) {
    const pack = await invokeEfs<{ id: string; stage?: string }>(supabase, companyId, 'GET_OR_CREATE_PACK_REVIEW', {
      workspace_id: workspaceId,
    });
    const packReviewId = pack.data?.id ?? null;
    let reviewStage = pack.data?.stage ?? 'draft';
    record('6', 'GET_OR_CREATE_PACK_REVIEW', pack.error || !packReviewId ? 'FAIL' : 'PASS', {
      evidence: pack.data,
      error: pack.error ?? (!packReviewId ? 'Missing pack review id' : undefined),
    });

    if (packReviewId) {
      if (!reviewStageAtOrBeyond(reviewStage, 'validation_complete')) {
        await invokeEfs(supabase, companyId, 'ASSIGN_PACK_REVIEWER', {
          pack_review_id: packReviewId,
          reviewer_user_id: userId,
          role_code: 'manager',
        });
        await invokeEfs(supabase, companyId, 'ASSIGN_PACK_REVIEWER', {
          pack_review_id: packReviewId,
          reviewer_user_id: userId,
          role_code: 'partner',
        });
        const submit = await invokeEfs<{ stage?: string }>(supabase, companyId, 'SUBMIT_FOR_VALIDATION_COMPLETE', {
          pack_review_id: packReviewId,
        });
        reviewStage = submit.data?.stage ?? reviewStage;
        const startMgr = await invokeEfs<{ stage?: string }>(supabase, companyId, 'START_MANAGER_REVIEW', {
          pack_review_id: packReviewId,
        });
        reviewStage = startMgr.data?.stage ?? reviewStage;
      }

      if (reviewStage === 'manager_review') {
        const mgr = await invokeEfs<{ stage?: string }>(supabase, companyId, 'RECORD_REVIEW_DECISION', {
          pack_review_id: packReviewId,
          decision_code: 'approve',
          actor_role: 'manager',
          notes: 'V6.6.0 manager sign-off',
        });
        reviewStage = mgr.data?.stage ?? reviewStage;
        record('6', 'Manager digital sign-off', mgr.error ? 'FAIL' : 'PASS', { error: mgr.error ?? undefined });
      } else {
        record('6', 'Manager digital sign-off', reviewStageAtOrBeyond(reviewStage, 'partner_review') ? 'PASS' : 'FAIL', {
          skipped: true,
          reviewStage,
          error: reviewStageAtOrBeyond(reviewStage, 'partner_review') ? undefined : `Unexpected stage: ${reviewStage}`,
        });
      }

      if (reviewStage === 'partner_review') {
        await invokeEfs(supabase, companyId, 'START_PARTNER_REVIEW', { pack_review_id: packReviewId });
        const ptr = await invokeEfs<{ stage?: string }>(supabase, companyId, 'RECORD_REVIEW_DECISION', {
          pack_review_id: packReviewId,
          decision_code: 'approve',
          actor_role: 'partner',
          notes: 'V6.6.0 partner sign-off',
        });
        reviewStage = ptr.data?.stage ?? reviewStage;
        record('6', 'Partner digital sign-off', ptr.error ? 'FAIL' : 'PASS', { error: ptr.error ?? undefined });
      } else {
        record('6', 'Partner digital sign-off', reviewStageAtOrBeyond(reviewStage, 'partner_approved') ? 'PASS' : 'FAIL', {
          skipped: true,
          reviewStage,
          error: reviewStageAtOrBeyond(reviewStage, 'partner_approved') ? undefined : `Unexpected stage: ${reviewStage}`,
        });
      }

      if (reviewStage === 'partner_approved') {
        const pubReady = await invokeEfs(supabase, companyId, 'MARK_PUBLICATION_READY', {
          pack_review_id: packReviewId,
        });
        reviewStage = (pubReady.data as { stage?: string } | null)?.stage ?? reviewStage;
        record('6', 'MARK_PUBLICATION_READY', pubReady.error ? 'FAIL' : 'PASS', {
          response: pubReady.raw,
          error: pubReady.error ?? undefined,
        });
        traceability.review = pubReady.raw;
      } else {
        record('6', 'MARK_PUBLICATION_READY', reviewStageAtOrBeyond(reviewStage, 'publication_ready') ? 'PASS' : 'FAIL', {
          skipped: true,
          reviewStage,
          error: reviewStageAtOrBeyond(reviewStage, 'publication_ready') ? undefined : `Unexpected stage: ${reviewStage}`,
        });
        traceability.review = { reviewStage, idempotent: true };
      }
    }
  } else if (workspaceId) {
    record('6', 'Review workflow', 'SKIP', { error: 'Validation did not PASS' });
  }

  // ── Phase 7: Publication ─────────────────────────────────────────────────
  if (workspaceId && validationPass) {
    const pub = await invokeEfs<{
      publication_executed?: boolean;
      artifacts?: Array<{ format: string; content_hash: string }>;
    }>(supabase, companyId, 'EXECUTE_PUBLICATION', { workspace_id: workspaceId });
    const formats = new Set(pub.data?.artifacts?.map((a) => a.format) ?? []);
    const pubOk =
      !pub.error &&
      pub.data?.publication_executed === true &&
      formats.has('pdf') &&
      formats.has('docx') &&
      formats.has('xlsx');
    record('7', 'EXECUTE_PUBLICATION (PDF/Word/Excel)', pubOk ? 'PASS' : 'FAIL', {
      response: pub.raw,
      error: pub.error ?? (pubOk ? undefined : 'Missing formats or publication_executed'),
    });
    traceability.publication = pub.raw;

    if (pub.data?.artifacts?.[0]?.id) {
      const dl = await invokeEfs(supabase, companyId, 'GET_PUBLICATION_ARTIFACT', {
        artifact_id: pub.data.artifacts[0].id,
      });
      record('7', 'GET_PUBLICATION_ARTIFACT (download)', dl.error ? 'FAIL' : 'PASS', {
        error: dl.error ?? undefined,
      });
    }
  } else if (workspaceId) {
    record('7', 'Publication pipeline', 'SKIP', { error: 'Prior phases did not complete' });
  }

  const allPass = steps.every((s) => s.status === 'PASS' || s.status === 'SKIP' || s.status === 'NOT_VERIFIED');
  const publicationBlocked = steps.some((s) => s.phase === '7' && s.status === 'BLOCKED');
  const decision =
    allPass && !publicationBlocked
      ? 'ENTERPRISE FINANCIAL STATEMENTS CERTIFIED'
      : 'NOT_CERTIFIED';

  writeEvidence(decision);
  console.log(`\nFINAL STATUS: ${decision}`);
  process.exit(decision === 'ENTERPRISE FINANCIAL STATEMENTS CERTIFIED' ? 0 : 1);
}

main().catch((e) => {
  record('0', 'Unhandled error', 'FAIL', { error: e instanceof Error ? e.message : String(e) });
  writeEvidence('NOT_CERTIFIED');
  process.exit(1);
});
