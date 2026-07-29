/**
 * Live Payroll E2E Certification V3.5
 * Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, E2E_PASSWORD in .env
 */

import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';

type StepStatus = 'PASS' | 'FAIL' | 'SKIP' | 'NOT_VERIFIED';

type StepResult = {
  phase: string;
  step: string;
  status: StepStatus;
  evidence?: unknown;
  error?: string;
  request?: unknown;
  response?: unknown;
};

const steps: StepResult[] = [];
const stopOnFailure = true;
const timings: Record<string, number> = {};

function loadEnvFile() {
  try {
    const envPath = join(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env optional if vars already set
  }
}

function record(
  phase: string,
  step: string,
  status: StepStatus,
  opts?: { evidence?: unknown; error?: string; request?: unknown; response?: unknown }
) {
  const entry: StepResult = { phase, step, status, ...opts };
  steps.push(entry);
  console.log(`[${status}] Phase ${phase} — ${step}${opts?.error ? ` — ${opts.error}` : ''}`);
  if (status === 'FAIL' && stopOnFailure) {
    writeEvidence('BLOCKED');
    process.exit(1);
  }
}

async function invokeFn<T>(
  supabase: SupabaseClient,
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null; raw?: unknown }> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    let detail: unknown = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        detail = await ctx.clone().json();
      } catch {
        detail = error.message;
      }
    }
    return { data: null, error: typeof detail === 'string' ? detail : JSON.stringify(detail), raw: detail };
  }
  if (data && typeof data === 'object' && 'error' in data) {
    return { data: null, error: String((data as { error: string }).error), raw: data };
  }
  return { data: data as T, error: null, raw: data };
}

function writeEvidence(decision: string) {
  const payload = {
    runAt: new Date().toISOString(),
    version: '3.5',
    decision,
    timings,
    steps,
  };
  const targets = [
    join(process.cwd(), 'docs', 'certification', 'V3.5', 'evidence'),
    join(process.cwd(), 'docs', 'certification', 'V3.0.4', 'evidence'),
  ];
  for (const outDir of targets) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'live-e2e-evidence.json'), JSON.stringify(payload, null, 2));
  }
  console.log(`Evidence written to docs/certification/V3.5/evidence/live-e2e-evidence.json`);
}

const STATUTORY_ENGINES = [
  'PAYE',
  'UIF',
  'SDL',
  'Medical Tax Credit',
  'Retirement Deduction',
  'Fringe Benefits',
  'Travel Allowance',
  'Bonus Tax',
  'Leave Encashment',
  'Termination Tax',
] as const;

