/**
 * Compliance & Governance — shared types (ADR-0004).
 *
 * Pure data shapes used by the evaluator, the date engine, the materializer,
 * the `compliance` edge function and the daily scheduler. Nothing in this
 * folder performs I/O, and the frontend never imports it: rule conditions are
 * evaluated on the server only.
 */

/** A closed set of facts. `null` / absent means "unknown", never "no". */
export type ComplianceFacts = {
  entity_type?: EntityType | null;
  industry_code?: string | null;
  incorporation_date?: string | null;
  incorporation_date_known?: boolean | null;
  has_registration_number?: boolean | null;
  vat_status?: 'registered' | 'not_registered' | null;
  vat_filing_frequency?: VatFilingFrequency | null;
  has_employees?: boolean | null;
  employee_count?: number | null;
  has_premises?: boolean | null;
  activity_transport?: boolean | null;
  activity_food?: boolean | null;
  activity_security?: boolean | null;
  activity_construction?: boolean | null;
  activity_childcare?: boolean | null;
  processes_personal_information?: boolean | null;
  financial_year_end?: MonthDay | null;
};

export type FactName = keyof ComplianceFacts;

export const CONDITION_FACTS: readonly FactName[] = [
  'entity_type',
  'industry_code',
  'incorporation_date_known',
  'has_registration_number',
  'vat_status',
  'has_employees',
  'employee_count',
  'has_premises',
  'activity_transport',
  'activity_food',
  'activity_security',
  'activity_construction',
  'activity_childcare',
  'processes_personal_information',
] as const;

export const ENTITY_TYPES = [
  'private_company',
  'public_company',
  'close_corporation',
  'sole_proprietor',
  'partnership',
  'trust',
  'non_profit_company',
  'other',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const VAT_FILING_FREQUENCIES = ['monthly', 'bimonthly_odd', 'bimonthly_even'] as const;
export type VatFilingFrequency = (typeof VAT_FILING_FREQUENCIES)[number];

export type MonthDay = { month: number; day: number };

/** A JSON predicate. No arbitrary code; unknown facts never match silently. */
export type Condition =
  | { all_of: Condition[] }
  | { any_of: Condition[] }
  | { not: Condition }
  | { fact_eq: [FactName, string | number | boolean] }
  | { fact_in: [FactName, Array<string | number>] }
  | { fact_gt: [FactName, number] }
  | { fact_present: FactName }
  | { always: true };

export type BusinessDayAdjust = 'none' | 'previous_business_day' | 'next_business_day';

export type Schedule =
  | {
      type: 'anniversary_business_days';
      anchor: 'incorporation_date';
      business_days: number;
    }
  | {
      type: 'annual_fixed_month_day';
      month: number;
      day: number;
      adjust: BusinessDayAdjust;
      opens_days_before_due: number;
    }
  | {
      type: 'months_after_year_end';
      /** May be negative: provisional tax is due before the year ends. */
      months: number;
      adjust: BusinessDayAdjust;
      opens_days_before_due: number;
    }
  | {
      type: 'periodic';
      /** A fixed frequency, or read from the VAT filing-frequency fact. */
      frequency: 'monthly' | 'from_vat_filing_frequency';
      due_day: number;
      adjust: BusinessDayAdjust;
    }
  | { type: 'certificate_expiry'; renewal_lead_days: number; default_term_months: number }
  | { type: 'once_off' };

export type ScheduleType = Schedule['type'];

export type CycleKind = 'filing' | 'term' | 'once';

/** One period of a recurring obligation, as the date engine sees it. */
export type Occurrence = {
  period_key: string;
  opens_on: string;
  due_date: string | null;
};

export type Applicability = 'applicable' | 'not_applicable' | 'needs_information';

export const CYCLE_STATUSES = [
  'not_started',
  'in_progress',
  'evidence_submitted',
  'action_required',
  'completed',
  'cancelled',
] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export const OPEN_CYCLE_STATUSES: readonly CycleStatus[] = [
  'not_started',
  'in_progress',
  'evidence_submitted',
  'action_required',
];

export type TimeSignal = 'none' | 'due_soon' | 'overdue' | 'expired';

export const REMINDER_OFFSET_CHOICES = [60, 30, 14, 7, 3, 1] as const;

export const EVIDENCE_SOURCE_TABLES = [
  'statutory_returns',
  'asset_documents',
  'bills',
  'purchase_orders',
  'loans',
] as const;
export type EvidenceSourceTable = (typeof EVIDENCE_SOURCE_TABLES)[number];

/** A published rule version as stored in compliance_rule_versions. */
export type RuleVersion = {
  id: string;
  rule_code: string;
  version: number;
  status: 'published' | 'retired';
  country_code: string;
  category_code: string;
  industry_code: string | null;
  authority_code: string;
  title: string;
  summary: string;
  condition: Condition;
  schedule: Schedule;
  evidence: { required: boolean; source_tables: EvidenceSourceTable[] };
  priority: 'high' | 'medium' | 'low';
  reminder_offsets: number[];
  effective_from: string;
  effective_to: string | null;
  reviewed: boolean;
};

export type ObligationRow = {
  id: string;
  company_id: string;
  rule_code: string;
  rule_version_id: string;
  applicability: Applicability;
  evaluated_applicability: Applicability;
  missing_facts: string[];
  override_not_applicable: boolean;
  override_reason: string | null;
  override_by: string | null;
  override_at: string | null;
  override_facts_hash: string | null;
  override_conflict: boolean;
  responsible_user_id: string | null;
  reminder_offsets: number[];
  tracking_from: string | null;
  retired: boolean;
  why: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type CycleRow = {
  id: string;
  company_id: string;
  obligation_id: string;
  kind: CycleKind;
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
  why: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type EventRow = {
  id: string;
  company_id: string;
  obligation_id: string | null;
  cycle_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  before: unknown;
  after: unknown;
  rule_version_id: string | null;
  note: string | null;
};
