/**
 * AFS Document Workspace — client document model (V11.0).
 *
 * Assembles a complete, editable Annual Financial Statements document from the
 * EXISTING Financial Statements edge APIs. Read-only consumption of the engine:
 * this file NEVER modifies statements, disclosures, or GL — it only reads them
 * and (on first open) triggers the existing generic-content assembly methods.
 *
 * A complete generic document always exists (cover, contents, statement
 * skeletons, accounting policies, required notes) even before a Trial Balance
 * has been imported.
 */
import {
  invokeFinancialStatements,
  type EfsDashboard,
  type EfsWorkspaceGeneralInformation,
  type EfsStatementInstance,
  type EfsStatementLine,
} from '../api';
import { accountingPoliciesService } from '@/governance/domains/accountingPolicies/service';
import { assembleSignatures, type DocSignatureNode } from './signatureModel';
import {
  assembleFrameworkDocument,
  type OptionalDisclosureStatus,
} from '../framework/frameworkContentEngine';
import { inferDisclosureConditions } from '../framework/frameworkContent';
import type { ManualField } from '../framework/trialBalanceDisclosureMapping';

export type { DocSignatureNode } from './signatureModel';
export type { OptionalDisclosureStatus } from '../framework/frameworkContentEngine';
export type { ManualField } from '../framework/trialBalanceDisclosureMapping';

export type DocNodeKind =
  | 'cover'
  | 'contents'
  | 'statement'
  | 'policySet'
  | 'policy'
  | 'note'
  | 'signature';

export type DocStatementNode = {
  id: string;
  kind: 'statement';
  statement_type: string;
  title: string;
  lines: EfsStatementLine[];
  populated: boolean;
};

export type DocPolicyNode = {
  id: string;
  kind: 'policy';
  policy_set_id: string;
  policy_code: string;
  title: string;
  body: string;
  sort_order: number;
  status?: string;
  /** Provenance: 'engagement' (server, editable) or 'framework' (generated). */
  source?: 'engagement' | 'framework';
};

export type DocPolicySetNode = {
  id: string;
  kind: 'policySet';
  title: string;
  status: string;
  version_no: number;
  framework_pack_id?: string | null;
  policies: DocPolicyNode[];
};

export type DocSection = {
  id: string;
  section_code: string;
  title: string;
  body: string;
  sort_order: number;
};

export type DocParagraph = {
  id: string;
  section_id?: string | null;
  paragraph_code: string;
  body: string;
  sort_order: number;
};

export type DocTable = {
  id: string;
  table_code: string;
  title: string;
  columns_json: unknown[];
  rows_json: unknown[];
  sort_order: number;
};

export type DocNoteNode = {
  id: string;
  kind: 'note';
  disclosure_code: string;
  title: string;
  status: string;
  requirement_level: string;
  sort_order: number;
  sections: DocSection[];
  paragraphs: DocParagraph[];
  tables: DocTable[];
  /** Provenance: 'engagement' (server, editable) or 'framework' (generated). */
  source?: 'engagement' | 'framework';
};

export type DocumentPeriod = {
  label?: string;
  /**
   * Prior-period caption. Read by the comparative, consistency and corporate
   * information engines; only populated by fixtures today because the
   * engagement dashboard reporting period carries no comparative descriptor.
   */
  comparative_label?: string;
  period_key?: string;
  start_date?: string;
  end_date?: string;
} | null;

export type DocumentModel = {
  companyId: string;
  workspaceId: string;
  workspaceName: string;
  frameworkPackId: string | null;
  frameworkKey: string | null;
  frameworkLabel: string;
  entity: EfsWorkspaceGeneralInformation | null;
  period: DocumentPeriod;
  statements: DocStatementNode[];
  policySets: DocPolicySetNode[];
  notes: DocNoteNode[];
  /**
   * Structured cross-references from the disclosure platform (optional).
   * Used for advisory validation; number rewrite remains render-time over prose.
   */
  crossReferences: DocCrossReference[];
  /** Formal signature blocks assembled from engagement general information. */
  signatures: DocSignatureNode[];
  /** True when statement amounts are available (a Trial Balance has been captured). */
  trialBalanceCaptured: boolean;
  /**
   * Optional disclosures declared by the framework, with inclusion status
   * (Critical Gap 2). Flagged-but-not-inserted optionals appear here with
   * `included: false`.
   */
  optionalDisclosures?: OptionalDisclosureStatus[];
  /** Manual-completion fields in generated tables where no fact source exists. */
  manualFields?: ManualField[];
};

/** Lightweight mirror of disclosure-platform cross-reference rows (read-only). */
export type DocCrossReference = {
  id: string;
  source_kind: string;
  target_kind: string;
  label: string | null;
};