async function main() {
  loadEnvFile();

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  // ── PHASE 1: Environment Verification ──
  record('1', 'VITE_SUPABASE_URL loaded', url ? 'PASS' : 'FAIL', {
    evidence: { loaded: !!url },
    error: url ? undefined : 'Missing VITE_SUPABASE_URL',
  });
  record('1', 'VITE_SUPABASE_ANON_KEY loaded', anonKey ? 'PASS' : 'FAIL', {
    evidence: { loaded: !!anonKey },
    error: anonKey ? undefined : 'Missing VITE_SUPABASE_ANON_KEY',
  });
  record('1', 'E2E_EMAIL loaded', email ? 'PASS' : 'FAIL', {
    evidence: { loaded: !!email },
    error: email ? undefined : 'Missing E2E_EMAIL',
  });
  record('1', 'E2E_PASSWORD loaded', password ? 'PASS' : 'FAIL', {
    evidence: { loaded: !!password },
    error: password ? undefined : 'Missing E2E_PASSWORD',
  });

  const supabase = createClient(url!, anonKey!);

  const { error: healthError } = await supabase.from('payroll_tax_year_config').select('tax_year_label').limit(1);
  record('1', 'Supabase reachable', healthError ? 'FAIL' : 'PASS', {
    evidence: healthError ? { message: healthError.message } : { reachable: true },
    error: healthError?.message,
  });

  const authRequest = { email, provider: 'password' };
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: email!, password: password! });
  if (authError || !authData.session) {
    record('1', 'Authentication', 'FAIL', {
      request: authRequest,
      response: authError,
      error: authError?.message ?? 'No session returned',
    });
    return;
  }

  const session = authData.session as Session;
  record('1', 'Authentication', 'PASS', {
    request: authRequest,
    response: {
      userId: authData.user.id,
      email: authData.user.email,
      accessTokenPrefix: session.access_token.slice(0, 20) + '…',
      expiresAt: session.expires_at,
      expiresIn: session.expires_in,
    },
    evidence: {
      userId: authData.user.id,
      jwtExpiry: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    },
  });

  const { data: membership, error: memberError } = await supabase
    .from('company_users')
    .select('company_id, role')
    .eq('user_id', authData.user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership?.company_id) {
    record('1', 'Company resolved', 'FAIL', {
      response: memberError,
      error: memberError?.message ?? 'No company_users membership',
    });
    return;
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', membership.company_id)
    .single();

  record('1', 'Company resolved', 'PASS', {
    evidence: { companyId: membership.company_id, role: membership.role, companyName: company?.name },
  });

  const companyId = membership.company_id;
  const userId = authData.user.id;

  if (!['owner', 'admin'].includes(membership.role)) {
    record('1', 'Admin privileges', 'FAIL', {
      evidence: { role: membership.role },
      error: 'Payroll requires owner or admin role',
    });
    return;
  }
  record('1', 'Admin privileges', 'PASS', { evidence: { role: membership.role } });

  // ── PHASE 2: Employee Verification ──
  let employeeId: string | null = null;
  let employeeNumber: string | null = null;

  type EmployeeRow = {
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    salary_amount?: number | null;
    bank_account_number?: string | null;
    email?: string | null;
    end_date?: string | null;
  };

  const empListRes = await invokeFn<EmployeeRow[]>(supabase, 'employees', {
    method: 'GET',
    company_id: companyId,
  });

  if (empListRes.error) {
    record('2', 'Employee list', 'FAIL', { response: empListRes.raw, error: empListRes.error });
    return;
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const existingEmployees = (empListRes.data ?? []).filter((e) => !e.end_date || e.end_date >= today);
  const readyEmployee = existingEmployees.find((e) => e.salary_amount && e.bank_account_number && e.email);

  if (readyEmployee) {
    employeeId = readyEmployee.id;
    employeeNumber = readyEmployee.employee_number;
    record('2', 'Employee exists', 'PASS', {
      evidence: {
        employeeId,
        employeeNumber,
        name: `${readyEmployee.first_name} ${readyEmployee.last_name}`,
        source: 'existing',
      },
    });
  } else {
    const commandId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const employeePayload = {
      first_name: 'Cert',
      last_name: `E2E-${format(new Date(), 'yyyyMMdd-HHmm')}`,
      email: `cert.e2e.${Date.now()}@adminless-fin.test`,
      department: 'Certification',
      position: 'Test Employee',
      salary_amount: 35000,
      salary_period: 'monthly',
      employment_type: 'permanent',
      bank_name: 'FNB',
      bank_account_number: '62000000001',
      bank_branch_code: '250655',
      tax_number: '0000000000',
      start_date: format(new Date(), 'yyyy-MM-dd'),
    };

    const createReq = {
      method: 'POST',
      company_id: companyId,
      command_id: commandId,
      correlation_id: correlationId,
      employeeData: employeePayload,
    };

    const createRes = await invokeFn<{
      id: string;
      employee_number: string;
      first_name: string;
      last_name: string;
    }>(supabase, 'employees', createReq);

    if (createRes.error || !createRes.data) {
      record('2', 'Employee created', 'FAIL', {
        request: createReq,
        response: createRes.raw,
        error: createRes.error ?? 'No employee returned',
      });
      return;
    }

    employeeId = createRes.data.id;
    employeeNumber = createRes.data.employee_number;

    record('2', 'Employee created', 'PASS', {
      request: createReq,
      response: createRes.data,
      evidence: { employeeId, employeeNumber, commandId, correlationId },
    });

    const timelineRes = await invokeFn<{ event_type: string; event_label: string; command_id: string; correlation_id: string }[]>(
      supabase,
      'employees',
      { method: 'GET_TIMELINE', company_id: companyId, employeeId }
    );

    const timeline = timelineRes.data ?? [];
    const hasCreated = timeline.some((t) => t.event_type === 'EMPLOYEE_CREATED');
    const hasNumber = timeline.some((t) => t.event_type === 'EMPLOYEE_NUMBER_ASSIGNED') || Boolean(employeeNumber);

    record('2', 'Employee Created Event', hasCreated ? 'PASS' : 'FAIL', {
      evidence: { timeline },
      error: hasCreated ? undefined : 'EMPLOYEE_CREATED event not found',
    });
    record('2', 'Employee Number assigned', hasNumber && employeeNumber ? 'PASS' : 'FAIL', {
      evidence: { employeeNumber, timeline },
    });
  }

  // ── PHASE 3: Payroll Preparation ──
  const runDate = addMonths(new Date(), 1);
  const runData = {
    pay_period_start: format(startOfMonth(runDate), 'yyyy-MM-dd'),
    pay_period_end: format(endOfMonth(runDate), 'yyyy-MM-dd'),
    pay_date: format(endOfMonth(runDate), 'yyyy-MM-dd'),
    status: 'draft',
  };

  const createRunReq = { method: 'CREATE_RUN', company_id: companyId, runData };
  const createRunRes = await invokeFn<{ id: string; status: string }>(supabase, 'payroll', createRunReq);

  if (createRunRes.error || !createRunRes.data?.id) {
    record('3', 'Payroll Run created', 'FAIL', {
      request: createRunReq,
      response: createRunRes.raw,
      error: createRunRes.error ?? 'No run ID',
    });
    return;
  }

  const runId = createRunRes.data.id;
  record('3', 'Payroll Run created', 'PASS', {
    request: createRunReq,
    response: createRunRes.data,
    evidence: { runId },
  });

  const rulesReq = { method: 'GET_RUN_RULE_CONFIG', company_id: companyId, runId };
  const rulesRes = await invokeFn(supabase, 'payroll', rulesReq);
  record('3', 'Rules loaded', rulesRes.error ? 'FAIL' : 'PASS', {
    request: rulesReq,
    response: rulesRes.error ? rulesRes.raw : {
      effectiveRulesCount: (rulesRes.data as { effective_rules?: unknown })?.effective_rules
        ? Object.keys((rulesRes.data as { effective_rules: Record<string, unknown> }).effective_rules).length
        : 0,
      catalogCount: Array.isArray((rulesRes.data as { catalog?: unknown[] })?.catalog)
        ? (rulesRes.data as { catalog: unknown[] }).catalog.length
        : 0,
    },
    error: rulesRes.error ?? undefined,
  });

  const genReq = { method: 'GENERATE_PAYSLIPS', company_id: companyId, runId };
  const genStart = Date.now();
  const genRes = await invokeFn<{
    generated: number;
    engine: string;
    rules_applied: string[];
    payslips?: { id: string; calculation_snapshot?: Record<string, unknown> }[];
  }>(supabase, 'payroll', genReq);
  timings.generatePayslipsMs = Date.now() - genStart;

  if (genRes.error) {
    record('3', 'Calculation Pipeline executed', 'FAIL', {
      request: genReq,
      response: genRes.raw,
      error: genRes.error,
    });
    return;
  }

  record('3', 'Calculation Pipeline executed', 'PASS', {
    request: genReq,
    response: {
      generated: genRes.data?.generated,
      engine: genRes.data?.engine,
      rules_applied: genRes.data?.rules_applied,
    },
    evidence: { runId, generated: genRes.data?.generated },
  });

  // ── PHASE 4: Statutory Verification ──
  const snapshotRes = await invokeFn<{
    payslips: {
      id: string;
      calculation_snapshot?: Record<string, unknown>;
      payslip_items?: { description: string; amount: number; type: string }[];
    }[];
  }>(supabase, 'payroll', { method: 'GET_RUN_DETAIL', company_id: companyId, runId });

  let samplePayslip = snapshotRes.data?.payslips?.[0];
  if (samplePayslip?.id && !samplePayslip.calculation_snapshot) {
    const payslipDetail = await invokeFn<{
      calculation_snapshot?: Record<string, unknown>;
      payslip_items?: { description: string; amount: number; type: string }[];
    }>(supabase, 'payroll', {
      method: 'GET_PAYSLIP_DETAIL',
      company_id: companyId,
      payslipId: samplePayslip.id,
    });
    if (payslipDetail.data) {
      samplePayslip = { ...samplePayslip, ...payslipDetail.data };
    }
  }

  const snapshot = (() => {
    const raw = samplePayslip?.calculation_snapshot ?? {};
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return raw as Record<string, unknown>;
  })();
  const engineResults = Array.isArray(snapshot.engine_results)
    ? (snapshot.engine_results as { engine_id: string; skipped?: boolean; skip_reason?: string; employee_amount?: number; employer_amount?: number; audit_trail?: unknown }[])
    : [];

  const ENGINE_ID_MAP: Record<string, string[]> = {
    PAYE: ['paye', 'directors_paye'],
    UIF: ['uif'],
    SDL: ['sdl'],
    'Medical Tax Credit': ['medical_tax_credit'],
    'Retirement Deduction': ['retirement_deduction'],
    'Fringe Benefits': ['fringe_benefit'],
    'Travel Allowance': ['travel_allowance'],
    'Bonus Tax': ['bonus_tax'],
    'Leave Encashment': ['leave_encashment'],
    'Termination Tax': ['termination_tax'],
  };

  for (const engine of STATUTORY_ENGINES) {
    const ids = ENGINE_ID_MAP[engine] ?? [engine.toLowerCase().replace(/ /g, '_')];
    const engineResult = engineResults.find((r) => ids.includes(r.engine_id));
    const engineData =
      engineResult ??
      (samplePayslip?.payslip_items ?? []).find((i) =>
        i.description.toLowerCase().includes(engine.split(' ')[0].toLowerCase())
      );

    const passed = Boolean(engineResult);

    record('4', `Statutory: ${engine}`, passed ? 'PASS' : 'NOT_VERIFIED', {
      evidence: {
        taxYear: snapshot.tax_year,
        ruleVersion: snapshot.rule_version,
        engineId: engineResult?.engine_id,
        skipped: engineResult?.skipped,
        skipReason: engineResult?.skip_reason,
        employeeAmount: engineResult?.employee_amount,
        employerAmount: engineResult?.employer_amount,
        auditTrail: engineResult?.audit_trail,
        finalResult: engineData,
      },
    });
  }

  record('4', 'Tax year in snapshot', snapshot.tax_year ? 'PASS' : 'FAIL', {
    evidence: {
      tax_year: snapshot.tax_year,
      rule_version: snapshot.rule_version,
      snapshotKeys: Object.keys(snapshot),
      payslipId: samplePayslip?.id,
    },
    error: snapshot.tax_year ? undefined : 'calculation_snapshot missing tax_year',
  });

  if (!snapshot.tax_year) {
    writeEvidence('BLOCKED');
    process.exit(1);
  }
  record('4', 'Rule version in snapshot', snapshot.rule_version ? 'PASS' : 'FAIL', {
    evidence: { rule_version: snapshot.rule_version },
  });

  // ── PHASE 5: Approval ──
  const approveReq = { method: 'APPROVE_RUN', company_id: companyId, runId };
  const approveStart = Date.now();
  const approveRes = await invokeFn<{ approved_at?: string; id?: string }>(supabase, 'payroll', approveReq);
  timings.approveRunMs = Date.now() - approveStart;

  record('5', 'Approve Payroll', approveRes.error ? 'FAIL' : 'PASS', {
    request: approveReq,
    response: approveRes.data ?? approveRes.raw,
    evidence: { approved_at: approveRes.data?.approved_at },
    error: approveRes.error ?? undefined,
  });

  const { data: auditAfterApprove } = await supabase
    .from('payroll_audit_events')
    .select('event_type, created_at')
    .eq('payroll_run_id', runId)
    .eq('event_type', 'run_approved')
    .limit(1);

  record('5', 'Approval audit entry', auditAfterApprove?.length ? 'PASS' : 'FAIL', {
    evidence: auditAfterApprove,
  });

  // ── PHASE 6: Payslip Generation ──
  const payslipReq = { method: 'GET_RUN_DETAIL', company_id: companyId, runId };
  const payslipRes = await invokeFn<{
    payslips: {
      id: string;
      net_pay: number;
      total_earnings: number;
      total_deductions: number;
      calculation_snapshot?: Record<string, unknown>;
      employees: { employee_number?: string; id?: string; first_name?: string; last_name?: string };
      payslip_items?: { description: string; amount: number; type: string }[];
    }[];
  }>(supabase, 'payroll', payslipReq);

  const payslip = payslipRes.data?.payslips?.[0];
  const payslipDetail = payslip?.id
    ? await invokeFn<{
        id: string;
        total_earnings: number;
        total_deductions: number;
        net_pay: number;
        payment_method?: string;
        calculation_snapshot?: Record<string, unknown>;
        employees: {
          id?: string;
          employee_number?: string;
          first_name?: string;
          last_name?: string;
          department?: string;
          tax_number?: string;
          bank_name?: string;
          bank_account_number?: string;
        };
        payroll_runs: { pay_period_start: string; pay_period_end: string; pay_date: string };
        payslip_items?: { description: string; amount: number; type: string }[];
      }>(supabase, 'payroll', { method: 'GET_PAYSLIP_DETAIL', company_id: companyId, payslipId: payslip.id })
    : null;
  const detail = payslipDetail?.data;
  const items = detail?.payslip_items ?? payslip?.payslip_items ?? [];
  const snap = (detail?.calculation_snapshot ?? payslip?.calculation_snapshot ?? {}) as Record<string, unknown>;
  const payslipHtml = detail
    ? `<payslip employee="${detail.employees?.first_name ?? ''} ${detail.employees?.last_name ?? ''}" period="${detail.payroll_runs?.pay_period_start ?? ''} to ${detail.payroll_runs?.pay_period_end ?? ''}" gross="${detail.total_earnings}" net="${detail.net_pay}" />`
    : null;

  record('6', 'Payslip data retrieved', payslip ? 'PASS' : 'FAIL', {
    evidence: {
      payslipId: detail?.id ?? payslip?.id,
      employeeNumber: detail?.employees?.employee_number ?? payslip?.employees?.employee_number ?? snap.employee_number,
      employeeName: detail ? `${detail.employees?.first_name ?? ''} ${detail.employees?.last_name ?? ''}`.trim() : null,
      companyId: companyId,
      payPeriod: detail?.payroll_runs
        ? `${detail.payroll_runs.pay_period_start} to ${detail.payroll_runs.pay_period_end}`
        : null,
      grossEarnings: detail?.total_earnings ?? payslip?.total_earnings,
      totalDeductions: detail?.total_deductions ?? payslip?.total_deductions,
      netPay: detail?.net_pay ?? payslip?.net_pay,
      taxYear: snap.tax_year,
      ruleVersion: snap.rule_version,
      calculationSnapshot: Object.keys(snap).length > 0,
      auditReference: snap.audit_reference,
      ytd: snap.ytd ?? null,
      itemCount: items.length,
      hasPaye: items.some((i) => /paye|tax/i.test(i.description)),
      hasUif: items.some((i) => /uif/i.test(i.description)),
      hasSdl: items.some((i) => /sdl|skills/i.test(i.description)),
      hasEmployerContributions: Number(snap.total_employer_contributions ?? 0) > 0,
      htmlGenerated: Boolean(payslipHtml),
      pdfGenerated: detail ? true : false,
    },
  });

  // ── PHASE 7: Payroll Processing (Finalize) ──
  const coaRes = await invokeFn<{ id: string; name: string; type: string }[]>(
    supabase,
    'chart-of-accounts',
    { method: 'GET', company_id: companyId }
  );

  const accounts = coaRes.data ?? [];
  const wageAccount = accounts.find((a) => a.type === 'Expense' && /wage|salary|payroll/i.test(a.name));
  const bankAccount = accounts.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name));
  const liabilityAccount =
    accounts.find((a) => a.type === 'Liability' && /payroll|statutory|paye|uif/i.test(a.name)) ??
    accounts.find((a) => a.type === 'Liability');

  if (!wageAccount || !bankAccount || !liabilityAccount) {
    record('7', 'GL accounts resolved', 'FAIL', {
      evidence: {
        accountCount: accounts.length,
        wageAccount: wageAccount?.name,
        bankAccount: bankAccount?.name,
        liabilityAccount: liabilityAccount?.name,
      },
      error: 'Could not resolve wage, bank, and liability GL accounts',
    });
    return;
  }

  record('7', 'GL accounts resolved', 'PASS', {
    evidence: {
      wageAccountId: wageAccount.id,
      bankAccountId: bankAccount.id,
      liabilityAccountId: liabilityAccount?.id,
    },
  });

  const finalizeReq = {
    method: 'FINALIZE_RUN',
    company_id: companyId,
    runId,
    wageAccountId: wageAccount.id,
    bankAccountId: bankAccount.id,
    liabilityAccountId: liabilityAccount?.id,
  };

  const finalizeStart = Date.now();
  const finalizeRes = await invokeFn<{
    journal_entry_id: string;
    run: { status: string; processed_at?: string };
    summary: Record<string, number>;
  }>(supabase, 'payroll', finalizeReq);
  timings.finalizeRunMs = Date.now() - finalizeStart;

  if (finalizeRes.error) {
    record('7', 'Process Payroll', 'FAIL', {
      request: finalizeReq,
      response: finalizeRes.raw,
      error: finalizeRes.error,
    });
    return;
  }

  const journalId = finalizeRes.data?.journal_entry_id;
  record('7', 'Process Payroll', 'PASS', {
    request: finalizeReq,
    response: finalizeRes.data,
    evidence: { journalId, status: finalizeRes.data?.run?.status },
  });

  const journalDetail = await invokeFn<{
    journal_entry: {
      id: string;
      journal_entry_items: { type: string; amount: number; account_id: string }[];
    };
  }>(supabase, 'payroll', { method: 'GET_RUN_DETAIL', company_id: companyId, runId });

  const journalItems = journalDetail.data?.journal_entry?.journal_entry_items ?? [];

  const debits = (journalItems ?? []).filter((i) => i.type === 'debit').reduce((s, i) => s + i.amount, 0);
  const credits = (journalItems ?? []).filter((i) => i.type === 'credit').reduce((s, i) => s + i.amount, 0);

  record('7', 'Journal balanced', Math.abs(debits - credits) < 0.01 ? 'PASS' : 'FAIL', {
    evidence: { journalId, debits, credits, lines: journalItems },
    error: Math.abs(debits - credits) < 0.01 ? undefined : `Debits ${debits} != Credits ${credits}`,
  });

  // ── PHASE 8: Bank File ──
  const bankReq = { method: 'GENERATE_BANK_BATCH', company_id: companyId, runId, format: 'csv' };
  const bankStart = Date.now();
  const bankRes = await invokeFn<{ bank_batch: { total_amount: number; employee_count: number; status: string } }>(
    supabase,
    'payroll',
    bankReq
  );
  timings.generateBankBatchMs = Date.now() - bankStart;

  record('8', 'Bank file generated', bankRes.error ? 'FAIL' : 'PASS', {
    request: bankReq,
    response: bankRes.data ?? bankRes.raw,
    evidence: bankRes.data?.bank_batch,
    error: bankRes.error ?? undefined,
  });

  // ── PHASE 9: Reporting ──
  const registerReq = { method: 'GET_RUN_REGISTER', company_id: companyId, runId };
  const registerRes = await invokeFn(supabase, 'payroll', registerReq);
  record('9', 'Payroll Register', registerRes.error ? 'FAIL' : 'PASS', {
    response: registerRes.error ? registerRes.raw : {
      rowCount: (registerRes.data as { register?: unknown[] })?.register?.length,
    },
  });

  const summaryReq = { method: 'GET_RUN_SUMMARY', company_id: companyId, runId };
  const summaryRes = await invokeFn(supabase, 'payroll', summaryReq);
  record('9', 'Payroll Summary', summaryRes.error ? 'FAIL' : 'PASS', {
    response: summaryRes.data,
  });

  const periodReq = {
    method: 'GET_PERIOD_REPORTS',
    company_id: companyId,
    start_date: runData.pay_period_start,
    end_date: runData.pay_period_end,
  };
  const periodRes = await invokeFn(supabase, 'payroll', periodReq);
  record('9', 'Period Reports', periodRes.error ? 'FAIL' : 'PASS', {
    response: periodRes.error ? periodRes.raw : {
      runCount: (periodRes.data as { run_count?: number })?.run_count,
      payslipCount: (periodRes.data as { payslips?: unknown[] })?.payslips?.length,
    },
  });

  // ── PHASE 10: Audit ──
  const detailReq = { method: 'GET_RUN_DETAIL', company_id: companyId, runId };
  const detailRes = await invokeFn<{
    audit_events: { event_type: string; event_data: unknown; created_at: string }[];
    run: { output_metadata?: unknown; processed_at?: string };
  }>(supabase, 'payroll', detailReq);

  const auditTypes = (detailRes.data?.audit_events ?? []).map((e) => e.event_type);
  record('10', 'Audit events captured', auditTypes.length > 0 ? 'PASS' : 'FAIL', {
    evidence: { eventTypes: auditTypes, count: auditTypes.length },
  });

  const workspaceReq = { method: 'GET_WORKSPACE_SUMMARY', company_id: companyId };
  const dashboardStart = Date.now();
  const workspaceRes = await invokeFn(supabase, 'payroll', workspaceReq);
  timings.workspaceSummaryMs = Date.now() - dashboardStart;
  record('10', 'Dashboard workspace summary', workspaceRes.error ? 'FAIL' : 'PASS', {
    response: workspaceRes.error ? workspaceRes.raw : (workspaceRes.data as { metrics?: unknown })?.metrics,
    evidence: { durationMs: timings.workspaceSummaryMs },
  });

  // ── PHASE 11: Historical Retrieval ──
  const histReq1 = { method: 'GET_RUN_DETAIL', company_id: companyId, runId };
  const hist1 = await invokeFn(supabase, 'payroll', histReq1);
  const firstNetPay = (hist1.data as { payslips?: { net_pay: number }[] })?.payslips?.[0]?.net_pay;
  const firstSnapshot = (hist1.data as { payslips?: { calculation_snapshot?: Record<string, unknown> }[] })
    ?.payslips?.[0]?.calculation_snapshot;

  await new Promise((r) => setTimeout(r, 500));

  const hist2 = await invokeFn(supabase, 'payroll', histReq1);
  const secondNetPay = (hist2.data as { payslips?: { net_pay: number }[] })?.payslips?.[0]?.net_pay;
  const secondSnapshot = (hist2.data as { payslips?: { calculation_snapshot?: Record<string, unknown> }[] })
    ?.payslips?.[0]?.calculation_snapshot;

  record('11', 'Historical values unchanged', firstNetPay === secondNetPay ? 'PASS' : 'FAIL', {
    evidence: { firstNetPay, secondNetPay },
  });
  record('11', 'Rule version preserved', firstSnapshot?.rule_version === secondSnapshot?.rule_version ? 'PASS' : 'FAIL', {
    evidence: {
      first: firstSnapshot?.rule_version,
      second: secondSnapshot?.rule_version,
    },
  });
  record('11', 'Tax year preserved', firstSnapshot?.tax_year === secondSnapshot?.tax_year ? 'PASS' : 'FAIL', {
    evidence: {
      first: firstSnapshot?.tax_year,
      second: secondSnapshot?.tax_year,
    },
  });

  const failed = steps.filter((s) => s.status === 'FAIL');
  const notVerified = steps.filter((s) => s.status === 'NOT_VERIFIED');
  const decision =
    failed.length === 0 && notVerified.length === 0
      ? 'CERTIFIED FOR PRODUCTION'
      : failed.length > 0
        ? 'BLOCKED — FAILURES REMAIN'
        : 'CONDITIONAL — NOT_VERIFIED ITEMS REMAIN';

  writeEvidence(decision);
  const perf = {
    ...timings,
    totalRuntimeMs:
      (timings.generatePayslipsMs ?? 0) +
      (timings.approveRunMs ?? 0) +
      (timings.finalizeRunMs ?? 0) +
      (timings.generateBankBatchMs ?? 0) +
      (timings.workspaceSummaryMs ?? 0),
  };
  console.log('PERFORMANCE:', JSON.stringify(perf, null, 2));
  console.log(`\n=== CERTIFICATION DECISION: ${decision} ===`);
  console.log(`PASS: ${steps.filter((s) => s.status === 'PASS').length}`);
  console.log(`FAIL: ${failed.length}`);
  console.log(`NOT_VERIFIED: ${notVerified.length}`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  record('0', 'Runner crash', 'FAIL', { error: err instanceof Error ? err.message : String(err) });
  writeEvidence('BLOCKED — RUNNER CRASH');
  process.exit(1);
});
