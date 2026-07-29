import { addDays, format, isBefore, isWithinInterval, parseISO, subDays } from 'date-fns';
import { isRunFinalized } from './payrollWorkflow';
import { formatEmployeeAiContext } from './employeeIdentity';
import type { Employee } from '../pages/Employees';
import { findCashEquivalentAccounts } from './accounting/accountRoles';

export type ReadinessIssue = {
  id: string;
  category: 'employee' | 'claims' | 'payroll';
  label: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
  employeeId?: string;
  actionPath: string;
};

export type ReadinessResult = {
  score: number;
  status: 'ready' | 'attention' | 'blocked';
  issues: ReadinessIssue[];
  passedChecks: number;
  totalChecks: number;
};

export type TimelineEvent = {
  id: string;
  date: string;
  label: string;
  description: string;
  type: 'claims' | 'review' | 'processing' | 'payslips' | 'posting' | 'payroll';
  actionPath: string;
  isToday?: boolean;
  isPast?: boolean;
};

export type CashImpact = {
  currentCash: number;
  estimatedPayroll: number;
  upcomingBills: number;
  upcomingTax: number;
  remainingCash: number;
  health: 'healthy' | 'caution' | 'critical';
  healthLabel: string;
};

export type OperationalAlert = {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  actionPath: string;
  actionLabel: string;
  priority: number;
};

export type PayrollInsight = {
  id: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  actionPath?: string;
  actionLabel?: string;
};

export type PayrollCalendarEvent = {
  id: string;
  date: string;
  title: string;
  type: 'payroll' | 'claim_deadline' | 'payroll_review' | 'payslip_release' | 'tax_submission';
  status: string;
  actionPath: string;
};

type WorkspaceMetrics = {
  employeeCount: number;
  estimatedMonthlyPayroll: number;
  draftPayrollRuns: number;
  pendingClaims: number;
  approvedClaimsAwaitingReimbursement: number;
  upcomingPayDate: string | null;
  draftRunEstimatedCost: number;
  lastProcessedNetPay: number;
  payrollVariance: number;
};

type WorkspaceData = {
  metrics?: WorkspaceMetrics;
  exceptions?: { type: string; employeeId: string; name: string }[];
  upcomingPayrollRun?: { id: string; pay_date: string; pay_period_start: string; pay_period_end: string; status: string } | null;
  recentPayrollRuns?: { id: string; pay_date: string; status: string }[];
};

type Claim = {
  id: string;
  claim_number: string;
  submission_date: string;
  total_amount: number;
  status: string;
  employee_id?: string;
};

type Account = {
  id: string;
  name: string;
  type: string;
  balance?: number;
  subcategory?: string | null;
  account_role?: string | null;
};

const today = () => new Date();

function activeEmployees(employees: Employee[]): Employee[] {
  const now = format(today(), 'yyyy-MM-dd');
  return employees.filter((e) => !e.end_date || e.end_date >= now);
}

export function computeReadinessScore(
  employees: Employee[],
  workspace: WorkspaceData | null | undefined
): ReadinessResult {
  const issues = buildReadinessIssues(employees, workspace);
  const active = activeEmployees(employees);
  const metrics = workspace?.metrics;

  let totalChecks = 0;
  let passedChecks = 0;

  if (active.length === 0) {
    return { score: 0, status: 'blocked', issues, passedChecks: 0, totalChecks: 1 };
  }

  const perEmployeeChecks = ['salary', 'email', 'bank', 'tax'] as const;
  for (const emp of active) {
    for (const check of perEmployeeChecks) {
      totalChecks++;
      const pass =
        check === 'salary' ? !!emp.salary_amount :
        check === 'email' ? !!emp.email :
        check === 'bank' ? !!emp.bank_account_number :
        !!emp.tax_number;
      if (pass) passedChecks++;
    }
  }

  totalChecks += 2;
  if ((metrics?.pendingClaims || 0) === 0) passedChecks++;
  if ((metrics?.draftPayrollRuns || 0) === 0 || metrics?.draftRunEstimatedCost) passedChecks++;

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
  const status: ReadinessResult['status'] =
    score >= 95 ? 'ready' : score >= 75 ? 'attention' : 'blocked';

  return { score, status, issues, passedChecks, totalChecks };
}

