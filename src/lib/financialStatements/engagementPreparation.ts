/**
 * V6.10.0 / V6.10.2 — Engagement preparation checklist (experience layer only).
 * Derives accountant-facing progress from existing dashboard payloads.
 * Next recommended action must always be obvious and truthful.
 */

import type { EfsDashboard, EfsEngagementGeneralInformation } from './api';
import { corporateDisplayFromEntity } from './corporateInformation/accessors';
import { publicationStatusLabel, reviewStageLabel } from './presentation';

export type PreparationNavTarget =
  | 'overview'
  | 'information'
  | 'trial-balance'
  | 'statements'
  | 'document'
  | 'supporting-schedules'
  | 'notes'
  | 'validation'
  | 'review'
  | 'publication';

export type PreparationItemStatus = 'complete' | 'attention' | 'pending' | 'blocking';

export type PreparationItem = {
  id: string;
  label: string;
  status: PreparationItemStatus;
  detail?: string;
  target: PreparationNavTarget;
  /** Imperative CTA for Overview primary button */
  actionLabel: string;
};

export type EngagementAttentionSummary = {
  outstanding: string[];
  complete: string[];
  needsAttention: string[];
  blockingPublication: string[];
  nextTarget: PreparationNavTarget;
  nextActionLabel: string;
  overallReadiness: string;
};

function entityInformationComplete(info?: EfsEngagementGeneralInformation | null): boolean {
  if (!info) return false;
  const display = corporateDisplayFromEntity(info);
  return Boolean(
    display.registeredName &&
      (display.registrationNumber || info.income_tax_number?.trim()) &&
      (info.business_address?.trim() || info.registered_office?.trim()),
  );
}

function frameworkConfirmed(
  dashboard: EfsDashboard,
  info?: EfsEngagementGeneralInformation | null,
): boolean {
  return Boolean(
    dashboard.framework?.id ||
      dashboard.framework?.framework_key ||
      info?.reporting_framework?.trim(),
  );
}

function financialYearConfirmed(dashboard: EfsDashboard): boolean {
  return Boolean(
    dashboard.reportingPeriod?.financial_year_id ||
      (dashboard.reportingPeriod?.start_date && dashboard.reportingPeriod?.end_date),
  );
}

/** Facts / CTB sealed — Trial Balance path for native or imported sources. */
function trialBalanceReady(dashboard: EfsDashboard): boolean {
  const status = dashboard.workspace.status;
  if (
    [
      'facts_sealed',
      'content_assembled',
      'validated',
      'in_review',
      'approved',
      'published',
      'archived',
    ].includes(status)
  ) {
    return true;
  }
  return Boolean(dashboard.snapshot?.currentVersion?.id);
}

function statementsReady(dashboard: EfsDashboard): boolean {
  const status = dashboard.workspace.status;
  return [
    'content_assembled',
    'validated',
    'in_review',
    'approved',
    'published',
    'archived',
  ].includes(status);
}

function workspacePastStatements(dashboard: EfsDashboard): boolean {
  return statementsReady(dashboard);
}

/** True when a validation run has meaningfully occurred (not placeholder zeros). */
function validationHasRun(dashboard: EfsDashboard): boolean {
  const status = dashboard.workspace.status;
  if (['validated', 'in_review', 'approved', 'published', 'archived'].includes(status)) {
    return true;
  }
  const vs = dashboard.validationSummary;
  if (!vs) return false;
  if ((vs.pass ?? 0) + (vs.fail ?? 0) + (vs.advisory ?? 0) > 0) return true;
  const note = (vs.note || '').toLowerCase();
  if (note.includes('later phase') || note.includes('placeholder') || note.includes('arrive')) {
    return false;
  }
  return false;
}

function validationBlocking(dashboard: EfsDashboard): boolean {
  return validationHasRun(dashboard) && (dashboard.validationSummary?.fail ?? 0) > 0;
}

function validationHasWarnings(dashboard: EfsDashboard): boolean {
  return (
    validationHasRun(dashboard) &&
    (dashboard.validationSummary?.advisory ?? 0) > 0 &&
    !validationBlocking(dashboard)
  );
}

function reviewAwaitingManager(dashboard: EfsDashboard): boolean {
  if (!validationHasRun(dashboard) || validationBlocking(dashboard)) return false;
  const m = (dashboard.reviewStatus?.manager || '').toLowerCase();
  return (
    !m ||
    m.includes('pending') ||
    m.includes('await') ||
    m.includes('not') ||
    m === 'draft' ||
    m === 'validation_complete' ||
    m.includes('ready')
  );
}

function reviewAwaitingPartner(dashboard: EfsDashboard): boolean {
  const p = (dashboard.reviewStatus?.partner || '').toLowerCase();
  const m = (dashboard.reviewStatus?.manager || '').toLowerCase();
  const managerDone =
    m.includes('approv') ||
    m.includes('complete') ||
    m === 'manager_approved' ||
    m === 'partner_review' ||
    m.includes('partner');
  return managerDone && (!p || p.includes('pending') || p.includes('await') || p.includes('not'));
}

