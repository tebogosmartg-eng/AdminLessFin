/**
 * Employee Identity Platform — canonical service layer.
 * UUID = technical identifier. employee_number = permanent business identifier.
 * All modules must consume identity through this service.
 */

export type EmploymentStatus = 'active' | 'on_leave' | 'suspended' | 'terminated' | 'archived';

export type EmployeeIdentityFields = {
  id?: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  department?: string | null;
  branch?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  id_number?: string | null;
  employment_status?: EmploymentStatus | string | null;
  employment_type?: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  avatar_url?: string | null;
};

export type EmployeeNumberingPolicy = {
  format_template: string;
  sequence_padding: number;
  next_sequence: number;
  starting_number?: number;
  company_code?: string | null;
  branch_code?: string | null;
  qr_style?: 'standard' | 'minimal' | 'branded';
  barcode_style?: 'code128' | 'code39';
  display_format?: 'stacked' | 'inline' | 'compact' | 'number_first';
};

export type ResolvedEmployeeIdentity = {
  id: string;
  employeeNumber: string;
  displayName: string;
  department: string | null;
  branch: string | null;
  position: string | null;
  employmentStatus: EmploymentStatus;
  avatarUrl: string | null;
  avatarInitials: string;
  companyId: string | null;
  companyName: string | null;
  searchLabels: string[];
  managerName: string | null;
};

export type EmployeeTimelineEventType =
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_NUMBER_ASSIGNED'
  | 'DEPARTMENT_CHANGED'
  | 'BRANCH_CHANGED'
  | 'MANAGER_CHANGED'
  | 'POSITION_CHANGED'
  | 'SALARY_CHANGED'
  | 'PAYROLL_GENERATED'
  | 'ASSET_ASSIGNED'
  | 'ASSET_RETURNED'
  | 'LOAN_ISSUED'
  | 'LOAN_CLOSED'
  | 'EXPENSE_SUBMITTED'
  | 'EXPENSE_APPROVED'
  | 'EXPENSE_PAID'
  | 'LEAVE_APPROVED'
  | 'LEAVE_DECLINED'
  | 'EMPLOYMENT_TERMINATED'
  | 'EMPLOYMENT_REINSTATED'
  | 'EMPLOYEE_ARCHIVED';

export const TIMELINE_EVENT_LABELS: Record<EmployeeTimelineEventType, string> = {
  EMPLOYEE_CREATED: 'Employee Created',
  EMPLOYEE_NUMBER_ASSIGNED: 'Employee Number Assigned',
  DEPARTMENT_CHANGED: 'Department Changed',
  BRANCH_CHANGED: 'Branch Changed',
  MANAGER_CHANGED: 'Manager Changed',
  POSITION_CHANGED: 'Position Changed',
  SALARY_CHANGED: 'Salary Changed',
  PAYROLL_GENERATED: 'Payroll Generated',
  ASSET_ASSIGNED: 'Asset Assigned',
  ASSET_RETURNED: 'Asset Returned',
  LOAN_ISSUED: 'Loan Issued',
  LOAN_CLOSED: 'Loan Closed',
  EXPENSE_SUBMITTED: 'Expense Submitted',
  EXPENSE_APPROVED: 'Expense Approved',
  EXPENSE_PAID: 'Expense Paid',
  LEAVE_APPROVED: 'Leave Approved',
  LEAVE_DECLINED: 'Leave Declined',
  EMPLOYMENT_TERMINATED: 'Employment Terminated',
  EMPLOYMENT_REINSTATED: 'Employment Reinstated',
  EMPLOYEE_ARCHIVED: 'Employee Archived',
};

export const POLICY_TOKEN_OPTIONS = [
  { token: '{SEQ}', description: 'Zero-padded sequence number' },
  { token: '{YEAR}', description: 'Current year (YYYY)' },
  { token: '{MONTH}', description: 'Current month (MM)' },
  { token: '{COMPANY}', description: 'Company code' },
  { token: '{BRANCH}', description: 'Branch code' },
] as const;

export const POLICY_PRESETS = [
  { label: 'Standard', pattern: 'EMP-{SEQ}', example: 'EMP-000001' },
  { label: 'Yearly', pattern: 'EMP-{YEAR}-{SEQ}', example: 'EMP-2026-000001' },
  { label: 'Company prefix', pattern: '{COMPANY}-EMP-{SEQ}', example: 'SPC-EMP-000001' },
  { label: 'Branch + year', pattern: '{BRANCH}-EMP-{YEAR}-{SEQ}', example: 'PTA-EMP-2026-000001' },
] as const;