export function buildReadinessIssues(
  employees: Employee[],
  workspace: WorkspaceData | null | undefined
): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const active = activeEmployees(employees);
  const metrics = workspace?.metrics;

  const missingSalary = active.filter((e) => !e.salary_amount);
  const missingEmail = active.filter((e) => !e.email);
  const missingBank = active.filter((e) => !e.bank_account_number);
  const missingTax = active.filter((e) => !e.tax_number);
  const missingDepartment = active.filter((e) => !e.department);

  if (missingSalary.length) {
    issues.push({
      id: 'missing-salary',
      category: 'employee',
      label: 'Missing salary structures',
      detail: `${missingSalary.length} employee${missingSalary.length === 1 ? '' : 's'} without salary configured`,
      severity: 'critical',
      actionPath: '/employees',
    });
  }
  if (missingBank.length) {
    issues.push({
      id: 'missing-bank',
      category: 'employee',
      label: 'Missing bank accounts',
      detail: `${missingBank.length} employee${missingBank.length === 1 ? '' : 's'} without banking details`,
      severity: 'critical',
      actionPath: '/employees',
    });
  }
  if (missingTax.length) {
    issues.push({
      id: 'missing-tax',
      category: 'employee',
      label: 'Missing tax numbers',
      detail: `${missingTax.length} employee${missingTax.length === 1 ? '' : 's'} without tax numbers`,
      severity: 'warning',
      actionPath: '/employees',
    });
  }
  if (missingEmail.length) {
    issues.push({
      id: 'missing-email',
      category: 'employee',
      label: 'Missing email addresses',
      detail: `${missingEmail.length} employee${missingEmail.length === 1 ? '' : 's'} cannot receive payslips`,
      severity: 'warning',
      actionPath: '/employees',
    });
  }
  if (missingDepartment.length) {
    issues.push({
      id: 'missing-cost-centre',
      category: 'employee',
      label: 'Missing cost centres',
      detail: `${missingDepartment.length} employee${missingDepartment.length === 1 ? '' : 's'} without department assigned`,
      severity: 'info',
      actionPath: '/employees',
    });
  }
  if ((metrics?.pendingClaims || 0) > 0) {
    issues.push({
      id: 'pending-claims',
      category: 'claims',
      label: 'Pending expense claims',
      detail: `${metrics!.pendingClaims} claim${metrics!.pendingClaims === 1 ? '' : 's'} awaiting approval before payroll`,
      severity: 'warning',
      actionPath: '/expense-claims',
    });
  }
  if ((metrics?.approvedClaimsAwaitingReimbursement || 0) > 0) {
    issues.push({
      id: 'approved-claims',
      category: 'claims',
      label: 'Claims awaiting reimbursement',
      detail: `${metrics!.approvedClaimsAwaitingReimbursement} approved claim${metrics!.approvedClaimsAwaitingReimbursement === 1 ? '' : 's'} need payment`,
      severity: 'info',
      actionPath: '/expense-claims',
    });
  }
  if (metrics?.draftPayrollRuns && metrics.draftPayrollRuns > 0 && !metrics.draftRunEstimatedCost) {
    issues.push({
      id: 'draft-no-payslips',
      category: 'payroll',
      label: 'Draft run without payslips',
      detail: 'Generate payslips before processing the upcoming payroll run',
      severity: 'warning',
      actionPath: workspace?.upcomingPayrollRun ? `/payroll-runs/${workspace.upcomingPayrollRun.id}` : '/payroll-runs',
    });
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export function buildPayrollTimeline(
  workspace: WorkspaceData | null | undefined,
  claims: Claim[] = []
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const now = today();
  const metrics = workspace?.metrics;
  const upcoming = workspace?.upcomingPayrollRun;

  const draftClaims = claims.filter((c) => c.status === 'draft');
  if (draftClaims.length > 0) {
    events.push({
      id: 'claims-today',
      date: format(now, 'yyyy-MM-dd'),
      label: 'Expense claims pending',
      description: `${draftClaims.length} claim${draftClaims.length === 1 ? '' : 's'} need approval`,
      type: 'claims',
      actionPath: '/expense-claims',
      isToday: true,
    });
  }

  if (upcoming?.pay_date) {
    const payDate = parseISO(upcoming.pay_date);
    const reviewDate = subDays(payDate, 2);
    const processingDate = subDays(payDate, 1);
    const postingDate = addDays(payDate, 1);

    events.push({
      id: 'payroll-review',
      date: format(reviewDate, 'yyyy-MM-dd'),
      label: 'Payroll review',
      description: 'Verify payslips and deductions before processing',
      type: 'review',
      actionPath: `/payroll-runs/${upcoming.id}`,
    });
    events.push({
      id: 'payroll-processing',
      date: format(processingDate, 'yyyy-MM-dd'),
      label: 'Payroll processing',
      description: 'Finalise run and post journal entry',
      type: 'processing',
      actionPath: `/payroll-runs/${upcoming.id}`,
    });
    events.push({
      id: 'payslip-release',
      date: format(payDate, 'yyyy-MM-dd'),
      label: 'Payslips distributed',
      description: `Pay date — distribute payslips to ${metrics?.employeeCount || 0} employees`,
      type: 'payslips',
      actionPath: `/payroll-runs/${upcoming.id}`,
    });
    events.push({
      id: 'journal-posted',
      date: format(postingDate, 'yyyy-MM-dd'),
      label: 'Payroll journal posted',
      description: 'Confirm GL posting and bank payment',
      type: 'posting',
      actionPath: '/general-ledger',
    });
  } else if (metrics?.upcomingPayDate) {
    events.push({
      id: 'next-payroll',
      date: metrics.upcomingPayDate,
      label: 'Upcoming pay date',
      description: 'Prepare payroll run for this period',
      type: 'payroll',
      actionPath: '/payroll-runs',
    });
  }

  return events
    .map((e) => ({
      ...e,
      isPast: isBefore(parseISO(e.date), now) && format(parseISO(e.date), 'yyyy-MM-dd') !== format(now, 'yyyy-MM-dd'),
      isToday: format(parseISO(e.date), 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd'),
    }))
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
}

export function computeCashImpact(
  accounts: Account[],
  workspace: WorkspaceData | null | undefined,
  upcomingBillsTotal = 0
): CashImpact {
  const currentCash =
    findCashEquivalentAccounts(accounts).reduce((sum, a) => sum + (a.balance || 0), 0);

  const metrics = workspace?.metrics;
  const estimatedPayroll = metrics?.draftRunEstimatedCost || metrics?.estimatedMonthlyPayroll || 0;
  const upcomingTax = 0;
  const remainingCash = currentCash - estimatedPayroll - upcomingBillsTotal - upcomingTax;

  let health: CashImpact['health'] = 'healthy';
  let healthLabel = 'Sufficient cash for payroll';

  if (remainingCash < 0) {
    health = 'critical';
    healthLabel = 'Insufficient cash — payroll at risk';
  } else if (remainingCash < estimatedPayroll) {
    health = 'caution';
    healthLabel = 'Tight cash — monitor upcoming obligations';
  } else if (estimatedPayroll > 0 && remainingCash < estimatedPayroll * 2) {
    health = 'caution';
    healthLabel = 'Adequate but limited buffer after payroll';
  }

  return {
    currentCash,
    estimatedPayroll,
    upcomingBills: upcomingBillsTotal,
    upcomingTax,
    remainingCash,
    health,
    healthLabel,
  };
}

export function buildOperationalAlerts(
  employees: Employee[],
  workspace: WorkspaceData | null | undefined,
  claims: Claim[] = []
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const metrics = workspace?.metrics;
  const active = activeEmployees(employees);

  if (metrics?.lastProcessedNetPay && metrics.payrollVariance) {
    const variancePct = Math.abs(metrics.payrollVariance / metrics.lastProcessedNetPay) * 100;
    if (variancePct >= 10) {
      alerts.push({
        id: 'variance-threshold',
        tone: 'warning',
        title: 'Payroll variance exceeds threshold',
        message: `Upcoming net pay differs by ${variancePct.toFixed(0)}% (${metrics.payrollVariance > 0 ? 'increase' : 'decrease'}) vs last run.`,
        actionPath: workspace?.upcomingPayrollRun ? `/payroll-runs/${workspace.upcomingPayrollRun.id}` : '/payroll-runs',
        actionLabel: 'Review',
        priority: 1,
      });
    }
  }

  const duplicates = detectDuplicateEmployees(active);
  if (duplicates.length) {
    alerts.push({
      id: 'duplicate-employee',
      tone: 'danger',
      title: 'Possible duplicate employee',
      message: duplicates[0],
      actionPath: '/employees',
      actionLabel: 'Review',
      priority: 0,
    });
  }

  const staleClaims = claims.filter((c) => {
    if (c.status !== 'draft') return false;
    const submitted = parseISO(c.submission_date);
    return isBefore(submitted, subDays(today(), 14));
  });
  if (staleClaims.length) {
    alerts.push({
      id: 'stale-claims',
      tone: 'warning',
      title: 'Claims approaching deadline',
      message: `${staleClaims.length} draft claim${staleClaims.length === 1 ? '' : 's'} older than 14 days.`,
      actionPath: '/expense-claims',
      actionLabel: 'Approve',
      priority: 2,
    });
  }

  const missingBank = active.filter((e) => !e.bank_account_number);
  if (missingBank.length) {
    alerts.push({
      id: 'missing-banking',
      tone: 'danger',
      title: 'Employees missing banking details',
      message: `${missingBank.length} employee${missingBank.length === 1 ? '' : 's'} cannot be paid electronically.`,
      actionPath: '/employees',
      actionLabel: 'Fix',
      priority: 1,
    });
  }

  if ((metrics?.draftPayrollRuns || 0) > 0 && metrics?.upcomingPayDate) {
    const daysUntilPay = Math.ceil(
      (parseISO(metrics.upcomingPayDate).getTime() - today().getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilPay <= 3 && daysUntilPay >= 0) {
      alerts.push({
        id: 'payroll-due-soon',
        tone: 'info',
        title: 'Payroll due soon',
        message: `Pay date in ${daysUntilPay} day${daysUntilPay === 1 ? '' : 's'} — ensure run is finalised.`,
        actionPath: workspace?.upcomingPayrollRun ? `/payroll-runs/${workspace.upcomingPayrollRun.id}` : '/payroll-runs',
        actionLabel: 'Process',
        priority: 3,
      });
    }
  }

  return alerts.sort((a, b) => a.priority - b.priority);
}

export function buildPayrollInsights(
  employees: Employee[],
  workspace: WorkspaceData | null | undefined,
  claims: Claim[] = []
): PayrollInsight[] {
  const insights: PayrollInsight[] = [];
  const metrics = workspace?.metrics;
  const readiness = computeReadinessScore(employees, workspace);

  if (metrics?.payrollVariance && metrics.lastProcessedNetPay) {
    const direction = metrics.payrollVariance > 0 ? 'higher' : 'lower';
    const pct = Math.abs((metrics.payrollVariance / metrics.lastProcessedNetPay) * 100).toFixed(1);
    insights.push({
      id: 'variance-explain',
      tone: Math.abs(metrics.payrollVariance / metrics.lastProcessedNetPay) > 0.1 ? 'warning' : 'info',
      title: 'Payroll variance explained',
      message: `Upcoming net pay is ${pct}% ${direction} than the last processed run (${metrics.payrollVariance > 0 ? '+' : ''}${metrics.payrollVariance.toFixed(2)}). Review payslip line items for salary changes or adjustments.`,
      actionPath: workspace?.upcomingPayrollRun ? `/payroll-runs/${workspace.upcomingPayrollRun.id}` : '/payroll-runs',
      actionLabel: 'Review run',
    });
  }

  const duplicateAmounts = findDuplicateClaims(claims);
  if (duplicateAmounts.length) {
    insights.push({
      id: 'duplicate-claims',
      tone: 'warning',
      title: 'Possible duplicate claims',
      message: duplicateAmounts[0],
      actionPath: '/expense-claims',
      actionLabel: 'Investigate',
    });
  }

  if (readiness.issues.length > 0) {
    insights.push({
      id: 'readiness-summary',
      tone: readiness.score >= 95 ? 'success' : readiness.score >= 75 ? 'warning' : 'danger',
      title: `Payroll readiness at ${readiness.score}%`,
      message: readiness.issues.slice(0, 2).map((i) => i.label).join(' · ') + (readiness.issues.length > 2 ? ` and ${readiness.issues.length - 2} more` : ''),
      actionPath: '/employees',
      actionLabel: 'Resolve',
    });
  }

  if (metrics?.estimatedMonthlyPayroll) {
    const trend = metrics.lastProcessedNetPay
      ? metrics.draftRunEstimatedCost > metrics.lastProcessedNetPay ? 'increasing' : 'stable'
      : 'establishing baseline';
    insights.push({
      id: 'forecast',
      tone: 'info',
      title: 'Payroll cost forecast',
      message: `Estimated monthly payroll cost is ${trend === 'increasing' ? 'trending up' : trend === 'stable' ? 'stable' : 'being established'} based on ${activeEmployees(employees).length} active employees.`,
      actionPath: '/payroll-reports',
      actionLabel: 'View reports',
    });
  }

  const missingInfo = (workspace?.exceptions?.length || 0) + activeEmployees(employees).filter((e) => !e.tax_number).length;
  if (missingInfo > 0) {
    insights.push({
      id: 'missing-info',
      tone: 'info',
      title: 'Missing payroll information',
      message: `${missingInfo} data gap${missingInfo === 1 ? '' : 's'} detected across employee records. Complete profiles to reduce payroll risk.`,
      actionPath: '/employees',
      actionLabel: 'Complete',
    });
  }

  const priority: Record<PayrollInsight['tone'], number> = { danger: 0, warning: 1, info: 2, success: 3 };
  return insights.sort((a, b) => priority[a.tone] - priority[b.tone]).slice(0, 5);
}

export function buildPayrollCalendarEvents(
  workspace: WorkspaceData | null | undefined,
  claims: Claim[] = []
): PayrollCalendarEvent[] {
  const events: PayrollCalendarEvent[] = [];
  const upcoming = workspace?.upcomingPayrollRun;
  const horizon = addDays(today(), 30);

  if (upcoming?.pay_date && isWithinInterval(parseISO(upcoming.pay_date), { start: today(), end: horizon })) {
    const payDate = parseISO(upcoming.pay_date);
    events.push({
      id: `review-${upcoming.id}`,
      date: format(subDays(payDate, 2), 'yyyy-MM-dd'),
      title: 'Payroll review deadline',
      type: 'payroll_review',
      status: 'scheduled',
      actionPath: `/payroll-runs/${upcoming.id}`,
    });
    events.push({
      id: `payroll-${upcoming.id}`,
      date: upcoming.pay_date,
      title: 'Payroll processing',
      type: 'payroll',
      status: upcoming.status,
      actionPath: `/payroll-runs/${upcoming.id}`,
    });
    events.push({
      id: `payslip-${upcoming.id}`,
      date: upcoming.pay_date,
      title: 'Payslip release',
      type: 'payslip_release',
      status: 'scheduled',
      actionPath: `/payroll-runs/${upcoming.id}`,
    });
  }

  for (const claim of claims.filter((c) => c.status === 'draft')) {
    const deadline = addDays(parseISO(claim.submission_date), 30);
    if (isWithinInterval(deadline, { start: today(), end: horizon })) {
      events.push({
        id: `claim-${claim.id}`,
        date: format(deadline, 'yyyy-MM-dd'),
        title: `Claim ${claim.claim_number} deadline`,
        type: 'claim_deadline',
        status: 'pending',
        actionPath: '/expense-claims',
      });
    }
  }

  return events.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
}

function detectDuplicateEmployees(employees: Employee[]): string[] {
  const messages: string[] = [];
  const byEmail = new Map<string, Employee[]>();
  const byName = new Map<string, Employee[]>();

  for (const emp of employees) {
    if (emp.email) {
      const key = emp.email.toLowerCase();
      byEmail.set(key, [...(byEmail.get(key) || []), emp]);
    }
    const nameKey = `${emp.first_name.toLowerCase()} ${emp.last_name.toLowerCase()}`;
    byName.set(nameKey, [...(byName.get(nameKey) || []), emp]);
  }

  for (const [, group] of byEmail) {
    if (group.length > 1) {
      messages.push(`Duplicate email detected: ${formatEmployeeAiContext(group[0])} and ${formatEmployeeAiContext(group[1])}`);
    }
  }
  for (const [, group] of byName) {
    if (group.length > 1 && !messages.length) {
      messages.push(`Duplicate name detected: ${formatEmployeeAiContext(group[0])} appears ${group.length} times`);
    }
  }
  return messages;
}

function findDuplicateClaims(claims: Claim[]): string[] {
  const drafts = claims.filter((c) => c.status === 'draft');
  const seen = new Map<string, Claim[]>();
  for (const claim of drafts) {
    const key = `${claim.employee_id || 'unknown'}-${claim.total_amount}`;
    seen.set(key, [...(seen.get(key) || []), claim]);
  }
  for (const [, group] of seen) {
    if (group.length > 1) {
      return [`${group.length} draft claims with the same amount (${group[0].total_amount}) for the same employee — verify these are not duplicates.`];
    }
  }
  return [];
}

export type PayrollWorkspaceData = {
  metrics: {
    employeeCount: number;
    estimatedMonthlyPayroll: number;
    draftPayrollRuns: number;
    pendingClaims: number;
    approvedClaimsAwaitingReimbursement: number;
    employeesNeedingAction: number;
    upcomingPayDate: string | null;
    draftRunEstimatedCost: number;
    lastProcessedNetPay: number;
    payrollVariance: number;
    payrollReady: boolean;
    lastProcessedGross?: number;
    lastProcessedPaye?: number;
    lastProcessedUif?: number;
    lastProcessedSdl?: number;
    bankBatchStatus?: string;
    payslipGenerationStatus?: string;
    upcomingPayrollRunStatus?: string | null;
  };
  exceptions: { type: string; employeeId: string; name: string }[];
  recentPayrollRuns: PayrollRunRow[];
  pendingClaimsList: Claim[];
  upcomingPayrollRun: PayrollRunRow | null;
};

type PayrollRunRow = {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  status: string;
};

type PayslipItemRow = {
  description: string;
  type: 'earning' | 'deduction';
  amount: number;
};

export type PayrollSummaryItem = {
  item_description: string;
  item_type: 'earning' | 'deduction';
  total_amount: number;
};

/**
 * Builds workspace summary from existing API responses — avoids undeployed GET_WORKSPACE_SUMMARY.
 */
export function buildWorkspaceSummary(
  employees: Employee[],
  allRuns: PayrollRunRow[],
  allClaims: Claim[],
  payslipNetByRunId: Record<string, number> = {},
  extras?: {
    lastProcessedSummary?: {
      total_gross?: number;
      total_paye?: number;
      total_uif?: number;
      total_sdl?: number;
      employees_paid?: number;
    } | null;
    lastProcessedRunMeta?: {
      output_metadata?: {
        bank_batch?: { status?: string };
        payslips_generated?: number;
      };
    } | null;
  }
): PayrollWorkspaceData {
  const todayStr = format(today(), 'yyyy-MM-dd');
  const active = activeEmployees(employees);
  const missingSalary = active.filter((e) => !e.salary_amount);
  const missingEmail = active.filter((e) => !e.email);
  const missingBank = active.filter((e) => !e.bank_account_number);

  const normalizeToMonthly = (amount: number, period: string | null) => {
    if (period === 'weekly') return amount * 52 / 12;
    if (period === 'fortnightly') return amount * 26 / 12;
    return amount;
  };

  const estimatedMonthlyPayroll = active.reduce((sum, e) => {
    if (!e.salary_amount) return sum;
    return sum + normalizeToMonthly(e.salary_amount, e.salary_period);
  }, 0);

  const draftRuns = (allRuns || []).filter((r) => r.status === 'draft');
  const upcomingPayrollRun =
    [...draftRuns].sort((a, b) => new Date(a.pay_date).getTime() - new Date(b.pay_date).getTime())[0] || null;

  let draftRunEstimatedCost = 0;
  if (upcomingPayrollRun) {
    draftRunEstimatedCost = payslipNetByRunId[upcomingPayrollRun.id] ?? estimatedMonthlyPayroll;
  }

  const lastProcessedRun = (allRuns || []).find((r) => isRunFinalized(r.status)) || null;
  const lastProcessedNetPay = lastProcessedRun ? (payslipNetByRunId[lastProcessedRun.id] ?? 0) : 0;
  const lastProcessedMeta = extras?.lastProcessedRunMeta?.output_metadata;
  const lastSummary = extras?.lastProcessedSummary;

  const payrollVariance =
    lastProcessedNetPay > 0 && draftRunEstimatedCost > 0 ? draftRunEstimatedCost - lastProcessedNetPay : 0;

  const draftClaimsCount = allClaims.filter((c) => c.status === 'draft').length;
  const approvedClaimsCount = allClaims.filter((c) => c.status === 'approved').length;
  const pendingClaimsList = [...allClaims]
    .filter((c) => c.status === 'draft' || c.status === 'approved')
    .sort((a, b) => b.submission_date.localeCompare(a.submission_date))
    .slice(0, 5);

  return {
    metrics: {
      employeeCount: active.length,
      estimatedMonthlyPayroll,
      draftPayrollRuns: draftRuns.length,
      pendingClaims: draftClaimsCount,
      approvedClaimsAwaitingReimbursement: approvedClaimsCount,
      employeesNeedingAction: new Set([
        ...missingSalary.map((e) => e.id),
        ...missingEmail.map((e) => e.id),
        ...missingBank.map((e) => e.id),
      ]).size,
      upcomingPayDate: upcomingPayrollRun?.pay_date || null,
      draftRunEstimatedCost,
      lastProcessedNetPay,
      payrollVariance,
      payrollReady: missingSalary.length === 0 && active.length > 0,
      lastProcessedGross: lastSummary?.total_gross ?? 0,
      lastProcessedPaye: lastSummary?.total_paye ?? 0,
      lastProcessedUif: lastSummary?.total_uif ?? 0,
      lastProcessedSdl: lastSummary?.total_sdl ?? 0,
      bankBatchStatus: lastProcessedMeta?.bank_batch?.status ?? 'not_generated',
      payslipGenerationStatus: lastProcessedMeta?.payslips_generated
        ? `${lastProcessedMeta.payslips_generated} generated`
        : lastSummary?.employees_paid
          ? `${lastSummary.employees_paid} generated`
          : 'none',
      upcomingPayrollRunStatus: upcomingPayrollRun?.status ?? (draftRuns.length ? 'draft' : null),
    },
    exceptions: [
      ...missingSalary.map((e) => ({ type: 'missing_salary', employeeId: e.id, name: formatEmployeeAiContext(e) })),
      ...missingEmail.map((e) => ({ type: 'missing_email', employeeId: e.id, name: formatEmployeeAiContext(e) })),
      ...missingBank.map((e) => ({ type: 'missing_bank', employeeId: e.id, name: formatEmployeeAiContext(e) })),
    ],
    recentPayrollRuns: (allRuns || []).slice(0, 10),
    pendingClaimsList,
    upcomingPayrollRun,
  };
}

export function aggregatePayrollSummaryItems(items: PayslipItemRow[]): PayrollSummaryItem[] {
  const aggregates = new Map<string, PayrollSummaryItem>();
  for (const item of items) {
    const key = `${item.type}::${item.description}`;
    const existing = aggregates.get(key);
    if (existing) {
      existing.total_amount += item.amount;
    } else {
      aggregates.set(key, {
        item_description: item.description,
        item_type: item.type,
        total_amount: item.amount,
      });
    }
  }
  return Array.from(aggregates.values());
}
