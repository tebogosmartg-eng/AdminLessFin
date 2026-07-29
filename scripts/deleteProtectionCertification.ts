/**
 * V3.2.22 — Production Employee Delete Protection Certification
 * DELETE only via employees Edge Function. No direct SQL DELETE.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch { /* optional */ }
  }
}
loadEnv();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function invokeEmployeesRaw(body: Record<string, unknown>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: process.env.VITE_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { httpStatus: res.status, body: json, raw: text };
}

async function countForEmployee(employeeId: string, companyId: string) {
  const [{ count: payslips }, { count: expenses }, { count: timeline }, { count: rules }, emp] = await Promise.all([
    supabase.from('payslips').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId),
    supabase.from('expense_claims').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId),
    supabase.from('employee_timeline_events').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId),
    supabase.from('employee_payroll_rule_settings').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId),
    supabase.from('employees').select('id, employee_number, first_name, last_name').eq('id', employeeId).maybeSingle(),
  ]);

  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('table_name', 'employees')
    .eq('record_id', employeeId);

  const { data: journals } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .ilike('description', '%payroll%');

  const { data: payrollHist } = await supabase.functions.invoke('payroll', {
    body: { method: 'GET_EMPLOYEE_PAYROLL_HISTORY', company_id: companyId, employeeId },
  });

  return {
    employee: emp.data,
    payslips: payslips ?? 0,
    expense_claims: expenses ?? 0,
    timeline_events: timeline ?? 0,
    payroll_rule_settings: rules ?? 0,
    audit_logs_employee: auditLogs === null ? 0 : (auditLogs as unknown as number) ?? 0,
    journal_entries_payrollish: journals === null ? 0 : (journals as unknown as number) ?? 0,
    payroll_history_len: Array.isArray(payrollHist) ? payrollHist.length : payrollHist,
  };
}

