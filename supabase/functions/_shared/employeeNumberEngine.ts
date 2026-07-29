/**
 * Employee Number Engine — server-side helpers only.
 * Generation is delegated to Postgres RPC for atomic concurrency safety.
 */

export type EmployeeNumberAuditPayload = {
  employee_number: string;
  company_id: string;
  user_id: string;
  command_id?: string | null;
  correlation_id?: string | null;
  source: 'create' | 'import';
  employee_name?: string | null;
  department?: string | null;
  branch?: string | null;
  position?: string | null;
};

export function stripEmployeeNumber<T extends Record<string, unknown>>(data: T): Omit<T, 'employee_number'> {
  const { employee_number: _removed, ...rest } = data;
  return rest;
}

export async function logEmployeeNumberGenerated(
  supabaseAdmin: { from: (table: string) => { insert: (row: unknown) => Promise<unknown> } },
  employeeId: string,
  payload: EmployeeNumberAuditPayload
) {
  const auditRecord = {
    company_id: payload.company_id,
    table_name: 'employees',
    operation: 'EMPLOYEE_NUMBER_GENERATED',
    record_id: employeeId,
    changed_by: payload.user_id,
    new_data: {
      employee_id: employeeId,
      employee_number: payload.employee_number,
      employee_name: payload.employee_name ?? null,
      department: payload.department ?? null,
      branch: payload.branch ?? null,
      position: payload.position ?? null,
      company_id: payload.company_id,
      command_id: payload.command_id ?? null,
      correlation_id: payload.correlation_id ?? null,
      source: payload.source,
      timestamp: new Date().toISOString(),
      readable: `${payload.employee_number} — ${payload.employee_name ?? 'Employee'}${payload.department ? ` · ${payload.department}` : ''}`,
    },
  };

  try {
    await supabaseAdmin.from('audit_logs').insert(auditRecord);
  } catch (err) {
    console.log(JSON.stringify({ audit_fallback: 'EMPLOYEE_NUMBER_GENERATED', employeeId, auditRecord, err: String(err) }));
  }
}
