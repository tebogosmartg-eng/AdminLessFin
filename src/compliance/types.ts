/** Response shapes of the `compliance` edge function. */

export type Applicability = 'applicable' | 'not_applicable' | 'needs_information';
export type CycleStatus =
  | 'not_started'
  | 'in_progress'
  | 'evidence_submitted'
  | 'action_required'
  | 'completed'
  | 'cancelled';
export type TimeSignal = 'none' | 'due_soon' | 'overdue' | 'expired';

export type CycleView = {
  id: string;
  kind: 'filing' | 'term' | 'once';
  period_key: string;
  opens_on: string | null;
  due_date: string | null;
  valid_from: string | null;
  expiry_date: string | null;
  status: CycleStatus;
  time_signal: TimeSignal;
  rule_version_id: string;
  completed_at: string | null;
  completed_by: string | null;
  completion_note: string | null;
};

export type ObligationSummary = {
  id: string;
  rule_code: string;
  title: string;
  summary: string;
  category_code: string | null;
  authority_code: string | null;
  priority: 'high' | 'medium' | 'low';
  reviewed: boolean;
  applicability: Applicability;
  missing_facts: string[];
  override_not_applicable: boolean;
  override_conflict: boolean;
  responsible_user_id: string | null;
  retired: boolean;
  current_cycle: CycleView | null;
  open_cycles: number;
};

export type Member = { user_id: string; name: string | null; role: string };

export type ComplianceAnswers = {
  entity_type?: string | null;
  incorporation_date?: string | null;
  industry_code?: string | null;
  activity_transport?: boolean | null;
  activity_food?: boolean | null;
  activity_security?: boolean | null;
  activity_construction?: boolean | null;
  activity_childcare?: boolean | null;
  processes_personal_information?: boolean | null;
  has_premises?: boolean | null;
  vat_status?: 'registered' | 'not_registered' | 'not_sure' | null;
  vat_filing_frequency?: 'monthly' | 'bimonthly_odd' | 'bimonthly_even' | 'not_sure' | null;
  has_employees?: boolean | null;
  employee_count?: number | null;
};

export type OnFile = {
  registration_number: string | null;
  vat_number: string | null;
  master_entity_type: string | null;
  nature_of_business: string | null;
  address_on_file: string | null;
  paye_number: string | null;
  active_employee_count: number;
  has_payroll_runs: boolean;
  financial_year_end_date: string | null;
};

export type ComplianceOverview = {
  today: string;
  questionnaire_version: number;
  profile: {
    status: 'draft' | 'completed';
    revision: number;
    questionnaire_version: number;
    answers: ComplianceAnswers;
    completed_at: string | null;
    last_evaluated_at: string | null;
    outdated_questionnaire: boolean;
  } | null;
  on_file: OnFile;
  conflicts: Array<{ field: string; answer: unknown; on_file: unknown; settings_module: string }>;
  industries: Array<{ code: string; name: string }>;
  categories: Array<{ code: string; name: string; sort_order: number }>;
  authorities: Array<{ code: string; name: string; website: string }>;
  content_unreviewed: boolean;
  rules_available: number;
  obligations: ObligationSummary[];
  counts: {
    applicable: number;
    needs_information: number;
    not_applicable: number;
    overdue: number;
    due_soon: number;
    expired: number;
    conflicts: number;
  };
  members: Member[];
};

export type Guidance = {
  what_is_this: string;
  why_it_matters: string;
  how_to_comply: string[];
  documents_needed: string[];
  if_you_dont: string;
  where_to_complete: { label: string; url: string };
  disclaimer: string;
};

export type EvidenceView = {
  id: string;
  cycle_id: string;
  kind: 'upload' | 'reference';
  title: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  source_table: string | null;
  source_id: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by_name: string | null;
  delete_reason: string | null;
};

export type CycleDetail = CycleView & {
  rule_version: number | null;
  completed_by_name: string | null;
  evidence: EvidenceView[];
};

export type ComplianceEvent = {
  id: string;
  cycle_id: string | null;
  actor_user_id: string | null;
  actor_name: string;
  event_type: string;
  before: unknown;
  after: unknown;
  note: string | null;
  created_at: string;
};

export type ObligationDetail = {
  today: string;
  obligation: {
    id: string;
    rule_code: string;
    applicability: Applicability;
    evaluated_applicability: Applicability;
    missing_facts: string[];
    override_not_applicable: boolean;
    override_reason: string | null;
    override_by: string | null;
    override_at: string | null;
    override_conflict: boolean;
    responsible_user_id: string | null;
    reminder_offsets: number[];
    retired: boolean;
    why: { facts?: Record<string, unknown>; rule_version?: number; evaluated_on?: string };
  };
  rule: {
    title: string;
    summary: string;
    version: number;
    reviewed: boolean;
    priority: 'high' | 'medium' | 'low';
    category: { code: string; name: string } | null;
    authority: { code: string; name: string; website: string } | null;
    schedule_type: string;
    due_rule: string;
    renewal_lead_days: number | null;
    evidence_required: boolean;
    evidence_sources: string[];
    provenance: {
      source_title: string | null;
      source_url: string | null;
      reviewed_by: string | null;
      last_reviewed: string | null;
      review_due: string | null;
    };
  } | null;
  guidance: Guidance | null;
  cycles: CycleDetail[];
  events: ComplianceEvent[];
  members: Member[];
};

export type ComplianceCalendarEvent = {
  id: string;
  cycle_id: string;
  title: string;
  date: string;
  type: 'compliance_due' | 'compliance_expiry';
  status: CycleStatus;
  signal: TimeSignal;
};
