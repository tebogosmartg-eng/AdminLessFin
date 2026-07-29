/**
 * Financial Statements feature flags — V6.5.1 Navigation Recovery
 *
 * Architecture frozen through V6.4.6 / Internal Preview V6.5.x.
 * Phase E Publication enabled via VITE_EFS_PUBLICATION.
 * XBRL / AI remain deferred.
 *
 * V6.5.1: Vite requires static `import.meta.env.VITE_*` access — dynamic
 * `import.meta.env[key]` is not reliably replaced and evaluates as undefined.
 */

export type EfsCompanyRole = 'owner' | 'admin' | 'member';

function readEnv(raw: unknown, fallback = false): boolean {
  if (raw === undefined || raw === null || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true' || String(raw) === '1';
}

function allowlist(): string[] {
  // Static access — Vite replaces this at build/dev time.
  const raw = import.meta.env.VITE_EFS_ALLOWLIST as string | undefined;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function onAllowlist(opts: { userEmail?: string | null; userId?: string | null }): boolean {
  const list = allowlist();
  if (!list.length) return false;
  const email = (opts.userEmail || '').toLowerCase();
  const id = (opts.userId || '').toLowerCase();
  return list.includes(email) || list.includes(id);
}

export const efsFlags = {
  /** Master switch for FS statutory module */
  module: () => readEnv(import.meta.env.VITE_EFS_MODULE, false),
  /** Mount routes / pages (lab / internal preview) */
  workspaceUi: () => readEnv(import.meta.env.VITE_EFS_WORKSPACE_UI, false),
  /**
   * Sidebar entry — Internal Preview (V6.5.0+).
   * Kill-switch: set VITE_EFS_NAV_SIDEBAR=false to hide nav without redeploying UI.
   */
  navSidebar: () => readEnv(import.meta.env.VITE_EFS_NAV_SIDEBAR, false),
  /** Snapshot extract/certify/freeze pipeline */
  snapshotPipeline: () => readEnv(import.meta.env.VITE_EFS_SNAPSHOT_PIPELINE, true),
  /**
   * V6.10.1 — Developer / Internal console (Reporting Snapshot tools).
   * Default false so accountants never see snapshot / lineage / pipeline controls.
   * Enable explicitly for diagnostics: VITE_EFS_DEVELOPER_TOOLS=true
   */
  developerTools: () => readEnv(import.meta.env.VITE_EFS_DEVELOPER_TOOLS, false),
  /** Working Paper / Lead / Evidence platform (Phase C2) */
  workingPaperPlatform: () =>
    readEnv(import.meta.env.VITE_EFS_WORKING_PAPERS, true) &&
    (readEnv(import.meta.env.VITE_EFS_WORKSPACE_UI, false) ||
      readEnv(import.meta.env.VITE_EFS_MODULE, false)),
  /** Disclosure / Policy / Cross-ref platform (Phase C3) */
  disclosurePlatform: () =>
    readEnv(import.meta.env.VITE_EFS_DISCLOSURES, true) &&
    (readEnv(import.meta.env.VITE_EFS_WORKSPACE_UI, false) ||
      readEnv(import.meta.env.VITE_EFS_MODULE, false)),
  /** Validation platform (Phase D1) */
  validationPlatform: () =>
    readEnv(import.meta.env.VITE_EFS_VALIDATION, true) &&
    (readEnv(import.meta.env.VITE_EFS_WORKSPACE_UI, false) ||
      readEnv(import.meta.env.VITE_EFS_MODULE, false)),
  /** Review Workflow platform (Phase D2) */
  reviewWorkflow: () =>
    readEnv(import.meta.env.VITE_EFS_REVIEW_WORKFLOW, true) &&
    (readEnv(import.meta.env.VITE_EFS_WORKSPACE_UI, false) ||
      readEnv(import.meta.env.VITE_EFS_MODULE, false)),
  /** Publication platform (Phase E) */
  publicationPlatform: () =>
    readEnv(import.meta.env.VITE_EFS_PUBLICATION, true) &&
    (readEnv(import.meta.env.VITE_EFS_WORKSPACE_UI, false) ||
      readEnv(import.meta.env.VITE_EFS_MODULE, false)),
  /**
   * V7.0.0 — Financial Reporting Platform Canonical Trial Balance layer.
   * Import TB + mapping + native GL convergence. Default on when module enabled.
   */
  frpCanonicalTb: () =>
    readEnv(import.meta.env.VITE_EFS_FRP_CANONICAL_TB, true) &&
    (readEnv(import.meta.env.VITE_EFS_WORKSPACE_UI, false) ||
      readEnv(import.meta.env.VITE_EFS_MODULE, false)),
  /**
   * V11.0 — Accounts Production document workspace (Document Tree + Editor +
   * Live Preview + Validation + Properties). Additive; default on when the
   * module/workspace is enabled. Kill-switch: VITE_EFS_DOCUMENT_WORKSPACE=false.
   */
  documentWorkspace: () =>
    readEnv(import.meta.env.VITE_EFS_DOCUMENT_WORKSPACE, true) &&
    (readEnv(import.meta.env.VITE_EFS_WORKSPACE_UI, false) ||
      readEnv(import.meta.env.VITE_EFS_MODULE, false)),
};

/**
 * Phase E capabilities — Publication enabled via VITE_EFS_PUBLICATION.
 * XBRL / AI remain deferred.
 */
export const efsDeferredCapabilities = {
  publication: () => readEnv(import.meta.env.VITE_EFS_PUBLICATION, true),
  xbrl: () => false,
  aiAssistance: () => false,
};

export type EfsAccessOpts = {
  role?: EfsCompanyRole | string | null;
  userEmail?: string | null;
  userId?: string | null;
};

/**
 * Persona bridge (Permission Matrix V6.5.0 / V6.5.1):
 * - System Administrator → company role `owner`
 * - Finance Manager → company role `admin`
 * - Accountant → company role `member` + allowlist
 * - Internal Tester → any company role + allowlist
 */
export function isFinancialStatementsInternalPersona(opts: EfsAccessOpts): boolean {
  const role = (opts.role || '').toLowerCase();
  if (role === 'owner' || role === 'admin') return true;
  return onAllowlist(opts);
}

function moduleOrWorkspaceEnabled(): boolean {
  return efsFlags.workspaceUi() || efsFlags.module();
}

/**
 * Route access for Internal Preview.
 * Requires module/workspace flag AND an approved persona.
 */
export function canAccessFinancialStatementsWorkspace(opts: EfsAccessOpts): boolean {
  if (!moduleOrWorkspaceEnabled()) return false;
  return isFinancialStatementsInternalPersona(opts);
}

/**
 * Sidebar visibility — requires NAV_SIDEBAR + module/workspace + persona.
 */
export function shouldShowFinancialStatementsNav(opts: EfsAccessOpts): boolean {
  if (!efsFlags.navSidebar()) return false;
  return canAccessFinancialStatementsWorkspace(opts);
}

/**
 * Gate diagnostic for navigation recovery evidence (V6.5.1).
 * Safe to log — no secrets beyond boolean flag states and role.
 */
export function diagnoseFinancialStatementsNavGates(opts: EfsAccessOpts = {}) {
  const flags = {
    VITE_EFS_MODULE: efsFlags.module(),
    VITE_EFS_WORKSPACE_UI: efsFlags.workspaceUi(),
    VITE_EFS_NAV_SIDEBAR: efsFlags.navSidebar(),
    VITE_EFS_SNAPSHOT_PIPELINE: efsFlags.snapshotPipeline(),
    VITE_EFS_DEVELOPER_TOOLS: efsFlags.developerTools(),
    allowlistConfigured: allowlist().length > 0,
  };
  const persona = isFinancialStatementsInternalPersona(opts);
  const route = canAccessFinancialStatementsWorkspace(opts);
  const nav = shouldShowFinancialStatementsNav(opts);
  return {
    version: '6.10.1',
    flags,
    role: opts.role ?? null,
    personaApproved: persona,
    routeAccessible: route,
    navVisible: nav,
    blockers: [
      !flags.VITE_EFS_MODULE && !flags.VITE_EFS_WORKSPACE_UI
        ? 'module_and_workspace_ui_off'
        : null,
      !flags.VITE_EFS_NAV_SIDEBAR ? 'nav_sidebar_off' : null,
      !persona ? 'persona_denied' : null,
    ].filter(Boolean) as string[],
  };
}

/** Surfaces exposed in Internal Preview (XBRL / AI excluded). */
export const EFS_INTERNAL_PREVIEW_SURFACES = [
  'reporting_workspaces',
  'reporting_periods',
  'reporting_snapshots',
  'canonical_trial_balance',
  'trial_balance_import',
  'statement_dashboard',
  'working_papers',
  'lead_schedules',
  'disclosures',
  'validation',
  'review_workflow',
  'publication',
] as const;

export const EFS_INTERNAL_PREVIEW_HIDDEN = ['xbrl', 'ai_assistance'] as const;