function publicationReady(dashboard: EfsDashboard): boolean {
  const s = (dashboard.publicationStatus?.status || '').toLowerCase();
  return ['ready', 'publication_ready', 'executed', 'published', 'archived'].includes(s);
}

function publicationDone(dashboard: EfsDashboard): boolean {
  const s = (dashboard.publicationStatus?.status || '').toLowerCase();
  return ['executed', 'published', 'archived'].includes(s);
}

export function buildPreparationChecklist(
  dashboard: EfsDashboard,
  generalInfo?: EfsEngagementGeneralInformation | null,
  opts?: {
    outstandingWorkingPapers?: number;
    disclosureCount?: number;
  },
): PreparationItem[] {
  const entityOk = entityInformationComplete(generalInfo);
  const frameworkOk = frameworkConfirmed(dashboard, generalInfo);
  const yearOk = financialYearConfirmed(dashboard);
  const tbOk = trialBalanceReady(dashboard);
  const stmtsOk = statementsReady(dashboard);
  const pastStmts = workspacePastStatements(dashboard);
  const wpOutstanding = opts?.outstandingWorkingPapers ?? dashboard.outstandingTasks?.count ?? 0;
  const disclosureCount = opts?.disclosureCount;
  const notesPresent =
    typeof disclosureCount === 'number' ? disclosureCount > 0 : stmtsOk;
  const valRun = validationHasRun(dashboard);
  const valBlock = validationBlocking(dashboard);
  const valWarn = validationHasWarnings(dashboard);
  const awaitMgr = reviewAwaitingManager(dashboard);
  const awaitPtr = reviewAwaitingPartner(dashboard);
  const pubReady = publicationReady(dashboard);
  const pubDone = publicationDone(dashboard);
  const reviewStarted = ['in_review', 'approved', 'published', 'archived'].includes(
    dashboard.workspace.status,
  );

  const schedulesStatus: PreparationItemStatus = !pastStmts
    ? 'pending'
    : wpOutstanding > 0
      ? 'attention'
      : valRun || reviewStarted
        ? 'complete'
        : 'attention';

  const notesStatus: PreparationItemStatus = !stmtsOk
    ? 'pending'
    : !notesPresent
      ? 'attention'
      : valRun || reviewStarted
        ? 'complete'
        : 'attention';

  const validationStatus: PreparationItemStatus = !stmtsOk
    ? 'pending'
    : !valRun
      ? 'attention'
      : valBlock
        ? 'blocking'
        : valWarn
          ? 'attention'
          : 'complete';

  return [
    {
      id: 'entity',
      label: entityOk ? 'Company information complete' : 'Company information incomplete',
      status: entityOk ? 'complete' : 'attention',
      detail: entityOk ? undefined : 'Missing registration or address details',
      target: 'information',
      actionLabel: 'Complete company information',
    },
    {
      id: 'framework',
      label: frameworkOk ? 'Reporting framework confirmed' : 'Reporting framework not confirmed',
      status: frameworkOk ? 'complete' : 'attention',
      detail: frameworkOk ? undefined : 'Confirm the reporting framework for this engagement',
      target: 'information',
      actionLabel: 'Confirm reporting framework',
    },
    {
      id: 'financial_year',
      label: yearOk ? 'Financial year confirmed' : 'Financial year not confirmed',
      status: yearOk ? 'complete' : 'attention',
      detail: yearOk ? undefined : 'Confirm the financial year for this engagement',
      target: 'information',
      actionLabel: 'Confirm financial year',
    },
    {
      id: 'trial_balance',
      label: tbOk ? 'Trial Balance ready' : 'Trial Balance not yet captured',
      status: tbOk ? 'complete' : entityOk && frameworkOk && yearOk ? 'attention' : 'pending',
      detail: tbOk
        ? undefined
        : 'Capture from AdminLess accounting or import a Canonical Trial Balance',
      target: 'trial-balance',
      actionLabel: 'Capture or import Trial Balance',
    },
    {
      id: 'statements',
      label: stmtsOk
        ? 'Annual Financial Statements prepared'
        : 'Annual Financial Statements not prepared',
      status: stmtsOk ? 'complete' : tbOk ? 'attention' : 'pending',
      target: 'statements',
      actionLabel: 'Generate Annual Financial Statements',
    },
    {
      id: 'schedules',
      label:
        wpOutstanding > 0
          ? `${wpOutstanding} Supporting Schedule${wpOutstanding === 1 ? '' : 's'} outstanding`
          : schedulesStatus === 'complete'
            ? 'Supporting Schedules complete'
            : 'Review Supporting Schedules',
      status: schedulesStatus,
      detail:
        schedulesStatus === 'pending'
          ? 'Available after Financial Statements are generated'
          : undefined,
      target: 'supporting-schedules',
      actionLabel: 'Review Supporting Schedules',
    },
    {
      id: 'notes',
      label:
        notesStatus === 'complete'
          ? 'Notes & Disclosures reviewed'
          : notesStatus === 'pending'
            ? 'Notes & Disclosures (after statements)'
            : 'Review Notes & Disclosures',
      status: notesStatus,
      target: 'notes',
      actionLabel: 'Review Notes & Disclosures',
    },
    {
      id: 'validation',
      label: !valRun
        ? 'Validation not yet run'
        : valBlock || valWarn
          ? 'Resolve validation findings'
          : 'Validation clear',
      status: validationStatus,
      detail: dashboard.validationSummary?.note,
      target: 'validation',
      actionLabel: valRun ? 'Resolve validation findings' : 'Run validation checks',
    },
    {
      id: 'manager',
      label: awaitMgr ? 'Manager Review required' : 'Manager Review complete',
      status: awaitMgr ? 'attention' : !valRun || valBlock ? 'pending' : 'complete',
      detail: reviewStageLabel(dashboard.reviewStatus?.manager || 'draft'),
      target: 'review',
      actionLabel: 'Start Manager Review',
    },
    {
      id: 'partner',
      label: awaitPtr ? 'Partner Review required' : 'Partner Review complete',
      status: awaitPtr ? 'attention' : awaitMgr || !valRun ? 'pending' : 'complete',
      detail: reviewStageLabel(dashboard.reviewStatus?.partner || 'draft'),
      target: 'review',
      actionLabel: 'Start Partner Review',
    },
    {
      id: 'publication',
      label: pubDone ? 'Published' : pubReady ? 'Ready for Publication' : 'Publication pending',
      status: pubDone ? 'complete' : pubReady ? 'attention' : 'pending',
      detail: publicationStatusLabel(dashboard.publicationStatus?.status || 'not_ready'),
      target: 'publication',
      actionLabel: 'Publish Annual Financial Statements',
    },
  ];
}

