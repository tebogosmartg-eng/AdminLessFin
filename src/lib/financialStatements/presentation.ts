/**
 * V6.10.1 Presentation layer — accountant-facing labels.
 * Maps internal enterprise statuses/codes to accounting language.
 * Never expose IDs, hashes, fingerprints, node codes, or flag booleans.
 */

export const STATEMENT_TITLES: Record<string, string> = {
  financial_position: 'Statement of Financial Position',
  financial_performance: 'Statement of Profit or Loss / Financial Performance',
  cash_flows: 'Statement of Cash Flows',
  changes_in_equity: 'Statement of Changes in Equity / Net Assets',
};

export function statementTitle(statementType: string, fallback?: string): string {
  return STATEMENT_TITLES[statementType] || fallback || 'Financial Statement';
}

/** Map structure node codes / paths to natural working-paper sections */
export const WORKING_PAPER_SECTIONS: Array<{
  key: string;
  label: string;
  match: RegExp;
}> = [
  { key: 'cash', label: 'Cash', match: /cash|bank|cf\./i },
  { key: 'receivables', label: 'Trade Receivables', match: /receiv|debtor|trade.?receiv/i },
  { key: 'inventory', label: 'Inventory', match: /inventor|stock/i },
  {
    key: 'ppe',
    label: 'Property, Plant & Equipment',
    match: /ppe|property|plant|equipment|fixed.?asset|sfp\.assets/i,
  },
  { key: 'revenue', label: 'Revenue', match: /revenue|income|perf\.rev/i },
  { key: 'expenses', label: 'Expenses', match: /expense|perf\.exp/i },
  { key: 'taxation', label: 'Taxation', match: /tax|vat/i },
  { key: 'payables', label: 'Trade Payables', match: /payable|creditor|trade.?pay/i },
  { key: 'borrowings', label: 'Borrowings', match: /borrow|loan|debt|financ/i },
  { key: 'equity', label: 'Equity / Net Assets', match: /equity|eq\.|net.?asset/i },
  { key: 'employee', label: 'Employee Benefits', match: /employee|payroll|benefit|wages/i },
  { key: 'other', label: 'Other', match: /.*/ },
];

export function workingPaperSectionForNode(input: {
  node_code?: string;
  path?: string;
  name?: string;
  title?: string;
}): string {
  const haystack = [input.node_code, input.path, input.name, input.title]
    .filter(Boolean)
    .join(' ');
  for (const section of WORKING_PAPER_SECTIONS) {
    if (section.match.test(haystack)) return section.label;
  }
  return 'Other';
}

export function severityLabel(severity: string): 'Critical Issues' | 'Warnings' | 'Information' {
  const s = (severity || '').toLowerCase();
  if (s === 'blocking' || s === 'critical') return 'Critical Issues';
  if (s === 'significant' || s === 'warning') return 'Warnings';
  return 'Information';
}

export function severityBadgeLabel(severity: string): 'Critical' | 'Warning' | 'Information' {
  const s = (severity || '').toLowerCase();
  if (s === 'blocking' || s === 'critical') return 'Critical';
  if (s === 'significant' || s === 'warning') return 'Warning';
  return 'Information';
}

