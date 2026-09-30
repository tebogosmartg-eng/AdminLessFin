import type { Applicability, CycleStatus, TimeSignal } from './types';

/**
 * Wording. "Completed" is used, never "compliant": the product records what
 * the business did; it does not certify legal compliance (ADR-0004, 9).
 */
export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  evidence_submitted: 'Proof added',
  action_required: 'Action required',
  completed: 'Completed',
  cancelled: 'Withdrawn',
};

export const TERM_STATUS_LABEL: Partial<Record<CycleStatus, string>> = {
  not_started: 'Current',
  in_progress: 'Renewal in progress',
  evidence_submitted: 'Renewal proof added',
  action_required: 'Dates needed',
  completed: 'Renewed',
};

export function statusLabel(status: CycleStatus, kind: 'filing' | 'term' | 'once'): string {
  return (kind === 'term' ? TERM_STATUS_LABEL[status] : undefined) ?? CYCLE_STATUS_LABEL[status];
}

export const SIGNAL_LABEL: Record<TimeSignal, string> = {
  none: '',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  expired: 'Expired',
};

export const APPLICABILITY_LABEL: Record<Applicability, string> = {
  applicable: 'Applies',
  not_applicable: 'Not applicable',
  needs_information: 'Needs information',
};

export const FACT_LABEL: Record<string, string> = {
  entity_type: 'business type',
  industry_code: 'industry',
  incorporation_date: 'registration date',
  incorporation_date_known: 'registration date',
  has_registration_number: 'registration number',
  vat_status: 'VAT registration',
  vat_filing_frequency: 'VAT filing frequency',
  has_employees: 'whether you employ staff',
  employee_count: 'number of employees',
  has_premises: 'business premises',
  processes_personal_information: 'personal information handling',
  financial_year_end: 'financial year end',
  activity_transport: 'transport activities',
  activity_food: 'food handling',
  activity_security: 'security services',
  activity_construction: 'construction work',
  activity_childcare: 'childcare',
};

export const EVENT_LABEL: Record<string, string> = {
  obligation_created: 'Started tracking',
  applicability_changed: 'Applicability changed',
  cycle_opened: 'Period opened',
  cycle_cancelled: 'Period withdrawn',
  cycle_reopened: 'Period reopened',
  cycle_completed: 'Marked completed',
  due_date_changed: 'Due date changed',
  status_changed: 'Status changed',
  override_set: 'Marked not applicable',
  override_confirmed: 'Not applicable reconfirmed',
  override_cleared: 'Not-applicable removed',
  override_conflict: 'New information conflicts with "not applicable"',
  responsible_changed: 'Responsible person changed',
  responsible_fallback: 'Reminders moved to the owners',
  reminders_changed: 'Reminder times changed',
  term_dates_set: 'Certificate dates set',
  term_renewed: 'Certificate renewed',
  evidence_added: 'Proof added',
  evidence_removed: 'Proof removed',
  rule_version_changed: 'Guidance updated',
  rule_retired: 'Rule retired',
  rule_reinstated: 'Rule reinstated',
};

export const SOURCE_TABLE_LABEL: Record<string, string> = {
  statutory_returns: 'Statutory return',
  asset_documents: 'Asset document',
  bills: 'Bill',
  purchase_orders: 'Purchase order',
  loans: 'Loan',
};

export const REMINDER_CHOICES = [60, 30, 14, 7, 3, 1] as const;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function periodLabel(kind: 'filing' | 'term' | 'once', periodKey: string): string {
  if (kind === 'once') return 'Once-off';
  if (kind === 'term') return `Term ${periodKey.replace('term-', '')}`;
  if (periodKey.startsWith('FY')) return `Year ending ${formatDate(periodKey.slice(2))}`;
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [y, m] = periodKey.split('-').map(Number);
    return `Period ending ${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
  }
  return periodKey;
}