function overallReadinessLabel(items: PreparationItem[]): string {
  if (items.some((i) => i.status === 'blocking')) return 'Not ready — resolve critical findings';
  if (items.every((i) => i.status === 'complete')) return 'Ready for Publication';
  const pub = items.find((i) => i.id === 'publication');
  if (pub?.status === 'attention') return 'Ready for Publication';
  if (pub?.status === 'complete') return 'Published';
  const partner = items.find((i) => i.id === 'partner');
  if (partner?.status === 'attention') return 'Ready for Partner Review';
  const manager = items.find((i) => i.id === 'manager');
  if (manager?.status === 'attention') return 'Ready for Manager Review';
  const validation = items.find((i) => i.id === 'validation');
  if (validation?.status === 'attention' || validation?.status === 'blocking') {
    return 'Ready for Validation';
  }
  const statements = items.find((i) => i.id === 'statements');
  if (statements?.status === 'attention') return 'Ready to generate statements';
  const tb = items.find((i) => i.id === 'trial_balance');
  if (tb?.status === 'attention') return 'Ready for Trial Balance';
  return 'In progress';
}

export function buildAttentionSummary(items: PreparationItem[]): EngagementAttentionSummary {
  const complete = items.filter((i) => i.status === 'complete').map((i) => i.label);
  const needsAttention = items.filter((i) => i.status === 'attention').map((i) => i.label);
  const blockingPublication = items.filter((i) => i.status === 'blocking').map((i) => i.label);
  const outstanding = items.filter((i) => i.status !== 'complete').map((i) => i.label);
  const next =
    items.find((i) => i.status === 'blocking') ||
    items.find((i) => i.status === 'attention') ||
    items.find((i) => i.status === 'pending') ||
    items[items.length - 1];

  return {
    outstanding,
    complete,
    needsAttention,
    blockingPublication,
    nextTarget: next?.target || 'overview',
    nextActionLabel: next
      ? next.status === 'complete'
        ? 'Open Publication'
        : next.actionLabel
      : 'Continue preparing Annual Financial Statements',
    overallReadiness: overallReadinessLabel(items),
  };
}

export function preparationStatusGlyph(status: PreparationItemStatus): string {
  if (status === 'complete') return '✓';
  if (status === 'blocking' || status === 'attention') return '⚠';
  return '○';
}

/** Soft progress steps for Overview workflow chrome (ids match checklist items). */
export const WORKFLOW_STEPS: Array<{ id: string; label: string; target: PreparationNavTarget }> = [
  { id: 'entity', label: 'Information', target: 'information' },
  { id: 'trial_balance', label: 'Trial Balance', target: 'trial-balance' },
  { id: 'statements', label: 'Statements', target: 'statements' },
  { id: 'schedules', label: 'Schedules', target: 'supporting-schedules' },
  { id: 'notes', label: 'Notes', target: 'notes' },
  { id: 'validation', label: 'Validation', target: 'validation' },
  { id: 'manager', label: 'Manager', target: 'review' },
  { id: 'partner', label: 'Partner', target: 'review' },
  { id: 'publication', label: 'Publish', target: 'publication' },
];
