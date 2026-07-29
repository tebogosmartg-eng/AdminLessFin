// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  generatePayslipsWithRulesEngine,
  loadPayrollRulesContext,
  fetchPayrollRun,
} from '../_shared/generatePayslips.ts'
import { buildEffectiveCompanyRules } from '../_shared/payrollRulesEngine/index.ts'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

const EMPLOYEE_EMBED_BASIC = 'id, employee_number, first_name, last_name, department, branch, position, email';
const EMPLOYEE_EMBED_RUN_DETAIL = 'id, employee_number, first_name, last_name, department, branch, position, email, bank_name, bank_account_number, bank_branch_code';
const EMPLOYEE_EMBED_PAYSLIP = 'id, employee_number, first_name, last_name, email, position, department, branch, employment_status, tax_number, bank_name, bank_account_number, bank_branch_code, id_number';
const EMPLOYEE_EMBED_BANK = 'id, employee_number, first_name, last_name, department, bank_name, bank_account_number, bank_branch_code';

function resolveEmployeeNumber(payslip, employee) {
  const empNum = employee?.employee_number;
  if (empNum && typeof empNum === 'string' && empNum.trim()) {
    return empNum.trim();
  }
  const snap = payslip?.calculation_snapshot;
  if (snap && typeof snap === 'object' && snap.employee_number) {
    return String(snap.employee_number);
  }
  return employee?.id?.slice(0, 8) ?? '—';
}

// Canonical payroll_run_status lifecycle (DB enum is source of truth):
//   draft → processing → finalized → paid
// A run is "complete/immutable" once it reaches finalized (and later paid).
const FINALIZED_RUN_STATUSES = ['finalized', 'paid'];
const isFinalizedRun = (status) => FINALIZED_RUN_STATUSES.includes(status);

class PayrollDomainError extends Error {
  stage: string;
  code: string;
  recovery: string;
  status: number;

  constructor({ stage, code, message, recovery, status = 400 }) {
    super(message);
    this.name = 'PayrollDomainError';
    this.stage = stage;
    this.code = code;
    this.recovery = recovery;
    this.status = status;
  }
}

function payrollErrorResponse(error, ctx) {
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'x-correlation-id': ctx?.correlationId ?? '',
    'x-platform-version': '4.2.1',
    'x-function-name': 'payroll',
  };
  if (error instanceof PayrollDomainError) {
    return new Response(JSON.stringify({
      error: error.message,
      stage: error.stage,
      code: error.code,
      recovery: error.recovery,
      correlationId: ctx?.correlationId,
    }), {
      headers,
      status: error.status,
    });
  }
  const message = error?.message ?? 'Unexpected payroll error';
  return new Response(JSON.stringify({
    error: message,
    stage: 'unknown',
    code: 'INTERNAL_ERROR',
    recovery: 'Retry the operation. Contact support if the error persists.',
    correlationId: ctx?.correlationId,
  }), {
    headers,
    status: 500,
  });
}

function payrollJeDescription(run) {
  return `Payroll for period ${run.pay_period_start} to ${run.pay_period_end}`;
}

function mapPayrollRpcError(error) {
  const message = error?.message ?? 'Payroll posting failed.';
  if (/already been finalized/i.test(message)) {
    return new PayrollDomainError({
      stage: 'state_transition',
      code: 'ALREADY_PROCESSED',
      message: 'This payroll run has already been finalized.',
      recovery: 'Refresh the page to view posted outputs.',
      status: 409,
    });
  }
  if (/must be approved/i.test(message)) {
    return new PayrollDomainError({
      stage: 'validation',
      code: 'APPROVAL_REQUIRED',
      message: 'Approve the payroll run before posting to the General Ledger.',
      recovery: 'Complete approval, then process payroll.',
    });
  }
  if (/Generate payslips/i.test(message) || /NO_PAYSLIPS/i.test(message)) {
    return new PayrollDomainError({
      stage: 'validation',
      code: 'NO_PAYSLIPS',
      message: 'Generate payslips before finalizing the payroll run.',
      recovery: 'Run payslip generation, then process payroll.',
    });
  }
  if (/liability control account|MISSING_LIABILITY|deductions/i.test(message)) {
    return new PayrollDomainError({
      stage: 'validation',
      code: 'MISSING_LIABILITY_ACCOUNT',
      message: 'Select a payroll liability account for deductions.',
      recovery: 'Choose a liability account or configure payroll control accounts.',
    });
  }
  if (/closed|period/i.test(message)) {
    return new PayrollDomainError({
      stage: 'journal_posting',
      code: 'PERIOD_CLOSED',
      message,
      recovery: 'Post into an open accounting period or reopen the period.',
    });
  }
  return new PayrollDomainError({
    stage: 'journal_posting',
    code: 'POSTING_ENGINE_FAILED',
    message,
    recovery: 'Verify GL configuration and Posting Engine status, then retry.',
  });
}

async function logPayrollAudit(supabaseAdmin, {
  company_id, payroll_run_id, payslip_id, event_type, event_data, created_by,
}) {
  try {
    await supabaseAdmin.from('payroll_audit_events').insert({
      company_id,
      payroll_run_id,
      payslip_id: payslip_id ?? null,
      event_type,
      event_data: event_data ?? {},
      created_by,
    });
  } catch (_) {
    console.log(JSON.stringify({ audit_fallback: event_type, payroll_run_id, event_data }));
  }
}

function sumByKeyword(items, keywords) {
  return items
    .filter(i => keywords.some(k => i.description.toLowerCase().includes(k)))
    .reduce((s, i) => s + i.amount, 0);
}