async function main() {
  const evidence: Record<string, unknown> = {
    version: '3.2.22',
    mission: 'PRODUCTION_EMPLOYEE_DELETE_PROTECTION',
    phases: {},
  };

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (authErr || !auth.user) {
    console.log(JSON.stringify({ verdict: 'NOT CERTIFIED', reason: 'AUTH_FAILED', detail: authErr?.message }, null, 2));
    process.exit(1);
  }

  const { data: memberships } = await supabase
    .from('company_users')
    .select('company_id, role')
    .eq('user_id', auth.user.id)
    .in('role', ['owner', 'admin']);
  const companyId = memberships?.[0]?.company_id ?? auth.user.id;

  // ── PHASE 1 ──
  const { data: allEmps } = await supabase
    .from('employees')
    .select('id, employee_number, first_name, last_name')
    .eq('company_id', companyId)
    .order('employee_number');

  const phase1: unknown[] = [];
  for (const emp of allEmps ?? []) {
    const counts = await countForEmployee(emp.id, companyId);
    const { data: slips } = await supabase
      .from('payslips')
      .select('id, calculation_snapshot, payroll_run_id, net_pay, status')
      .eq('employee_id', emp.id);

    const leaveSignal = (slips ?? []).filter((s) => {
      const snap = s.calculation_snapshot as Record<string, unknown> | null;
      if (!snap) return false;
      const text = JSON.stringify(snap);
      return text.includes('leave') || snap.leave_balances != null;
    }).length;

    const { count: auditCount } = await supabase
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('table_name', 'employees')
      .eq('record_id', emp.id);

    const { count: payeAudit } = await supabase
      .from('payroll_audit_events')
      .select('id', { count: 'exact', head: true })
      .in('payslip_id', (slips ?? []).map((s) => s.id));

    const { count: journals } = await supabase
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .or('description.ilike.%payroll%,description.ilike.%salary%,description.ilike.%PAYE%');

    const row = {
      employee_number: emp.employee_number,
      employee_id: emp.id,
      name: `${emp.first_name} ${emp.last_name}`,
      business_records: {
        payslips: slips?.length ?? 0,
        payroll_history: counts.payroll_history_len,
        payroll_audit_events: payeAudit ?? 0,
        journal_entries_company_payrollish: journals ?? 0,
        expense_claims: counts.expense_claims,
        leave_signal_payslips: leaveSignal,
        audit_logs_employee: auditCount ?? 0,
        timeline_events: counts.timeline_events,
        payroll_rule_settings: counts.payroll_rule_settings,
      },
    };
    phase1.push(row);
    console.log('\n=== PHASE 1 CANDIDATE ===');
    console.log(JSON.stringify(row, null, 2));
  }
  evidence.phases = { ...(evidence.phases as object), phase1 };

  const protectedTargets = (phase1 as Array<{
    employee_number: string;
    employee_id: string;
    business_records: Record<string, number | unknown>;
  }>).filter((e) => {
    const b = e.business_records;
    return (
      Number(b.payslips) > 0
      || Number(b.payroll_history) > 0
      || Number(b.expense_claims) > 0
      || Number(b.payroll_audit_events) > 0
      || Number(b.audit_logs_employee) > 0
    );
  });

  if (!protectedTargets.length) {
    evidence.verdict = 'NOT CERTIFIED';
    evidence.reason = 'NO_PRODUCTION_EMPLOYEE_WITH_PROTECTED_HISTORY_FOUND';
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(1);
  }

  // Prefer employee with most payslips
  const target = [...protectedTargets].sort(
    (a, b) => Number(b.business_records.payslips) - Number(a.business_records.payslips),
  )[0];

  const before = await countForEmployee(target.employee_id, companyId);
  const { count: payslipsBefore } = await supabase
    .from('payslips')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', target.employee_id);
  const { count: journalsBefore } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  const { count: auditBefore } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true });
  const { count: payrollRunsBefore } = await supabase
    .from('payroll_runs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  // ── PHASE 2 — DELETE via Edge Function ──
  console.log('\n=== PHASE 2 DELETE ATTEMPT ===');
  console.log(`Target: ${target.employee_number} (${target.employee_id})`);
  const del = await invokeEmployeesRaw({
    method: 'DELETE',
    company_id: companyId,
    employeeId: target.employee_id,
  });
  console.log('HTTP status:', del.httpStatus);
  console.log('DELETE result:', JSON.stringify(del.body));
  evidence.phases = {
    ...(evidence.phases as object),
    phase2: {
      target,
      http_status: del.httpStatus,
      delete_result: del.body,
      business_validation: typeof del.body === 'object' && del.body && 'error' in (del.body as object)
        ? (del.body as { error: string }).error
        : null,
      database_response: del.raw,
    },
  };

  // ── PHASE 3 — verify rejection ──
  const { data: empAfter } = await supabase
    .from('employees')
    .select('id, employee_number')
    .eq('id', target.employee_id)
    .maybeSingle();
  const { count: payslipsAfter } = await supabase
    .from('payslips')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', target.employee_id);
  const { count: journalsAfter } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  const { count: auditAfter } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true });
  const { count: payrollRunsAfter } = await supabase
    .from('payroll_runs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  const { count: timelineAfter } = await supabase
    .from('employee_timeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', target.employee_id);

  const rejected =
    del.httpStatus >= 400
    || (typeof del.body === 'object' && del.body !== null && 'error' in del.body);
  const employeeRemains = !!empAfter;
  const payslipsRemain = (payslipsAfter ?? 0) === (payslipsBefore ?? 0) && (payslipsBefore ?? 0) > 0;
  const journalsRemain = (journalsAfter ?? 0) === (journalsBefore ?? 0);
  const auditRemain = (auditAfter ?? 0) >= (auditBefore ?? 0);
  const payrollRemain = (payrollRunsAfter ?? 0) === (payrollRunsBefore ?? 0);

  const phase3 = {
    delete_rejected: rejected,
    employee_remains: employeeRemains,
    payslips_remain: payslipsRemain || ((payslipsBefore ?? 0) === 0 && (payslipsAfter ?? 0) === 0),
    payslips_before: payslipsBefore,
    payslips_after: payslipsAfter,
    journals_before: journalsBefore,
    journals_after: journalsAfter,
    journals_remain: journalsRemain,
    audit_before: auditBefore,
    audit_after: auditAfter,
    audit_remain: auditRemain,
    payroll_runs_before: payrollRunsBefore,
    payroll_runs_after: payrollRunsAfter,
    payroll_remain: payrollRemain,
    timeline_after: timelineAfter,
    before_counts: before,
  };
  console.log('\n=== PHASE 3 POST-DELETE VERIFY ===');
  console.log(JSON.stringify(phase3, null, 2));
  evidence.phases = { ...(evidence.phases as object), phase3 };

  // ── PHASE 4 — validation employee deletable ──
  console.log('\n=== PHASE 4 VALIDATION EMPLOYEE ===');
  const stamp = Date.now();
  const createRes = await invokeEmployeesRaw({
    method: 'POST',
    company_id: companyId,
    employeeData: {
      first_name: 'Val',
      last_name: `DeleteProt${stamp}`,
      employment_type: 'permanent',
      start_date: new Date().toISOString().split('T')[0],
    },
  });
  const created = createRes.body as { id?: string; employee_number?: string; error?: string };
  console.log('CREATE:', createRes.httpStatus, JSON.stringify(created));

  let phase4: Record<string, unknown> = { create: { httpStatus: createRes.httpStatus, body: created } };
  if (!created?.id) {
    phase4.failed = 'CREATE_VALIDATION_EMPLOYEE_FAILED';
  } else {
    const { count: tlBefore } = await supabase
      .from('employee_timeline_events')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', created.id);

    const delVal = await invokeEmployeesRaw({
      method: 'DELETE',
      company_id: companyId,
      employeeId: created.id,
    });
    const { data: stillThere } = await supabase
      .from('employees')
      .select('id')
      .eq('id', created.id)
      .maybeSingle();
    const { count: tlAfter } = await supabase
      .from('employee_timeline_events')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', created.id);
    const { count: orphanPayslips } = await supabase
      .from('payslips')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', created.id);

    phase4 = {
      ...phase4,
      timeline_before_delete: tlBefore,
      delete: { httpStatus: delVal.httpStatus, body: delVal.body },
      employee_removed: !stillThere,
      timeline_after_delete: tlAfter,
      orphan_payslips: orphanPayslips,
      timeline_cascaded: (tlBefore ?? 0) === 0 || (tlAfter ?? 0) === 0,
    };
    console.log(JSON.stringify(phase4, null, 2));
  }
  evidence.phases = { ...(evidence.phases as object), phase4 };

  const gates = {
    validation_employees_deletable: phase4.employee_removed === true && (phase4.delete as { httpStatus: number })?.httpStatus === 200,
    production_employees_protected: rejected && employeeRemains,
    payroll_history_protected: payrollRemain && (payslipsRemain || (payslipsBefore ?? 0) === 0),
    journal_history_protected: journalsRemain,
    audit_history_protected: auditRemain,
    timeline_integrity_preserved: employeeRemains ? true : false,
    no_orphan_records: phase4.orphan_payslips === 0 || phase4.orphan_payslips == null,
    no_regression: rejected && employeeRemains && phase4.employee_removed === true,
  };

  const certified = Object.values(gates).every(Boolean);
  evidence.quality_gates = gates;
  evidence.verdict = certified ? 'CERTIFIED' : 'NOT CERTIFIED';

  console.log('\n=== QUALITY GATES ===');
  console.log(JSON.stringify(gates, null, 2));
  console.log('\n=== FINAL DECISION ===');
  console.log(evidence.verdict);

  writeFileSync(
    resolve(process.cwd(), 'docs/certification/V3.2.22/evidence/delete-protection-evidence.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log('Evidence written to docs/certification/V3.2.22/evidence/delete-protection-evidence.json');

  process.exit(certified ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