export function reviewStageLabel(stage: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    validation_complete: 'Ready for Manager Review',
    manager_review: 'Manager Review in Progress',
    manager_approved: 'Manager Approved',
    partner_review: 'Partner Review in Progress',
    partner_approved: 'Partner Approved',
    publication_ready: 'Ready for Publication',
    changes_requested: 'Changes Requested',
    rejected: 'Rejected',
  };
  return map[stage] || stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function workspaceStatusLabel(status: string): string {
  const map: Record<string, string> = {
    opened: 'Opened',
    facts_sealed: 'Statements prepared successfully',
    content_assembled: 'Statements prepared successfully',
    validated: 'Validated',
    in_review: 'In Review',
    approved: 'Approved',
    published: 'Published',
    archived: 'Archived',
    sealed: 'Statements prepared successfully',
  };
  return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function publicationStatusLabel(status: string): string {
  const map: Record<string, string> = {
    not_started: 'Not yet ready for publication',
    not_ready: 'Not yet ready for publication',
    pending: 'Not yet ready for publication',
    ready: 'Ready for Publication',
    publication_ready: 'Ready for Publication',
    executed: 'Published',
    published: 'Published',
    archived: 'Archived',
  };
  if (!status) return 'Not yet ready for publication';
  return (
    map[status] ||
    map[status.toLowerCase()] ||
    'Not yet ready for publication'
  );
}

export function validationScore(input: {
  blocking_count?: number;
  significant_count?: number;
  advisory_count?: number;
  total_issues?: number;
  ready_for_review?: boolean;
}): { score: number; label: string } {
  const blocking = input.blocking_count ?? 0;
  const significant = input.significant_count ?? 0;
  const advisory = input.advisory_count ?? 0;
  const total = input.total_issues ?? blocking + significant + advisory;
  if (total === 0 && input.ready_for_review) return { score: 100, label: 'Ready for Manager Review' };
  if (total === 0) return { score: 100, label: 'No issues' };
  const penalty = blocking * 25 + significant * 10 + advisory * 2;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  if (blocking > 0) return { score, label: 'Needs attention' };
  if (significant > 0) return { score, label: 'Warnings outstanding' };
  return { score, label: 'Advisory only' };
}

export function humanizeActivityMessage(message: string): string {
  return (message || '')
    .replace(/Snapshot Version/gi, 'Financial Statements')
    .replace(/Fact Snapshot/gi, 'trial balance')
    .replace(/Reporting Snapshot/gi, 'Financial Statements')
    .replace(/\bSnapshot\b/gi, 'Financial Statements')
    .replace(/\blineage\b/gi, '')
    .replace(/\bprimary\b/gi, '')
    .replace(/\bSealed\b/gi, 'prepared')
    .replace(/\bSeal(ed|ing)?\b/gi, 'prepared')
    .replace(/\bCertif(y|ied|ication)\b/gi, 'confirmed')
    .replace(/\bFreeze\b|\bFrozen\b/gi, 'locked')
    .replace(/Statement Structure/gi, 'statement')
    .replace(/Attachment Point/gi, 'supporting schedule link')
    .replace(/Publication Pack/gi, 'publication')
    .replace(/Framework Pack/gi, 'reporting framework')
    .replace(/Framework Binding/gi, 'reporting framework')
    .replace(/Working Paper/gi, 'Supporting Schedule')
    .replace(/\bpipeline\b/gi, 'preparation')
    .replace(/\bfingerprint(s)?\b/gi, '')
    .replace(/pack_fingerprint|content_hash|publication_seal_hash/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Humanise raw evidence / schedule status codes for accountant surfaces. */
export function evidenceStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'In Progress',
    in_progress: 'In Progress',
    prepared: 'Prepared',
    ready_for_review: 'Ready for Review',
    under_review: 'Under Review',
    reviewed: 'Reviewed',
    final: 'Final',
    closed: 'Closed',
    open: 'Open',
  };
  return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Month name for financial year end display */
export function formatFinancialYearEnd(month?: number | null, day?: number | null): string {
  if (!month) return '';
  const names = [
    '',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const m = names[month] || String(month);
  return day ? `${day} ${m}` : m;
}

/**
 * @deprecated G3.6D — Financial Statements must NOT invent Financial Years.
 * Use `reportingPeriodFromCalendarYear` with FinancialCalendarService years instead.
 * Kept only for legacy call-site discovery; do not use in production FS workflows.
 */
export function deriveReportingPeriodDates(opts: {
  financialYearEndMonth?: number | null;
  financialYearEndDay?: number | null;
  currentFinancialYearStart?: string | null;
  referenceDate?: Date;
}): { start_date: string; end_date: string; period_key: string; label: string; financial_year_end: string } {
  const ref = opts.referenceDate || new Date();
  const endMonth = opts.financialYearEndMonth || 2; // default Feb (common SA)
  const endDay = opts.financialYearEndDay || 28;

  const endYear = ref.getFullYear();
  // Prefer explicit start if present
  let start: Date;
  let end: Date;
  if (opts.currentFinancialYearStart) {
    start = new Date(opts.currentFinancialYearStart);
    end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
  } else {
    end = new Date(endYear, endMonth - 1, endDay);
    if (ref > end) {
      end = new Date(endYear + 1, endMonth - 1, endDay);
    }
    start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
  }

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const start_date = fmt(start);
  const end_date = fmt(end);
  const yearLabel = end.getFullYear();
  return {
    start_date,
    end_date,
    period_key: `FY${yearLabel}`,
    label: `Financial Year ${yearLabel}`,
    financial_year_end: formatFinancialYearEnd(end.getMonth() + 1, end.getDate()),
  };
}