/** Canonical primary statements in professional presentation order. */
const STATEMENT_SKELETON: Array<{ statement_type: string; title: string }> = [
  { statement_type: 'financial_position', title: 'Statement of Financial Position' },
  {
    statement_type: 'financial_performance',
    title: 'Statement of Profit or Loss and Other Comprehensive Income',
  },
  { statement_type: 'changes_in_equity', title: 'Statement of Changes in Equity' },
  { statement_type: 'cash_flows', title: 'Statement of Cash Flows' },
];

type RawDisclosureInstance = {
  id: string;
  disclosure_code: string;
  title: string;
  status: string;
  requirement_level: string;
  sort_order?: number | null;
  efs_disclosure_sections?: Array<{
    id: string;
    section_code: string;
    title: string;
    body: string;
    sort_order: number;
  }>;
  efs_disclosure_paragraphs?: Array<{
    id: string;
    section_id?: string | null;
    paragraph_code: string;
    body: string;
    sort_order: number;
  }>;
  efs_disclosure_tables?: Array<{
    id: string;
    table_code: string;
    title: string;
    columns_json: unknown[];
    rows_json: unknown[];
    sort_order: number;
  }>;
};

type RawPolicySet = {
  id: string;
  title: string;
  status: string;
  version_no: number;
  framework_pack_id?: string | null;
  efs_accounting_policies?: Array<{
    id: string;
    policy_code: string;
    title: string;
    body?: string | null;
    sort_order?: number | null;
    status?: string | null;
  }>;
};

function bySort<T extends { sort_order?: number | null }>(a: T, b: T): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

function mapDisclosureInstance(raw: RawDisclosureInstance): DocNoteNode {
  const sections = (raw.efs_disclosure_sections || [])
    .map((s) => ({
      id: s.id,
      section_code: s.section_code,
      title: s.title,
      body: s.body || '',
      sort_order: s.sort_order ?? 0,
    }))
    .sort(bySort);
  const paragraphs = (raw.efs_disclosure_paragraphs || [])
    .map((p) => ({
      id: p.id,
      section_id: p.section_id ?? null,
      paragraph_code: p.paragraph_code,
      body: p.body || '',
      sort_order: p.sort_order ?? 0,
    }))
    .sort(bySort);
  const tables = (raw.efs_disclosure_tables || [])
    .map((t) => ({
      id: t.id,
      table_code: t.table_code,
      title: t.title,
      columns_json: t.columns_json || [],
      rows_json: t.rows_json || [],
      sort_order: t.sort_order ?? 0,
    }))
    .sort(bySort);
  return {
    id: raw.id,
    kind: 'note',
    disclosure_code: raw.disclosure_code,
    title: raw.title,
    status: raw.status,
    requirement_level: raw.requirement_level,
    sort_order: raw.sort_order ?? 100,
    sections,
    paragraphs,
    tables,
  };
}

function mapPolicySet(raw: RawPolicySet): DocPolicySetNode {
  const policies = (raw.efs_accounting_policies || [])
    .map((p) => ({
      id: p.id,
      kind: 'policy' as const,
      policy_set_id: raw.id,
      policy_code: p.policy_code,
      title: p.title,
      body: p.body || '',
      sort_order: p.sort_order ?? 0,
      status: p.status || undefined,
    }))
    .sort(bySort);
  return {
    id: raw.id,
    kind: 'policySet',
    title: raw.title,
    status: raw.status,
    version_no: raw.version_no,
    framework_pack_id: raw.framework_pack_id ?? null,
    policies,
  };
}

function buildStatements(instances: EfsStatementInstance[]): DocStatementNode[] {
  const byType = new Map<string, EfsStatementInstance>();
  for (const inst of instances) byType.set(inst.statement_type, inst);
  return STATEMENT_SKELETON.map((sk) => {
    const inst = byType.get(sk.statement_type);
    return {
      id: sk.statement_type,
      kind: 'statement' as const,
      statement_type: sk.statement_type,
      title: inst?.title || sk.title,
      lines: (inst?.lines as EfsStatementLine[]) || [],
      populated: !!inst && (inst.lines?.length ?? 0) > 0,
    };
  });
}

/**
 * Ensure the complete generic document exists (idempotent). Uses the existing
 * assembly methods only; safe to run before a Trial Balance is imported.
 * Returns true if any generic content was newly created.
 */
export async function ensureGenericDocument(params: {
  companyId: string;
  workspaceId: string;
  frameworkPackId: string | null;
}): Promise<boolean> {
  const { companyId, workspaceId, frameworkPackId } = params;
  if (!frameworkPackId) return false;

  let created = false;

  const disclosures = await invokeFinancialStatements<RawDisclosureInstance[]>(
    companyId,
    'LIST_DISCLOSURE_INSTANCES',
    { workspace_id: workspaceId },
  );
  if (!disclosures || disclosures.length === 0) {
    await invokeFinancialStatements(companyId, 'ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK', {
      workspace_id: workspaceId,
      framework_pack_id: frameworkPackId,
    });
    created = true;
  }

  // Phase G3.4 — narrative Accounting Policy Sets resolve through Governance.
  // Underlying LIST/CREATE edge calls are identical to the pre-migration path.
  const policySets = await accountingPoliciesService.listAccountingPolicySetsRaw(
    companyId,
    workspaceId,
  );
  if (!policySets || policySets.length === 0) {
    await accountingPoliciesService.createAccountingPolicySet(
      companyId,
      workspaceId,
      frameworkPackId,
      'Accounting Policies',
    );
    created = true;
  }

  return created;
}

