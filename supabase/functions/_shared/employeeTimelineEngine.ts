/**
 * Employee Timeline Engine — server-side immutable event recording.
 */

export type TimelineEventPayload = {
  employee_id: string;
  employee_number: string;
  company_id: string;
  event_type: string;
  event_label: string;
  event_data?: Record<string, unknown>;
  command_id?: string | null;
  correlation_id?: string | null;
  changed_by?: string | null;
};

export const TIMELINE_LABELS: Record<string, string> = {
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

type SupabaseAdmin = {
  from: (table: string) => {
    insert: (row: unknown) => Promise<{ error?: { message: string } | null }>;
    select: (cols?: string) => {
      eq: (col: string, val: string) => {
        eq: (col2: string, val2: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data?: unknown[]; error?: { message: string } | null }>;
        };
      };
    };
  };
};

export async function recordEmployeeTimelineEvent(
  supabaseAdmin: SupabaseAdmin,
  payload: TimelineEventPayload
) {
  const row = {
    employee_id: payload.employee_id,
    employee_number: payload.employee_number,
    company_id: payload.company_id,
    event_type: payload.event_type,
    event_label: payload.event_label || TIMELINE_LABELS[payload.event_type] || payload.event_type,
    event_data: payload.event_data ?? {},
    command_id: payload.command_id ?? null,
    correlation_id: payload.correlation_id ?? null,
    changed_by: payload.changed_by ?? null,
  };

  try {
    const { error } = await supabaseAdmin.from('employee_timeline_events').insert(row);
    if (error) console.log(JSON.stringify({ timeline_error: error.message, row }));
  } catch (err) {
    console.log(JSON.stringify({ timeline_fallback: payload.event_type, err: String(err) }));
  }
}

const FIELD_EVENT_MAP: Record<string, string> = {
  department: 'DEPARTMENT_CHANGED',
  branch: 'BRANCH_CHANGED',
  manager_id: 'MANAGER_CHANGED',
  position: 'POSITION_CHANGED',
  salary_amount: 'SALARY_CHANGED',
  employment_status: 'EMPLOYMENT_TERMINATED',
  end_date: 'EMPLOYMENT_TERMINATED',
};

export async function recordEmployeeFieldChanges(
  supabaseAdmin: SupabaseAdmin,
  params: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    company_id: string;
    user_id: string;
    command_id?: string | null;
    correlation_id?: string | null;
  }
) {
  const { before, after, company_id, user_id, command_id, correlation_id } = params;
  const employeeId = after.id as string;
  const employeeNumber = after.employee_number as string;

  for (const [field, eventType] of Object.entries(FIELD_EVENT_MAP)) {
    const oldVal = before[field];
    const newVal = after[field];
    if (oldVal === newVal) continue;
    if (newVal === undefined) continue;

    let type = eventType;
    if (field === 'employment_status') {
      if (newVal === 'archived') type = 'EMPLOYEE_ARCHIVED';
      else if (newVal === 'active' && oldVal === 'terminated') type = 'EMPLOYMENT_REINSTATED';
      else if (newVal === 'terminated') type = 'EMPLOYMENT_TERMINATED';
    }

    await recordEmployeeTimelineEvent(supabaseAdmin, {
      employee_id: employeeId,
      employee_number: employeeNumber,
      company_id,
      event_type: type,
      event_label: TIMELINE_LABELS[type] ?? type,
      event_data: {
        field,
        from: oldVal ?? null,
        to: newVal,
        first_name: after.first_name,
        last_name: after.last_name,
        department: after.department,
        detail: `${field}: ${oldVal ?? '—'} → ${newVal}`,
      },
      command_id,
      correlation_id,
      changed_by: user_id,
    });
  }
}

export function formatEmployeeIdentityContext(emp: {
  employee_number: string;
  first_name: string;
  last_name: string;
  department?: string | null;
  position?: string | null;
}): string {
  const name = `${emp.first_name} ${emp.last_name}`.trim();
  const parts = [emp.employee_number, name];
  if (emp.department) parts.push(emp.department);
  if (emp.position) parts.push(emp.position);
  return parts.join(' — ');
}