function sumSnapshotEmployerContributions(payslips) {
  return (payslips ?? []).reduce((sum, p) => {
    const snapshot = p?.calculation_snapshot;
    if (!snapshot || typeof snapshot !== 'object') return sum;
    const amount = Number(snapshot.total_employer_contributions ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function resolvePayslipEmployerContributions(payslip) {
  const snapshot = payslip?.calculation_snapshot;
  const snapshotTotal = snapshot && typeof snapshot === 'object'
    ? Number(snapshot.total_employer_contributions ?? 0)
    : 0;
  const safeSnapshotTotal = Number.isFinite(snapshotTotal) ? snapshotTotal : 0;
  return safeSnapshotTotal;
}

function buildRunSummary(payslips, allItems, run, previousNetPay = null) {
  const totalGross = payslips.reduce((s, p) => s + p.total_earnings, 0);
  const totalNet = payslips.reduce((s, p) => s + p.net_pay, 0);
  const totalDeductions = payslips.reduce((s, p) => s + p.total_deductions, 0);
  const totalPaye = sumByKeyword(allItems, ['paye', 'tax']);
  const totalUif = sumByKeyword(allItems, ['uif']);
  const totalSdl = sumByKeyword(allItems, ['sdl', 'skills development']);
  const totalPension = sumByKeyword(allItems, ['pension', 'provident']);
  const snapshotEmployerContribs = sumSnapshotEmployerContributions(payslips);
  const totalEmployerContribs = snapshotEmployerContribs;

  return {
    employees_paid: payslips.length,
    total_gross: totalGross,
    total_net: totalNet,
    total_paye: totalPaye,
    total_uif: totalUif,
    total_sdl: totalSdl,
    total_pension: totalPension,
    employer_contributions: totalEmployerContribs,
    payroll_cost: totalGross + totalEmployerContribs,
    variance_previous: previousNetPay != null ? totalNet - previousNetPay : null,
    variance_budget: null,
    pay_period: `${run.pay_period_start} to ${run.pay_period_end}`,
    total_deductions: totalDeductions,
  };
}

serve(withEnterprisePlatform('payroll', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new PayrollDomainError({
        stage: 'auth',
        code: 'UNAUTHENTICATED',
        message: 'User not authenticated.',
        recovery: 'Sign in and retry.',
        status: 401,
      });
    }

    const body = await req.json();
    const { method, company_id } = body;

    if (!company_id) {
      throw new PayrollDomainError({
        stage: 'validation',
        code: 'MISSING_COMPANY_ID',
        message: 'Company ID is required.',
        recovery: 'Select a company and retry.',
      });
    }

    const { data: member, error: memberError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !member) {
      throw new PayrollDomainError({
        stage: 'auth',
        code: 'PERMISSION_DENIED',
        message: 'Permission denied.',
        recovery: 'Ensure you belong to this company.',
        status: 403,
      });
    }

    if (!['owner', 'admin'].includes(member.role)) {
      throw new PayrollDomainError({
        stage: 'auth',
        code: 'ADMIN_REQUIRED',
        message: 'Access Denied: Payroll requires Admin privileges.',
        recovery: 'Ask a company owner or admin to run payroll.',
        status: 403,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let data, error;

    switch (method) {
      case 'GET_RUNS':
        ({ data, error } = await supabaseAdmin
          .from('payroll_runs')
          .select('*')
          .eq('company_id', company_id)
          .order('pay_period_start', { ascending: false }));
        break;

      case 'GET_RUN_DETAIL': {
        const { data: runData, error: runError } = await supabaseAdmin
          .from('payroll_runs')
          .select('*')
          .eq('id', body.runId)
          .eq('company_id', company_id)
          .single();
        if (runError) throw runError;
        const { data: payslipsData, error: payslipsError } = await supabaseAdmin
          .from('payslips')
          .select(`*, employees(${EMPLOYEE_EMBED_RUN_DETAIL})`)
          .eq('payroll_run_id', body.runId)
          .eq('company_id', company_id);
        if (payslipsError) throw payslipsError;

        let journalEntry = null;
        if (runData.journal_entry_id) {
          const { data: je } = await supabaseAdmin
            .from('journal_entries')
            .select('id, entry_date, description, journal_entry_items(type, amount, chart_of_accounts(name))')
            .eq('id', runData.journal_entry_id)
            .single();
          journalEntry = je;
        }

        let auditEvents = [];
        const { data: auditData, error: auditError } = await supabaseAdmin
          .from('payroll_audit_events')
          .select('*')
          .eq('payroll_run_id', body.runId)
          .eq('company_id', company_id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!auditError) auditEvents = auditData ?? [];

        data = { run: runData, payslips: payslipsData, journal_entry: journalEntry, audit_events: auditEvents };
        break;
      }

      case 'CREATE_RUN':
        ({ data, error } = await supabaseAdmin.from('payroll_runs').insert({ ...body.runData, company_id }).select().single());
        if (!error && data) {
          await logPayrollAudit(supabaseAdmin, {
            company_id, payroll_run_id: data.id, event_type: 'run_created',
            event_data: { pay_period_start: data.pay_period_start, pay_period_end: data.pay_period_end },
            created_by: user.id,
          });
        }
        break;

      case 'GENERATE_PAYSLIPS': {
        const genRun = await fetchPayrollRun(supabaseAdmin, body.runId, company_id);
        if (isFinalizedRun(genRun.status)) throw new Error('Cannot regenerate payslips for a finalized payroll run.');

        const generationResult = await generatePayslipsWithRulesEngine(supabaseAdmin, {
          companyId: company_id,
          runId: body.runId,
          run: genRun,
          createdBy: user.id,
        });

        data = generationResult;
        error = null;

        await logPayrollAudit(supabaseAdmin, {
          company_id, payroll_run_id: body.runId, event_type: 'payslips_generated',
          event_data: {
            count: generationResult.generated,
            engine: generationResult.engine,
            rules_applied: generationResult.rules_applied,
          },
          created_by: user.id,
        });
        break;
      }

      case 'GET_RULE_CATALOG': {
        ({ data, error } = await supabaseAdmin
          .from('payroll_rule_catalog')
          .select('*')
          .order('calculation_order'));
        if (!error) data = { catalog: data ?? [] };
        break;
      }

      case 'GET_PAYROLL_SETTINGS': {
        const [catalogRes, settingsRes] = await Promise.all([
          supabaseAdmin.from('payroll_rule_catalog').select('id, name, category, enabled_by_default, company_configurable, employee_configurable, calculation_order, payslip_label, description').order('calculation_order'),
          supabaseAdmin.from('company_payroll_rule_settings').select('rule_id, enabled, config').eq('company_id', company_id),
        ]);

        if (catalogRes.error) throw catalogRes.error;
        if (settingsRes.error) throw settingsRes.error;

        const effective = buildEffectiveCompanyRules(
          catalogRes.data ?? [],
          (settingsRes.data ?? []).map((s) => ({ rule_id: s.rule_id, enabled: s.enabled, config: s.config ?? {} }))
        );
        data = {
          catalog: catalogRes.data ?? [],
          company_settings: settingsRes.data ?? [],
          effective_rules: effective,
        };
        error = null;
        break;
      }

      case 'UPDATE_PAYROLL_SETTINGS': {
        const { settings } = body;
        if (!Array.isArray(settings)) throw new Error('Settings array is required.');
        const upserts = settings.map((s) => ({
          company_id,
          rule_id: s.rule_id,
          enabled: s.enabled,
          config: s.config ?? {},
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }));
        const { data: updated, error: upsertError } = await supabaseAdmin
          .from('company_payroll_rule_settings')
          .upsert(upserts, { onConflict: 'company_id,rule_id' })
          .select();
        data = updated;
        error = upsertError;
        await logPayrollAudit(supabaseAdmin, {
          company_id, event_type: 'payroll_settings_updated',
          event_data: { rules_updated: settings.map((s) => s.rule_id) },
          created_by: user.id,
        });
        break;
      }

      case 'GET_RUN_RULE_CONFIG': {
        const configRun = await fetchPayrollRun(supabaseAdmin, body.runId, company_id);
        const rulesCtx = await loadPayrollRulesContext(supabaseAdmin, company_id, configRun);
        data = {
          run: configRun,
          company_defaults: rulesCtx.companyRules,
          effective_rules: rulesCtx.effectiveRunRules,
          catalog: rulesCtx.catalogRows,
        };
        error = null;
        break;
      }

      case 'UPDATE_RUN_RULE_CONFIG': {
        const { runId, rule_config } = body;
        const configRun = await fetchPayrollRun(supabaseAdmin, runId, company_id);
        if (isFinalizedRun(configRun.status)) throw new Error('Cannot modify rules for a finalized payroll run.');

        ({ data, error } = await supabaseAdmin
          .from('payroll_runs')
          .update({ rule_config: rule_config ?? {} })
          .eq('id', runId)
          .eq('company_id', company_id)
          .select()
          .single());

        if (!error) {
          await logPayrollAudit(supabaseAdmin, {
            company_id, payroll_run_id: runId, event_type: 'run_rule_config_updated',
            event_data: { rule_config },
            created_by: user.id,
          });
        }
        break;
      }

      case 'APPROVE_RUN': {
        const { data: runToApprove, error: approveError } = await supabaseAdmin
          .from('payroll_runs')
          .select('*')
          .eq('id', body.runId)
          .eq('company_id', company_id)
          .single();
        if (approveError) throw approveError;
        if (isFinalizedRun(runToApprove.status)) throw new Error('Payroll run is already finalized.');
        const { count: payslipCount } = await supabaseAdmin
          .from('payslips')
          .select('id', { count: 'exact', head: true })
          .eq('payroll_run_id', body.runId);
        if (!payslipCount) throw new Error('Generate payslips before approving.');

        const approvedAt = new Date().toISOString();

        // Persist via approved_at columns (requires payroll_output_engine migration).
        // Approval is tracked as a timestamp, not a status value: the payroll_run_status
        // enum lifecycle is draft → processing → finalized → paid (no 'approved' state).
        ({ data, error } = await supabaseAdmin
          .from('payroll_runs')
          .update({ approved_by: user.id, approved_at: approvedAt })
          .eq('id', body.runId)
          .eq('company_id', company_id)
          .select()
          .single());

        if (error) throw error;

        await logPayrollAudit(supabaseAdmin, {
          company_id, payroll_run_id: body.runId, event_type: 'run_approved',
          event_data: { employee_count: payslipCount },
          created_by: user.id,
        });
        break;
      }

      case 'GET_PAYSLIP_DETAIL':
        ({ data, error } = await supabaseAdmin
          .from('payslips')
          .select(`*, employees(${EMPLOYEE_EMBED_PAYSLIP}), payroll_runs(*), payslip_items(*)`)
          .eq('id', body.payslipId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'GET_EMPLOYEE_PAYROLL_HISTORY': {
        const { data: historyPayslips, error: historyError } = await supabaseAdmin
          .from('payslips')
          .select(`
            id, total_earnings, total_deductions, net_pay, calculation_snapshot, created_at,
            employees(${EMPLOYEE_EMBED_BASIC}),
            payroll_runs(id, pay_period_start, pay_period_end, pay_date, status)
          `)
          .eq('employee_id', body.employeeId)
          .eq('company_id', company_id)
          .order('created_at', { ascending: false });
        if (historyError) throw historyError;
        data = historyPayslips ?? [];
        break;
      }

      case 'GET_RUN_REGISTER': {
        const { data: regRun, error: regRunError } = await supabaseAdmin
          .from('payroll_runs')
          .select('*')
          .eq('id', body.runId)
          .eq('company_id', company_id)
          .single();
        if (regRunError) throw regRunError;

        const { data: regPayslips, error: regPayslipsError } = await supabaseAdmin
          .from('payslips')
          .select(`*, employees(${EMPLOYEE_EMBED_BASIC}), payslip_items(description, amount, type)`)
          .eq('payroll_run_id', body.runId)
          .eq('company_id', company_id);
        if (regPayslipsError) throw regPayslipsError;

        const rows = (regPayslips ?? []).map(p => {
          const employerContribs = resolvePayslipEmployerContributions(p);
          return {
            employee_number: resolveEmployeeNumber(p, p.employees),
            employee: `${p.employees.first_name} ${p.employees.last_name}`,
            department: p.employees.department ?? '—',
            gross_pay: p.total_earnings,
            deductions: p.total_deductions,
            employer_contributions: employerContribs,
            net_salary: p.net_pay,
            status: p.payment_status ?? (isFinalizedRun(regRun.status) ? 'paid' : 'pending'),
            payslip_id: p.id,
          };
        });

        data = { run: regRun, register: rows };
        break;
      }

      case 'GET_RUN_SUMMARY': {
        const { data: sumRun, error: sumRunError } = await supabaseAdmin
          .from('payroll_runs')
          .select('*')
          .eq('id', body.runId)
          .eq('company_id', company_id)
          .single();
        if (sumRunError) throw sumRunError;

        const { data: sumPayslips, error: sumPayslipsError } = await supabaseAdmin
          .from('payslips')
          .select('*, payslip_items(description, amount, type)')
          .eq('payroll_run_id', body.runId)
          .eq('company_id', company_id);
        if (sumPayslipsError) throw sumPayslipsError;

        const allItems = (sumPayslips ?? []).flatMap(p => p.payslip_items ?? []);

        const { data: prevRuns } = await supabaseAdmin
          .from('payroll_runs')
          .select('id, pay_date')
          .eq('company_id', company_id)
          .in('status', FINALIZED_RUN_STATUSES)
          .lt('pay_date', sumRun.pay_date)
          .order('pay_date', { ascending: false })
          .limit(1);

        let previousNetPay = null;
        if (prevRuns?.length) {
          const { data: prevPayslips } = await supabaseAdmin
            .from('payslips')
            .select('net_pay')
            .eq('payroll_run_id', prevRuns[0].id);
          previousNetPay = prevPayslips?.reduce((s, p) => s + p.net_pay, 0) ?? null;
        }

        data = buildRunSummary(sumPayslips ?? [], allItems, sumRun, previousNetPay);
        break;
      }

      case 'UPDATE_PAYSLIP': {
        const { payslipId, items } = body;
        const { data: payslipRun, error: payslipRunError } = await supabaseAdmin
          .from('payslips')
          .select('payroll_run_id, payroll_runs(status)')
          .eq('id', payslipId)
          .eq('company_id', company_id)
          .single();
        if (payslipRunError) throw payslipRunError;
        if (payslipRun.payroll_runs?.status !== 'draft') {
          throw new Error('Cannot edit payslips once a payroll run has left draft.');
        }
        const earnings = items.filter(i => i.type === 'earning').reduce((sum, i) => sum + i.amount, 0);
        const deductions = items.filter(i => i.type === 'deduction').reduce((sum, i) => sum + i.amount, 0);
        const netPay = earnings - deductions;

        await supabaseAdmin.from('payslip_items').delete().eq('payslip_id', payslipId);
        const itemsToInsert = items.map(item => ({ ...item, payslip_id: payslipId }));
        await supabaseAdmin.from('payslip_items').insert(itemsToInsert);
        ({ data, error } = await supabaseAdmin.from('payslips').update({
          total_earnings: earnings,
          total_deductions: deductions,
          net_pay: netPay,
        }).eq('id', payslipId).eq('company_id', company_id));
        break;
      }

      case 'FINALIZE_RUN': {
        const runId = body.runId || body.run?.id;
        const { wageAccountId, bankAccountId, liabilityAccountId } = body;
        if (!runId) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'MISSING_RUN_ID',
            message: 'Payroll run ID is required.',
            recovery: 'Reload the payroll run page and retry.',
          });
        }
        if (!wageAccountId || !bankAccountId) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'MISSING_GL_ACCOUNTS',
            message: 'Select wage and bank accounts.',
            recovery: 'Choose all required GL accounts before processing.',
          });
        }

        const { data: runToFinalize, error: runToFinalizeError } = await supabaseAdmin
          .from('payroll_runs')
          .select('id, status, pay_period_start, pay_period_end, pay_date, journal_entry_id, posting_request_id, approved_at')
          .eq('id', runId)
          .eq('company_id', company_id)
          .single();
        if (runToFinalizeError) throw runToFinalizeError;
        if (isFinalizedRun(runToFinalize.status)) {
          throw new PayrollDomainError({
            stage: 'state_transition',
            code: 'ALREADY_PROCESSED',
            message: 'This payroll run has already been finalized.',
            recovery: 'Refresh the page to view posted outputs.',
            status: 409,
          });
        }

        const { data: payslipsToFinalize, error: payslipsErrorFinalize } = await supabaseAdmin
          .from('payslips')
          .select('*')
          .eq('payroll_run_id', runId)
          .eq('company_id', company_id);
        if (payslipsErrorFinalize) throw payslipsErrorFinalize;
        if (!payslipsToFinalize || payslipsToFinalize.length === 0) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'NO_PAYSLIPS',
            message: 'Generate payslips before finalizing the payroll run.',
            recovery: 'Run payslip generation, then process payroll.',
          });
        }

        const totalNetPay = payslipsToFinalize.reduce((sum, p) => sum + p.net_pay, 0);
        const totalWages = payslipsToFinalize.reduce((sum, p) => sum + p.total_earnings, 0);
        const totalDeductions = payslipsToFinalize.reduce((sum, p) => sum + p.total_deductions, 0);
        const totalEmployerContributions = sumSnapshotEmployerContributions(payslipsToFinalize);

        if ((totalDeductions > 0 || totalEmployerContributions > 0) && !liabilityAccountId) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'MISSING_LIABILITY_ACCOUNT',
            message: 'Select a payroll liability account for deductions.',
            recovery: 'Choose a liability account or remove deductions.',
          });
        }

        // Phase 3D: posting goes exclusively through finalize_payroll_run_atomic →
        // posting_engine_submit. No direct journal_entries inserts remain here.
        const { data: postingResult, error: postingError } = await supabaseAdmin.rpc(
          'finalize_payroll_run_atomic',
          {
            p_company_id: company_id,
            p_run_id: runId,
            p_wage_account_id: wageAccountId,
            p_bank_account_id: bankAccountId,
            p_liability_account_id: liabilityAccountId || null,
            p_actor_user_id: user.id,
            p_require_approval: true,
          }
        );
        if (postingError) throw mapPayrollRpcError(postingError);

        const entryId = postingResult?.journal_id ?? postingResult?.journal_entry_id ?? null;
        const recovered = postingResult?.posting_status === 'duplicate' || postingResult?.recovered === true;
        const summary = buildRunSummary(payslipsToFinalize, [], runToFinalize);
        const processedAt = postingResult?.processed_at ?? new Date().toISOString();
        const outputMetadata = {
          payslips_generated: payslipsToFinalize.length,
          reports_generated: true,
          register_generated: true,
          summary_generated: true,
          journal_posted: true,
          posting_engine: true,
          posting_request_id: postingResult?.posting_request_id ?? null,
          emails_sent: 0,
          email_failures: [],
          processed_at: processedAt,
          summary,
          recovered,
        };

        const { data: updatedRun, error: fetchRunError } = await supabaseAdmin
          .from('payroll_runs')
          .select('*')
          .eq('id', runId)
          .eq('company_id', company_id)
          .single();
        if (fetchRunError) throw fetchRunError;

        data = {
          run: updatedRun ?? { ...runToFinalize, status: 'finalized', journal_entry_id: entryId, output_metadata: outputMetadata },
          journal_entry_id: entryId,
          posting_request_id: postingResult?.posting_request_id ?? null,
          posting_status: postingResult?.posting_status ?? 'committed',
          summary,
          outputs: outputMetadata,
          recovered,
        };
        error = null;
        break;
      }

      case 'REVERSE_RUN': {
        const runId = body.runId || body.run?.id;
        if (!runId) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'MISSING_RUN_ID',
            message: 'Payroll run ID is required.',
            recovery: 'Reload the payroll run page and retry.',
          });
        }
        const { data: reverseResult, error: reverseError } = await supabaseAdmin.rpc(
          'reverse_payroll_run_atomic',
          {
            p_company_id: company_id,
            p_run_id: runId,
            p_reason: body.reason ?? 'Payroll reversal',
            p_actor_user_id: user.id,
            p_reopen: false,
          }
        );
        if (reverseError) throw mapPayrollRpcError(reverseError);
        data = reverseResult;
        error = null;
        break;
      }

      case 'REOPEN_RUN': {
        const runId = body.runId || body.run?.id;
        if (!runId) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'MISSING_RUN_ID',
            message: 'Payroll run ID is required.',
            recovery: 'Reload the payroll run page and retry.',
          });
        }
        const { data: reopenResult, error: reopenError } = await supabaseAdmin.rpc(
          'reverse_payroll_run_atomic',
          {
            p_company_id: company_id,
            p_run_id: runId,
            p_reason: body.reason ?? 'Payroll reopen for correction',
            p_actor_user_id: user.id,
            p_reopen: true,
          }
        );
        if (reopenError) throw mapPayrollRpcError(reopenError);
        data = reopenResult;
        error = null;
        break;
      }

      case 'POST_ADJUSTMENT': {
        const runId = body.runId || body.run?.id;
        if (!runId) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'MISSING_RUN_ID',
            message: 'Payroll run ID is required.',
            recovery: 'Reload the payroll run page and retry.',
          });
        }
        if (!Array.isArray(body.lines) || body.lines.length === 0) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'MISSING_ADJUSTMENT_LINES',
            message: 'Adjustment journal lines are required.',
            recovery: 'Provide balanced debit/credit lines for the adjustment.',
          });
        }
        const { data: adjResult, error: adjError } = await supabaseAdmin.rpc(
          'post_payroll_adjustment_atomic',
          {
            p_company_id: company_id,
            p_run_id: runId,
            p_posting_date: body.postingDate ?? body.posting_date ?? null,
            p_description: body.description ?? 'Payroll adjustment',
            p_lines: body.lines,
            p_actor_user_id: user.id,
            p_idempotency_key: body.idempotencyKey ?? body.idempotency_key ?? null,
          }
        );
        if (adjError) throw mapPayrollRpcError(adjError);
        data = adjResult;
        error = null;
        break;
      }

      case 'RECORD_DISTRIBUTION': {
        const { runId, emails_sent, email_failures } = body;
        if (!runId) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'MISSING_RUN_ID',
            message: 'Payroll run ID is required.',
            recovery: 'Reload the payroll run and retry distribution.',
          });
        }

        const { data: distRun, error: distError } = await supabaseAdmin
          .from('payroll_runs')
          .select('id, status, output_metadata')
          .eq('id', runId)
          .eq('company_id', company_id)
          .single();

        if (distError) throw distError;

        const meta = { ...(distRun.output_metadata ?? {}), emails_sent, email_failures, distribution_complete: true };
        const { data: distUpdated, error: distUpdateError } = await supabaseAdmin
          .from('payroll_runs')
          .update({ output_metadata: meta })
          .eq('id', runId)
          .eq('company_id', company_id)
          .select()
          .single();

        if (distUpdateError) throw distUpdateError;

        data = distUpdated;
        error = null;

        await logPayrollAudit(supabaseAdmin, {
          company_id, payroll_run_id: runId, event_type: 'payslips_distributed',
          event_data: { emails_sent, email_failures, persisted: true },
          created_by: user.id,
        });
        break;
      }

      case 'GET_WORKSPACE_SUMMARY': {
        const today = new Date().toISOString().split('T')[0];
        const [
          { data: allEmployees },
          { data: allRuns },
          { count: draftClaimsCount },
          { count: approvedClaimsCount },
          { data: pendingClaimsList },
        ] = await Promise.all([
          supabaseAdmin.from('employees').select('id, first_name, last_name, email, bank_account_number, salary_amount, salary_period, end_date').eq('company_id', company_id),
          supabaseAdmin.from('payroll_runs').select('id, pay_period_start, pay_period_end, pay_date, status').eq('company_id', company_id).order('pay_date', { ascending: false }).limit(10),
          supabaseAdmin.from('expense_claims').select('id', { count: 'exact', head: true }).eq('company_id', company_id).eq('status', 'draft'),
          supabaseAdmin.from('expense_claims').select('id', { count: 'exact', head: true }).eq('company_id', company_id).eq('status', 'approved'),
          supabaseAdmin.from('expense_claims').select('id, claim_number, submission_date, total_amount, status, employees(first_name, last_name, department)').eq('company_id', company_id).in('status', ['draft', 'approved']).order('submission_date', { ascending: false }).limit(5),
        ]);

        const activeEmployees = (allEmployees || []).filter((e) => !e.end_date || e.end_date >= today);
        const missingSalary = activeEmployees.filter((e) => !e.salary_amount);
        const missingEmail = activeEmployees.filter((e) => !e.email);
        const missingBank = activeEmployees.filter((e) => !e.bank_account_number);

        const normalizeToMonthly = (amount: number, period: string | null) => {
          if (period === 'weekly') return amount * 52 / 12;
          if (period === 'fortnightly') return amount * 26 / 12;
          return amount;
        };

        const estimatedMonthlyPayroll = activeEmployees.reduce((sum, e) => {
          if (!e.salary_amount) return sum;
          return sum + normalizeToMonthly(e.salary_amount, e.salary_period);
        }, 0);

        const draftRuns = (allRuns || []).filter((r) => r.status === 'draft');
        const upcomingPayrollRun = [...draftRuns].sort((a, b) => new Date(a.pay_date).getTime() - new Date(b.pay_date).getTime())[0] || null;

        let draftRunEstimatedCost = 0;
        if (upcomingPayrollRun) {
          const { data: draftPayslips } = await supabaseAdmin
            .from('payslips')
            .select('net_pay, total_earnings')
            .eq('payroll_run_id', upcomingPayrollRun.id)
            .eq('company_id', company_id);
          if (draftPayslips?.length) {
            draftRunEstimatedCost = draftPayslips.reduce((sum, p) => sum + p.net_pay, 0);
          } else {
            draftRunEstimatedCost = estimatedMonthlyPayroll;
          }
        }

        const lastProcessedRun = (allRuns || []).find((r) => isFinalizedRun(r.status)) || null;
        let lastProcessedNetPay = 0;
        let lastProcessedGross = 0;
        let lastProcessedPaye = 0;
        let lastProcessedUif = 0;
        let lastProcessedSdl = 0;
        let bankBatchStatus = null;
        let payslipGenerationStatus = 'none';
        if (lastProcessedRun) {
          const { data: processedPayslips } = await supabaseAdmin
            .from('payslips')
            .select('net_pay, total_earnings, payslip_items(description, amount, type)')
            .eq('payroll_run_id', lastProcessedRun.id)
            .eq('company_id', company_id);
          lastProcessedNetPay = processedPayslips?.reduce((sum, p) => sum + p.net_pay, 0) || 0;
          lastProcessedGross = processedPayslips?.reduce((sum, p) => sum + p.total_earnings, 0) || 0;
          const allProcItems = (processedPayslips ?? []).flatMap(p => p.payslip_items ?? []);
          lastProcessedPaye = sumByKeyword(allProcItems, ['paye', 'tax']);
          lastProcessedUif = sumByKeyword(allProcItems, ['uif']);
          lastProcessedSdl = sumByKeyword(allProcItems, ['sdl', 'skills development']);
          payslipGenerationStatus = `${processedPayslips?.length ?? 0} generated`;

          const { data: procRunMeta } = await supabaseAdmin
            .from('payroll_runs')
            .select('output_metadata')
            .eq('id', lastProcessedRun.id)
            .single();
          bankBatchStatus = procRunMeta?.output_metadata?.bank_batch?.status ?? 'not_generated';
        }

        const upcomingRunStatus = upcomingPayrollRun
          ? (draftRuns.find(r => r.id === upcomingPayrollRun.id) ? 'draft' : upcomingPayrollRun.status)
          : null;

        const payrollVariance = lastProcessedNetPay > 0 && draftRunEstimatedCost > 0
          ? draftRunEstimatedCost - lastProcessedNetPay
          : 0;

        data = {
          metrics: {
            employeeCount: activeEmployees.length,
            estimatedMonthlyPayroll,
            draftPayrollRuns: draftRuns.length,
            pendingClaims: draftClaimsCount || 0,
            approvedClaimsAwaitingReimbursement: approvedClaimsCount || 0,
            employeesNeedingAction: new Set([
              ...missingSalary.map((e) => e.id),
              ...missingEmail.map((e) => e.id),
              ...missingBank.map((e) => e.id),
            ]).size,
            upcomingPayDate: upcomingPayrollRun?.pay_date || null,
            draftRunEstimatedCost,
            lastProcessedNetPay,
            payrollVariance,
            payrollReady: missingSalary.length === 0 && activeEmployees.length > 0,
            lastProcessedGross,
            lastProcessedPaye,
            lastProcessedUif,
            lastProcessedSdl,
            bankBatchStatus,
            payslipGenerationStatus,
            upcomingPayrollRunStatus: upcomingRunStatus,
            draftPayrollRunCount: draftRuns.length,
          },
          exceptions: [
            ...missingSalary.map((e) => ({ type: 'missing_salary', employeeId: e.id, name: `${e.first_name} ${e.last_name}` })),
            ...missingEmail.map((e) => ({ type: 'missing_email', employeeId: e.id, name: `${e.first_name} ${e.last_name}` })),
            ...missingBank.map((e) => ({ type: 'missing_bank', employeeId: e.id, name: `${e.first_name} ${e.last_name}` })),
          ],
          recentPayrollRuns: allRuns || [],
          pendingClaimsList: pendingClaimsList || [],
          upcomingPayrollRun,
        };
        break;
      }

      case 'GET_SUMMARY_REPORT':
        ({ data, error } = await userSupabase.rpc('get_payroll_summary_report', {
          p_start_date: body.start_date,
          p_end_date: body.end_date,
        }));
        break;

      case 'GET_PERIOD_REPORTS': {
        const startDate = body.start_date;
        const endDate = body.end_date;
        if (!startDate || !endDate) throw new Error('start_date and end_date are required.');

        const { data: reportRuns, error: reportRunsError } = await supabaseAdmin
          .from('payroll_runs')
          .select('id, pay_period_start, pay_period_end, pay_date, status')
          .eq('company_id', company_id)
          .in('status', FINALIZED_RUN_STATUSES)
          .gte('pay_date', startDate)
          .lte('pay_date', endDate)
          .order('pay_date', { ascending: true });
        if (reportRunsError) throw reportRunsError;

        const payslipInputs = [];
        const summaryPayslips = [];
        for (const r of reportRuns ?? []) {
          const { data: rPayslips } = await supabaseAdmin
            .from('payslips')
            .select(`*, employees(${EMPLOYEE_EMBED_BASIC}), payslip_items(description, amount, type)`)
            .eq('payroll_run_id', r.id)
            .eq('company_id', company_id);
          for (const p of rPayslips ?? []) {
            const employerContribs = resolvePayslipEmployerContributions(p);
            payslipInputs.push({
              employee_number: resolveEmployeeNumber(p, p.employees),
              employee: `${p.employees.first_name} ${p.employees.last_name}`,
              department: p.employees.department ?? '—',
              cost_centre: p.employees.branch ?? p.employees.department ?? '—',
              employee_group: p.employees.position ?? 'Ungrouped',
              pay_date: r.pay_date,
              gross_pay: p.total_earnings,
              total_deductions: p.total_deductions,
              net_pay: p.net_pay,
              employer_contributions: employerContribs,
              items: p.payslip_items ?? [],
              status: p.payment_status ?? 'paid',
            });
            summaryPayslips.push({
              total_earnings: p.total_earnings,
              total_deductions: p.total_deductions,
              net_pay: p.net_pay,
              calculation_snapshot: p.calculation_snapshot,
            });
          }
        }

        const allItems = payslipInputs.flatMap(p => p.items);
        const summary = buildRunSummary(
          summaryPayslips,
          allItems,
          { pay_period_start: startDate, pay_period_end: endDate },
        );

        data = {
          period: { start: startDate, end: endDate },
          payslips: payslipInputs,
          summary,
          run_count: (reportRuns ?? []).length,
        };
        break;
      }

      case 'GENERATE_BANK_BATCH': {
        const batchRunId = body.runId;
        const batchFormat = body.format ?? 'csv';
        const { data: batchRun, error: batchRunError } = await supabaseAdmin
          .from('payroll_runs')
          .select('id, status, pay_date, output_metadata')
          .eq('id', batchRunId)
          .eq('company_id', company_id)
          .single();
        if (batchRunError) throw batchRunError;
        if (!isFinalizedRun(batchRun.status)) throw new Error('Bank batch can only be generated for finalized payroll runs.');

        const { data: batchPayslips, error: batchPayslipsError } = await supabaseAdmin
          .from('payslips')
          .select(`employee_id, net_pay, employees!payslips_employee_id_fkey(${EMPLOYEE_EMBED_BANK})`)
          .eq('payroll_run_id', batchRunId)
          .eq('company_id', company_id);
        if (batchPayslipsError) throw batchPayslipsError;

        const payslipRows = batchPayslips ?? [];
        const employeeIds = [...new Set(payslipRows.map((p) => p.employee_id).filter(Boolean))];

        // Authoritative employee master fetch — Edge Function is source of truth for bank_rows.
        const employeeBankById = new Map();
        if (employeeIds.length > 0) {
          const { data: employeeBankRows, error: employeeBankError } = await supabaseAdmin
            .from('employees')
            .select(EMPLOYEE_EMBED_BANK)
            .eq('company_id', company_id)
            .in('id', employeeIds);
          if (employeeBankError) throw employeeBankError;
          for (const row of employeeBankRows ?? []) {
            employeeBankById.set(row.id, row);
          }
        }

        const totalAmount = payslipRows.reduce((s, p) => s + p.net_pay, 0);
        const paymentReference = `PAY-${batchRun.pay_date}`;
        const now = new Date().toISOString();
        const bankBatch = {
          status: 'generated',
          format: batchFormat,
          generated_at: now,
          employee_count: payslipRows.length,
          total_amount: totalAmount,
          reference: paymentReference,
        };

        const meta = { ...(batchRun.output_metadata ?? {}), bank_batch: bankBatch, bank_file_generated: true };
        const { data: batchUpdated, error: batchUpdateError } = await supabaseAdmin
          .from('payroll_runs')
          .update({ output_metadata: meta })
          .eq('id', batchRunId)
          .eq('company_id', company_id)
          .select()
          .single();

        if (batchUpdateError) {
          throw new PayrollDomainError({
            stage: 'bank_batch_generate',
            code: 'BANK_BATCH_PERSIST_FAILED',
            message: `Failed to persist bank batch: ${batchUpdateError.message}`,
            recovery: 'The bank file was generated but could not be saved. Retry the operation.',
            status: 500,
          });
        }

        const bankRows = payslipRows.map((p) => {
          const embedded = Array.isArray(p.employees) ? p.employees[0] : p.employees;
          const emp = employeeBankById.get(p.employee_id) ?? embedded ?? null;
          const firstName = emp?.first_name ?? '';
          const lastName = emp?.last_name ?? '';
          const displayName = `${firstName} ${lastName}`.trim();
          const bankName = (typeof emp?.bank_name === 'string' && emp.bank_name.trim()) ? emp.bank_name.trim() : null;
          const bankBranchCode = (typeof emp?.bank_branch_code === 'string' && emp.bank_branch_code.trim())
            ? emp.bank_branch_code.trim()
            : null;
          const bankAccountNumber = (typeof emp?.bank_account_number === 'string' && emp.bank_account_number.trim())
            ? emp.bank_account_number.trim()
            : null;
          return {
            employee_name: displayName || emp?.employee_number || 'Unknown',
            bank_name: bankName,
            bank_branch_code: bankBranchCode,
            bank_account_number: bankAccountNumber,
            net_pay: p.net_pay,
            payment_amount: p.net_pay,
            reference: paymentReference,
            payment_reference: paymentReference,
          };
        });

        data = { run: batchUpdated, bank_batch: bankBatch, bank_rows: bankRows, persisted: true };

        await logPayrollAudit(supabaseAdmin, {
          company_id, payroll_run_id: batchRunId, event_type: 'bank_batch_generated',
          event_data: { ...bankBatch, bank_row_count: bankRows.length }, created_by: user.id,
        });
        error = null;
        break;
      }

      case 'UPDATE_BANK_BATCH_STATUS': {
        const statusRunId = body.runId;
        const newStatus = body.status;
        const validStatuses = ['generated', 'downloaded', 'submitted', 'paid'];
        if (!validStatuses.includes(newStatus)) throw new Error(`Invalid bank batch status: ${newStatus}`);

        const { data: statusRun, error: statusRunError } = await supabaseAdmin
          .from('payroll_runs')
          .select('id, output_metadata')
          .eq('id', statusRunId)
          .eq('company_id', company_id)
          .single();
        if (statusRunError) throw statusRunError;

        const existingBatch = statusRun.output_metadata?.bank_batch ?? {};
        const timestampField = { downloaded: 'downloaded_at', submitted: 'submitted_at', paid: 'paid_at' }[newStatus];
        const bankBatch = {
          ...existingBatch,
          status: newStatus,
          ...(timestampField ? { [timestampField]: new Date().toISOString() } : {}),
        };

        const meta = {
          ...(statusRun.output_metadata ?? {}),
          bank_batch: bankBatch,
          bank_file_downloaded: newStatus === 'downloaded' || statusRun.output_metadata?.bank_file_downloaded,
        };

        // Payment confirmation received (bank batch marked paid) → advance run to 'paid'.
        const runStatusPatch = newStatus === 'paid' ? { status: 'paid' } : {};
        const { data: statusUpdated, error: statusUpdateError } = await supabaseAdmin
          .from('payroll_runs')
          .update({ output_metadata: meta, ...runStatusPatch })
          .eq('id', statusRunId)
          .eq('company_id', company_id)
          .select()
          .single();

        if (statusUpdateError) {
          throw new PayrollDomainError({
            stage: 'bank_batch_status',
            code: 'BANK_BATCH_STATUS_UPDATE_FAILED',
            message: `Failed to update bank batch status: ${statusUpdateError.message}`,
            recovery: 'Retry the download. If the problem persists, refresh the run and contact support.',
            status: 500,
          });
        }

        data = statusUpdated ?? { bank_batch: bankBatch, persisted: true };
        error = null;

        await logPayrollAudit(supabaseAdmin, {
          company_id, payroll_run_id: statusRunId, event_type: `bank_batch_${newStatus}`,
          event_data: { status: newStatus }, created_by: user.id,
        });
        break;
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return payrollErrorResponse(error, _ctx);
  }
}))
