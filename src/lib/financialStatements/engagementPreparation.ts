/**
 * V6.10.0 — Engagement preparation checklist (experience layer only).
 * Derives accountant-facing progress from existing dashboard payloads.
 */

import type { EfsDashboard, EfsEngagementGeneralInformation } from './api';
import { corporateDisplayFromEntity } from './corporateInformation/accessors';
import { publicationStatusLabel, reviewStageLabel } from './presentation';

export type PreparationNavTarget =
  | 'overview'
  | 'information'
  | 'statements'
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
    dashboard.reportingPeriod?.label ||
      (dashboard.reportingPeriod?.start_date && dashboard.reportingPeriod?.end_date),
  );
}

function statementsReady(dashboard: EfsDashboard): boolean {
  const status = dashboard.workspace.status;
  return (
    ['content_assembled', 'validated', 'in_review', 'approved', 'published', 'archived'].includes(
      status,
    ) || dashboard.progress.pct >= 40
  );
}

function validationBlocking(dashboard: EfsDashboard): boolean {
  return (dashboard.validationSummary?.fail ?? 0) > 0;
}

function validationHasWarnings(dashboard: EfsDashboard): boolean {
  return (dashboard.validationSummary?.advisory ?? 0) > 0 && !validationBlocking(dashboard);
}

function reviewAwaitingManager(dashboard: EfsDashboard): boolean {
  const m = (dashboard.reviewStatus?.manager || '').toLowerCase();
  return (
    !m ||
    m.includes('pending') ||
    m.includes('await') ||
    m.includes('not') ||
    m === 'draft' ||
    m === 'validation_complete'
  );
}

function reviewAwaitingPartner(dashboard: EfsDashboard): boolean {
  const p = (dashboard.reviewStatus?.partner || '').toLowerCase();
  const m = (dashboard.reviewStatus?.manager || '').toLowerCase();
  const managerDone =
    m.includes('approv') || m.includes('complete') || m === 'manager_approved' || m === 'partner_review';
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
  opts?: { outstandingWorkingPapers?: number },
): PreparationItem[] {
  const entityOk = entityInformationComplete(generalInfo);
  const frameworkOk = frameworkConfirmed(dashboard, generalInfo);
  const yearOk = financialYearConfirmed(dashboard);
  const stmtsOk = statementsReady(dashboard);
  const wpOutstanding = opts?.outstandingWorkingPapers ?? dashboard.outstandingTasks?.count ?? 0;
  const valBlock = validationBlocking(dashboard);
  const valWarn = validationHasWarnings(dashboard);
  const awaitMgr = reviewAwaitingManager(dashboard);
  const awaitPtr = reviewAwaitingPartner(dashboard);
  const pubReady = publicationReady(dashboard);
  const pubDone = publicationDone(dashboard);

  return [
    {
      id: 'entity',
      label: 'Company information complete',
      status: entityOk ? 'complete' : 'attention',
      detail: entityOk ? undefined : 'Missing registration or address details',
      target: 'information',
    },
    {
      id: 'framework',
      label: 'Reporting framework confirmed',
      status: frameworkOk ? 'complete' : 'attention',
      detail: frameworkOk ? undefined : 'Confirm the reporting framework for this engagement',
      target: 'information',
    },
    {
      id: 'financial_year',
      label: 'Financial year confirmed',
      status: yearOk ? 'complete' : 'attention',
      detail: yearOk ? undefined : 'Confirm the financial year for this engagement',
      target: 'information',
    },
    {
      id: 'statements',
      label: stmtsOk ? 'Annual Financial Statements prepared' : 'Generate Annual Financial Statements',
      status: stmtsOk ? 'complete' : 'attention',
      target: 'statements',
    },
    {
      id: 'schedules',
      label:
        wpOutstanding > 0
          ? `${wpOutstanding} Supporting Schedule${wpOutstanding === 1 ? '' : 's'} outstanding`
          : 'Supporting Schedules complete',
      status: wpOutstanding > 0 ? 'attention' : 'complete',
      target: 'supporting-schedules',
    },
    {
      id: 'validation',
      label: valBlock || valWarn ? 'Resolve validation findings' : 'Validation clear',
      status: valBlock ? 'blocking' : valWarn ? 'attention' : 'complete',
      detail: dashboard.validationSummary?.note,
      target: 'validation',
    },
    {
      id: 'manager',
      label: awaitMgr ? 'Ready for Manager Review' : 'Manager Review complete',
      status: awaitMgr ? (valBlock ? 'pending' : 'attention') : 'complete',
      detail: reviewStageLabel(dashboard.reviewStatus?.manager || 'draft'),
      target: 'review',
    },
    {
      id: 'partner',
      label: awaitPtr ? 'Ready for Partner Review' : 'Partner Review complete',
      status: awaitPtr ? 'attention' : awaitMgr ? 'pending' : 'complete',
      detail: reviewStageLabel(dashboard.reviewStatus?.partner || 'draft'),
      target: 'review',
    },
    {
      id: 'publication',
      label: pubDone ? 'Published' : pubReady ? 'Ready for Publication' : 'Ready for Publication',
      status: pubDone ? 'complete' : pubReady ? 'attention' : 'pending',
      detail: publicationStatusLabel(dashboard.publicationStatus?.status || 'not_ready'),
      target: 'publication',
    },
  ];
}

function overallReadinessLabel(items: PreparationItem[]): string {
  if (items.some((i) => i.status === 'blocking')) return 'Not ready — resolve critical findings';
  if (items.every((i) => i.status === 'complete')) return 'Ready for Publication';
  const pub = items.find((i) => i.id === 'publication');
  if (pub?.status === 'attention' || pub?.status === 'complete') return 'Ready for Publication';
  const partner = items.find((i) => i.id === 'partner');
  if (partner?.status === 'attention') return 'Ready for Partner Review';
  const manager = items.find((i) => i.id === 'manager');
  if (manager?.status === 'attention') return 'Ready for Manager Review';
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
        : next.label
      : 'Continue preparing Annual Financial Statements',
    overallReadiness: overallReadinessLabel(items),
  };
}

export function preparationStatusGlyph(status: PreparationItemStatus): string {
  if (status === 'complete') return '✓';
  if (status === 'blocking' || status === 'attention') return '⚠';
  return '○';
}