/** Assemble the full client document model from existing read APIs. */
export async function loadDocumentModel(params: {
  companyId: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
}): Promise<DocumentModel> {
  const { companyId, workspaceId, dashboard, generalInfo } = params;
  const frameworkPackId = dashboard.framework?.id ?? null;
  const frameworkKey =
    dashboard.framework?.framework_key ??
    dashboard.framework?.efs_frameworks?.framework_key ??
    null;
  const frameworkLabel =
    dashboard.framework?.efs_frameworks?.name ||
    dashboard.framework?.label ||
    generalInfo?.reporting_framework ||
    frameworkKey ||
    'IFRS for SMEs';

  const [statementsRes, disclosuresRes, policySetsRes, disclosureDashRes] = await Promise.all([
    invokeFinancialStatements<{ statements: EfsStatementInstance[] }>(
      companyId,
      'GET_STATEMENTS',
      { workspace_id: workspaceId },
    ).catch(() => ({ statements: [] as EfsStatementInstance[] })),
    invokeFinancialStatements<RawDisclosureInstance[]>(
      companyId,
      'LIST_DISCLOSURE_INSTANCES',
      { workspace_id: workspaceId },
    ).catch(() => [] as RawDisclosureInstance[]),
    accountingPoliciesService
      .listAccountingPolicySetsRaw(companyId, workspaceId)
      .catch(() => [] as RawPolicySet[]),
    invokeFinancialStatements<{
      cross_references?: Array<{
        id: string;
        source_kind: string;
        target_kind: string;
        label: string | null;
      }>;
    }>(companyId, 'GET_DISCLOSURE_DASHBOARD', { workspace_id: workspaceId }).catch(() => ({
      cross_references: [] as DocCrossReference[],
    })),
  ]);

  const statementInstances = statementsRes?.statements || [];
  const statements = buildStatements(statementInstances);
  const serverNotes = (disclosuresRes || [])
    .map(mapDisclosureInstance)
    .map((n) => ({ ...n, source: 'engagement' as const }))
    .sort(bySort);
  const serverPolicySets = (policySetsRes || []).map(mapPolicySet);

  // Critical Gap 2 — Enterprise Framework Content Engine.
  // Merge engagement content (precedence, editable) with generated standard
  // framework content so a complete draft AFS always exists.
  // V14.2 — infer conditional disclosure flags from statement facts so the
  // Knowledge Repository's condition keys activate without a second engine.
  const assembled = assembleFrameworkDocument({
    frameworkKey,
    statements,
    serverNotes,
    serverPolicySets,
    context: { conditions: inferDisclosureConditions(statements) },
  });
  const notes = assembled.notes;
  const policySets = assembled.policySets;
  const crossReferences: DocCrossReference[] = (disclosureDashRes?.cross_references || []).map(
    (x) => ({
      id: x.id,
      source_kind: x.source_kind,
      target_kind: x.target_kind,
      label: x.label ?? null,
    }),
  );

  return {
    companyId,
    workspaceId,
    workspaceName: dashboard.workspace?.name || 'Annual Financial Statements',
    frameworkPackId,
    frameworkKey,
    frameworkLabel,
    entity: generalInfo,
    period: dashboard.reportingPeriod
      ? {
          // Prefer calendar year_code (period_key / year_code). Never keep frozen slash labels.
          label:
            dashboard.reportingPeriod.year_code ||
            dashboard.reportingPeriod.period_key ||
            dashboard.reportingPeriod.label,
          period_key: dashboard.reportingPeriod.period_key,
          start_date: dashboard.reportingPeriod.start_date,
          end_date: dashboard.reportingPeriod.end_date,
        }
      : null,
    statements,
    policySets,
    notes,
    crossReferences,
    signatures: assembleSignatures(generalInfo),
    trialBalanceCaptured: statements.some((s) => s.populated),
    optionalDisclosures: assembled.optionalDisclosures,
    manualFields: assembled.manualFields,
  };
}

/** Codes that identify the "Significant Accounting Policies" note. */
export const POLICY_NOTE_CODES = ['DISC.POLICIES', 'NOTE.POLICIES'];

export function isPolicyNote(note: DocNoteNode): boolean {
  return POLICY_NOTE_CODES.includes(String(note.disclosure_code || '').toUpperCase());
}