export const DISPLAY_FORMAT_OPTIONS = [
  { value: 'stacked', label: 'Stacked (number → name → department)' },
  { value: 'inline', label: 'Inline (number · name · department)' },
  { value: 'compact', label: 'Compact (number · name)' },
  { value: 'number_first', label: 'Number First (prominent number)' },
] as const;

export const QR_STYLE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'branded', label: 'Branded' },
] as const;

export const BARCODE_STYLE_OPTIONS = [
  { value: 'code128', label: 'Code 128' },
  { value: 'code39', label: 'Code 39' },
] as const;

export function formatEmployeeFullName(
  employee: Pick<EmployeeIdentityFields, 'first_name' | 'last_name'>
): string {
  return `${employee.first_name} ${employee.last_name}`.trim();
}

export function getAvatarInitials(
  employee: Pick<EmployeeIdentityFields, 'first_name' | 'last_name'>
): string {
  const first = employee.first_name?.charAt(0) ?? '';
  const last = employee.last_name?.charAt(0) ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

export function formatEmployeeIdentityLine(employee: EmployeeIdentityFields): string {
  const parts = [employee.employee_number, formatEmployeeFullName(employee)];
  if (employee.department) parts.push(employee.department);
  if (employee.branch) parts.push(employee.branch);
  return parts.join(' · ');
}

export function formatEmployeeIdentityCompact(employee: EmployeeIdentityFields): string {
  return `${employee.employee_number} · ${formatEmployeeFullName(employee)}`;
}

export function formatEmployeeDocumentHeader(
  employee: EmployeeIdentityFields,
  companyName?: string | null
): string {
  const lines = [
    `Employee No: ${employee.employee_number}`,
    formatEmployeeFullName(employee),
    employee.department ? `Department: ${employee.department}` : null,
    employee.branch ? `Branch: ${employee.branch}` : null,
    companyName ? `Company: ${companyName}` : employee.company_name ? `Company: ${employee.company_name}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

export function formatEmployeeEmailIdentity(
  employee: EmployeeIdentityFields,
  companyName?: string | null
): string {
  const company = companyName ?? employee.company_name;
  const parts = [employee.employee_number, formatEmployeeFullName(employee)];
  if (employee.department) parts.push(employee.department);
  if (company) parts.push(company);
  return parts.join(' · ');
}

export function formatEmployeeExportRow(employee: EmployeeIdentityFields): Record<string, string> {
  return {
    'Employee Number': employee.employee_number,
    'Employee Name': formatEmployeeFullName(employee),
    Department: employee.department ?? '',
    Branch: employee.branch ?? '',
    Position: employee.position ?? '',
    Company: employee.company_name ?? '',
    Status: employee.employment_status ?? 'active',
  };
}

export function formatEmployeeAiContext(employee: EmployeeIdentityFields): string {
  const parts = [employee.employee_number, formatEmployeeFullName(employee)];
  if (employee.department) parts.push(employee.department);
  if (employee.position) parts.push(employee.position);
  if (employee.company_name) parts.push(employee.company_name);
  return parts.join(' — ');
}

export function formatEmployeeAuditReadable(
  employee: EmployeeIdentityFields & { id: string },
  meta: {
    operation: string;
    companyId: string;
    companyName?: string | null;
    commandId?: string | null;
    correlationId?: string | null;
    userId?: string | null;
    timestamp?: string;
  }
): string {
  const ts = meta.timestamp ?? new Date().toISOString();
  return [
    `[${meta.operation}]`,
    `${employee.employee_number} (${employee.id.slice(0, 8)}…)`,
    formatEmployeeFullName(employee),
    employee.department ? `Dept: ${employee.department}` : null,
    meta.companyName ? `Company: ${meta.companyName}` : null,
    meta.commandId ? `Cmd: ${meta.commandId.slice(0, 8)}…` : null,
    meta.correlationId ? `Corr: ${meta.correlationId.slice(0, 12)}…` : null,
    `@ ${ts}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function buildEmployeeAuditRecord(
  employee: EmployeeIdentityFields & { id: string },
  companyId: string,
  meta: {
    userId?: string | null;
    commandId?: string | null;
    correlationId?: string | null;
    operation?: string;
    companyName?: string | null;
  }
) {
  return {
    employee_id: employee.id,
    employee_number: employee.employee_number,
    employee_name: formatEmployeeFullName(employee),
    department: employee.department ?? null,
    branch: employee.branch ?? null,
    position: employee.position ?? null,
    company_id: companyId,
    company_name: meta.companyName ?? null,
    command_id: meta.commandId ?? null,
    correlation_id: meta.correlationId ?? null,
    changed_by: meta.userId ?? null,
    operation: meta.operation ?? 'EMPLOYEE_NUMBER_GENERATED',
    timestamp: new Date().toISOString(),
  };
}

export function resolveEmployeeIdentity(employee: EmployeeIdentityFields): ResolvedEmployeeIdentity {
  const status = (employee.employment_status ?? 'active') as EmploymentStatus;
  return {
    id: employee.id ?? '',
    employeeNumber: employee.employee_number,
    displayName: formatEmployeeFullName(employee),
    department: employee.department ?? null,
    branch: employee.branch ?? null,
    position: employee.position ?? null,
    employmentStatus: status,
    avatarUrl: employee.avatar_url ?? null,
    avatarInitials: getAvatarInitials(employee),
    companyId: employee.company_id ?? null,
    companyName: employee.company_name ?? null,
    searchLabels: buildEmployeeSearchLabels(employee),
    managerName: employee.manager_name ?? null,
  };
}

export function buildEmployeeSearchLabels(employee: EmployeeIdentityFields): string[] {
  return [
    employee.employee_number,
    employee.first_name,
    employee.last_name,
    formatEmployeeFullName(employee),
    employee.id_number,
    employee.email,
    employee.phone,
    employee.department,
    employee.branch,
    employee.position,
    employee.manager_name,
    employee.employment_status,
    employee.employment_type,
  ].filter((v): v is string => Boolean(v && String(v).trim()));
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function employeeMatchesSearch(employee: EmployeeIdentityFields, query: string): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;

  const labels = buildEmployeeSearchLabels(employee).map((l) => l.toLowerCase());
  if (labels.some((l) => l.includes(q))) return true;

  if (q.startsWith('emp') || /^[a-z0-9]+-\d*$/.test(q)) {
    const num = employee.employee_number.toLowerCase();
    if (num.startsWith(q) || num.includes(q)) return true;
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const haystack = labels.join(' ');
    return tokens.every((t) => haystack.includes(t));
  }

  return false;
}

export function employeeSearchScore(employee: EmployeeIdentityFields, query: string): number {
  const q = normalizeSearchQuery(query);
  if (!q) return 0;

  const num = employee.employee_number.toLowerCase();
  if (num === q) return 1000;
  if (num.startsWith(q)) return 900;

  const fullName = formatEmployeeFullName(employee).toLowerCase();
  if (fullName === q) return 800;
  if (fullName.startsWith(q)) return 700;

  const labels = buildEmployeeSearchLabels(employee).map((l) => l.toLowerCase());
  if (labels.some((l) => l === q)) return 600;
  if (labels.some((l) => l.startsWith(q))) return 500;
  if (employeeMatchesSearch(employee, q)) return 100;

  return 0;
}

export function filterAndRankEmployees<T extends EmployeeIdentityFields>(
  employees: T[],
  query: string
): T[] {
  if (!query.trim()) return employees;
  return employees
    .map((e) => ({ e, score: employeeSearchScore(e, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => e);
}

export function previewEmployeeNumber(
  policy: EmployeeNumberingPolicy,
  sequence?: number
): string {
  const seq = sequence ?? policy.next_sequence ?? policy.starting_number ?? 1;
  const padding = policy.sequence_padding ?? 6;
  const now = new Date();
  let result = policy.format_template;
  result = result.replaceAll('{SEQ}', String(seq).padStart(padding, '0'));
  result = result.replaceAll('{YEAR}', String(now.getFullYear()));
  result = result.replaceAll('{MONTH}', String(now.getMonth() + 1).padStart(2, '0'));
  result = result.replaceAll('{COMPANY}', policy.company_code?.trim() || 'CO');
  result = result.replaceAll('{BRANCH}', policy.branch_code?.trim() || 'MAIN');
  return result;
}

export function resolveEmployeeByNumber<T extends EmployeeIdentityFields>(
  employees: T[],
  employeeNumber: string
): T | undefined {
  const q = employeeNumber.trim().toLowerCase();
  return employees.find((e) => e.employee_number.toLowerCase() === q);
}

export function resolveEmployeeById<T extends EmployeeIdentityFields>(
  employees: T[],
  id: string
): T | undefined {
  return employees.find((e) => e.id === id);
}

export function getEmploymentStatusLabel(status?: string | null): string {
  const map: Record<string, string> = {
    active: 'Active',
    on_leave: 'On Leave',
    suspended: 'Suspended',
    terminated: 'Terminated',
    archived: 'Archived',
  };
  return map[status ?? 'active'] ?? status ?? 'Active';
}
