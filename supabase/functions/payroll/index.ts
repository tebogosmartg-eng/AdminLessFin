// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  generatePayslipsWithRulesEngine,
  loadPayrollRulesContext,
  loadRunWarnings,
  fetchPayrollRun,
} from '../_shared/generatePayslips.ts'
import { buildEffectiveCompanyRules } from '../_shared/payrollRulesEngine/index.ts'
import { payslipEditError } from '../_shared/payrollRulesEngine/payComponents.ts'
import {
  normaliseEmployerProfile,
  validateEmployerProfile,
} from '../_shared/sars/employerProfile.ts'
import {
  monthBounds,
  prepareEmp201,
  sha256Hex,
} from '../_shared/statutoryFiling.ts'
import {
  LEAVE_METHODS,
  handleLeaveMethod,
  recordLeavePayouts,
  releaseLeavePayouts,
} from './leave.ts'
import {
  STATUTORY_RETURN_METHODS,
  handleStatutoryReturnMethod,
  logReturnEvent,
} from './statutoryReturns.ts'
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
  details: unknown;

  constructor({ stage, code, message, recovery, status = 400, details = undefined }) {
    super(message);
    this.name = 'PayrollDomainError';
    this.stage = stage;
    this.code = code;
    this.recovery = recovery;
    this.status = status;
    this.details = details;
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
      details: error.details,
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

/**
 * Changing payslips after approval withdraws the approval: what was approved is no
 * longer what would be paid. Returns true when an approval was cleared.
 */
async function clearRunApproval(supabaseAdmin, { companyId, runId, userId, reason }) {
  const { data: cleared, error } = await supabaseAdmin
    .from('payroll_runs')
    .update({ approved_at: null, approved_by: null })
    .eq('id', runId)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .not('approved_at', 'is', null)
    .select('id');
  if (error) throw error;
  if (!cleared?.length) return false;
  await logPayrollAudit(supabaseAdmin, {
    company_id: companyId, payroll_run_id: runId, event_type: 'approval_withdrawn',
    event_data: { reason }, created_by: userId,
  });
  return true;
}

/** Records that a user prepared part of a run (generated or edited payslips, or changed its inputs). */
async function addRunPreparer(supabaseAdmin, runId, userId) {
  const { error } = await supabaseAdmin.rpc('payroll_run_add_preparer', { p_run_id: runId, p_user_id: userId });
  if (error) throw error;
}

/** Company approval controls. Without a row, separation of duties applies. */
async function loadPayrollControls(supabaseAdmin, companyId) {
  const { data, error } = await supabaseAdmin
    .from('company_payroll_controls')
    .select('allow_self_approval, self_approval_reason, updated_by, updated_at')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;
  return {
    allow_self_approval: data?.allow_self_approval === true,
    self_approval_reason: data?.self_approval_reason ?? null,
    updated_by: data?.updated_by ?? null,
    updated_at: data?.updated_at ?? null,
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

        // Warnings reflect the employee records as they are now, not as they were when
        // the payslips were generated. A finalised run keeps its generation snapshot.
        const warnings = isFinalizedRun(runData.status)
          ? (runData.output_metadata?.generation_warnings ?? [])
          : await loadRunWarnings(supabaseAdmin, company_id, runData, new Set((payslipsData ?? []).map((p) => p.employee_id)));

        data = { run: runData, payslips: payslipsData, journal_entry: journalEntry, audit_events: auditEvents, warnings };
        break;
      }

      case 'CREATE_RUN': {
        // Only the period and pay date come from the caller: a run always starts as an
        // unapproved draft (status, approval and posting fields are never client-set).
        const runInput = body.runData ?? {};
        const isoDate = /^\d{4}-\d{2}-\d{2}$/;
        const start = String(runInput.pay_period_start ?? '');
        const end = String(runInput.pay_period_end ?? '');
        const payDate = String(runInput.pay_date ?? '');
        const payFrequency = String(runInput.pay_frequency ?? 'monthly');
        if (!['monthly', 'fortnightly', 'weekly'].includes(payFrequency)) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'INVALID_FREQUENCY',
            message: 'Pay frequency must be monthly, fortnightly or weekly.',
            recovery: 'Choose the pay frequency for this run.',
          });
        }
        if (!isoDate.test(start) || !isoDate.test(end) || !isoDate.test(payDate)) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'INVALID_PERIOD',
            message: 'Enter the period start, period end and pay date.',
            recovery: 'Choose all three dates and try again.',
          });
        }
        if (end < start) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'INVALID_PERIOD',
            message: 'The period ends before it starts.',
            recovery: 'Check the period start and end dates.',
          });
        }
        if (payDate < start) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'INVALID_PERIOD',
            message: 'The pay date is before the period starts.',
            recovery: 'Choose a pay date on or after the period start.',
          });
        }

        // A second run over the same days pays those days twice unless it is meant to
        // (a bonus or correction run), so an overlap must be asked for explicitly.
        // Weekly and monthly runs pay different employees, so only the same frequency counts.
        const { data: overlapping, error: overlapError } = await supabaseAdmin
          .from('payroll_runs')
          .select('id, pay_period_start, pay_period_end, status, output_metadata')
          .eq('company_id', company_id)
          .eq('pay_frequency', payFrequency)
          .lte('pay_period_start', end)
          .gte('pay_period_end', start);
        if (overlapError) throw overlapError;
        const live = (overlapping ?? []).filter((r) => r.output_metadata?.cancelled !== true);
        const additionalRun = body.additional_run === true;
        if (live.length && !additionalRun) {
          const list = live.map((r) => `${r.pay_period_start} to ${r.pay_period_end} (${payFrequency}, ${r.status})`).join('; ');
          throw new PayrollDomainError({
            stage: 'validation', code: 'PERIOD_OVERLAP',
            message: `A payroll run already covers these dates: ${list}.`,
            recovery: 'Open the existing run, or tick "Additional run" for a bonus or correction run over the same period.',
            status: 409,
          });
        }

        ({ data, error } = await supabaseAdmin
          .from('payroll_runs')
          .insert({ company_id, pay_period_start: start, pay_period_end: end, pay_date: payDate, pay_frequency: payFrequency, status: 'draft' })
          .select()
          .single());
        if (!error && data) {
          await logPayrollAudit(supabaseAdmin, {
            company_id, payroll_run_id: data.id, event_type: 'run_created',
            event_data: {
              pay_period_start: data.pay_period_start,
              pay_period_end: data.pay_period_end,
              pay_frequency: payFrequency,
              additional_run: additionalRun,
              overlaps: live.map((r) => r.id),
            },
            created_by: user.id,
          });
        }
        break;
      }

      case 'DISCARD_RUN': {
        // Removes a draft run created in error, with its payslips and run inputs.
        // A run that was ever posted (even if reversed and reopened) is kept for the record.
        const runId = body.runId;
        const { data: runToDiscard, error: discardLookupError } = await supabaseAdmin
          .from('payroll_runs')
          .select('id, status, journal_entry_id, posting_request_id, output_metadata, pay_period_start, pay_period_end')
          .eq('id', runId)
          .eq('company_id', company_id)
          .single();
        if (discardLookupError) throw discardLookupError;
        if (runToDiscard.status !== 'draft' || runToDiscard.journal_entry_id || runToDiscard.posting_request_id) {
          throw new PayrollDomainError({
            stage: 'state_transition', code: 'NOT_DISCARDABLE',
            message: 'Only a draft run that has never been processed can be discarded.',
            recovery: 'Reverse a processed run instead.',
            status: 409,
          });
        }
        if (runToDiscard.output_metadata?.reversed_at) {
          throw new PayrollDomainError({
            stage: 'state_transition', code: 'NOT_DISCARDABLE',
            message: 'This run was processed and reversed before; it is kept for the audit trail.',
            recovery: 'Correct and process it again, or leave it as a draft.',
            status: 409,
          });
        }
        // payroll_runs is audited (audit_payroll_runs), so the deleted run is kept in audit_logs.
        ({ error } = await supabaseAdmin
          .from('payroll_runs')
          .delete()
          .eq('id', runId)
          .eq('company_id', company_id)
          .eq('status', 'draft'));
        data = error ? null : { discarded: true, run_id: runId };
        break;
      }

      case 'GENERATE_PAYSLIPS': {
        const genRun = await fetchPayrollRun(supabaseAdmin, body.runId, company_id);
        if (isFinalizedRun(genRun.status)) throw new Error('Cannot regenerate payslips for a finalized payroll run.');
        if (genRun.status !== 'draft') {
          throw new Error(`Payslips can only be regenerated while the run is a draft (run is ${genRun.status}).`);
        }
        const approvalCleared = await clearRunApproval(supabaseAdmin, {
          companyId: company_id, runId: body.runId, userId: user.id, reason: 'payslips_regenerated',
        });

        const generationResult = await generatePayslipsWithRulesEngine(supabaseAdmin, {
          companyId: company_id,
          runId: body.runId,
          run: genRun,
          createdBy: user.id,
        });

        await addRunPreparer(supabaseAdmin, body.runId, user.id);
        // Warnings stay on the run so its page shows them after a reload.
        const { data: metaRow, error: metaError } = await supabaseAdmin
          .from('payroll_runs')
          .select('output_metadata')
          .eq('id', body.runId)
          .eq('company_id', company_id)
          .single();
        if (metaError) throw metaError;
        const { error: warningsError } = await supabaseAdmin
          .from('payroll_runs')
          .update({
            output_metadata: {
              ...(metaRow?.output_metadata ?? {}),
              generation_warnings: generationResult.warnings,
              generation_warnings_at: new Date().toISOString(),
            },
          })
          .eq('id', body.runId)
          .eq('company_id', company_id);
        if (warningsError) throw warningsError;

        data = { ...generationResult, approval_cleared: approvalCleared };
        error = null;

        await logPayrollAudit(supabaseAdmin, {
          company_id, payroll_run_id: body.runId, event_type: 'payslips_generated',
          event_data: {
            count: generationResult.generated,
            engine: generationResult.engine,
            rules_applied: generationResult.rules_applied,
            warnings: generationResult.warnings.length,
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
        const { data: catalogRules, error: catalogError } = await supabaseAdmin
          .from('payroll_rule_catalog')
          .select('id, company_configurable');
        if (catalogError) throw catalogError;
        const catalogById = new Map((catalogRules ?? []).map((r) => [r.id, r]));
        const unknown = settings.filter((s) => !catalogById.has(s.rule_id)).map((s) => s.rule_id);
        if (unknown.length) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'UNKNOWN_RULE',
            message: `Unknown payroll rule: ${unknown.join(', ')}.`,
            recovery: 'Reload payroll settings and try again.',
          });
        }
        const upserts = settings.map((s) => {
          const configurable = catalogById.get(s.rule_id)?.company_configurable === true;
          let config = s.config && typeof s.config === 'object' ? s.config : {};
          if (s.rule_id === 'basic_salary') {
            // The only company choice on basic salary is how a partial period is measured.
            config = { pro_rata_method: config.pro_rata_method === 'working_days' ? 'working_days' : 'calendar_days' };
          }
          return {
            company_id,
            rule_id: s.rule_id,
            // A required rule (PAYE, UIF, basic salary, …) cannot be switched off.
            enabled: configurable ? s.enabled !== false : true,
            config,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          };
        });
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

        // Separation of duties: whoever prepared the run (generated or edited payslips,
        // or changed its inputs) cannot approve it, unless the owner has allowed
        // self-approval for a one-person payroll. The database enforces the same rule.
        const preparers = runToApprove.prepared_by ?? [];
        const selfApproval = preparers.includes(user.id);
        const controls = selfApproval ? await loadPayrollControls(supabaseAdmin, company_id) : null;
        if (selfApproval && !controls.allow_self_approval) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'SELF_APPROVAL_BLOCKED',
            message: 'You prepared this payroll run, so another owner or admin must approve it.',
            recovery: 'Ask another owner or admin to approve the run. In a one-person business the company owner can allow self-approval under Payroll Settings.',
            status: 409,
          });
        }

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
          event_data: {
            employee_count: payslipCount,
            prepared_by: preparers,
            self_approved: selfApproval,
            self_approval_reason: selfApproval ? controls.self_approval_reason : null,
          },
          created_by: user.id,
        });
        break;
      }

      case 'GET_EMPLOYER_PROFILE': {
        const [{ data: profile, error: profileError }, { data: engagement }, { data: companyRow }] = await Promise.all([
          supabaseAdmin.from('company_payroll_employer_profile').select('*').eq('company_id', company_id).maybeSingle(),
          supabaseAdmin
            .from('efs_engagement_general_information')
            .select('trading_name, registered_name, paye_number, sdl_number, uif_number')
            .eq('company_id', company_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabaseAdmin.from('companies').select('name').eq('id', company_id).single(),
        ]);
        if (profileError) throw profileError;
        data = {
          profile: profile ?? null,
          // A saved profile is re-checked: a rule may have tightened since it was saved.
          errors: profile ? validateEmployerProfile(normaliseEmployerProfile(profile)) : [],
          // Starting values for a first-time profile, from details captured elsewhere.
          suggested: {
            trading_name: engagement?.trading_name || engagement?.registered_name || companyRow?.name || '',
            paye_reference: engagement?.paye_number ?? '',
            sdl_reference: engagement?.sdl_number ?? '',
            uif_reference: engagement?.uif_number ?? '',
          },
        };
        error = null;
        break;
      }

      case 'UPDATE_EMPLOYER_PROFILE': {
        const profile = normaliseEmployerProfile(body.profile ?? {});
        const profileErrors = validateEmployerProfile(profile);
        if (profileErrors.length) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'EMPLOYER_PROFILE_INVALID',
            message: `Employer details are not valid for SARS: ${profileErrors[0].message}${profileErrors.length > 1 ? ` (and ${profileErrors.length - 1} more)` : ''}`,
            recovery: 'Correct the highlighted fields and save again.',
            status: 422,
            details: profileErrors,
          });
        }
        const { data: before } = await supabaseAdmin
          .from('company_payroll_employer_profile').select('*').eq('company_id', company_id).maybeSingle();
        const { data: saved, error: saveError } = await supabaseAdmin
          .from('company_payroll_employer_profile')
          .upsert({ ...profile, company_id, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'company_id' })
          .select()
          .single();
        if (saveError) throw saveError;
        await logPayrollAudit(supabaseAdmin, {
          company_id, event_type: 'employer_profile_updated',
          event_data: {
            created: !before,
            changed: before ? Object.keys(profile).filter((k) => before[k] !== saved[k]) : Object.keys(profile),
          },
          created_by: user.id,
        });
        data = { profile: saved, errors: [] };
        error = null;
        break;
      }

      case 'PREPARE_EMP201': {
        const month = String(body.month ?? '');
        monthBounds(month);
        const prepared = await prepareEmp201(supabaseAdmin, company_id, month);
        const { data: existing } = await supabaseAdmin
          .from('statutory_returns')
          .select('id, status, version, filed_at, submission_reference')
          .eq('company_id', company_id).eq('return_type', 'EMP201').eq('period', month.replace('-', ''))
          .neq('status', 'superseded').maybeSingle();
        data = { ...prepared, filed: existing ?? null };
        error = null;
        break;
      }

      case 'FILE_EMP201': {
        const month = String(body.month ?? '');
        monthBounds(month);
        const period = month.replace('-', '');
        const prepared = await prepareEmp201(supabaseAdmin, company_id, month);
        const blocking = prepared.issues.filter((i) => i.severity === 'error');
        if (blocking.length) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'EMP201_NOT_READY',
            message: blocking.map((i) => i.message).join(' '),
            recovery: 'Resolve the listed issues and file again.',
            status: 422, details: blocking,
          });
        }
        const { data: existing, error: existingError } = await supabaseAdmin
          .from('statutory_returns')
          .select('id, version, posting_idempotency_key, journal_entry_id')
          .eq('company_id', company_id).eq('return_type', 'EMP201').eq('period', period)
          .neq('status', 'superseded').maybeSingle();
        if (existingError) throw existingError;
        const replaceReason = typeof body.replaceReason === 'string' ? body.replaceReason.trim() : '';
        if (existing && replaceReason.length < 10) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'EMP201_ALREADY_FILED',
            message: `The EMP201 for ${month} is already filed (version ${existing.version}).`,
            recovery: 'To file a corrected EMP201, give a reason of at least 10 characters; the filed one is kept as superseded.',
            status: 409,
          });
        }

        const declaration = prepared.declaration;
        const returnId = crypto.randomUUID();
        const { end: monthEnd } = monthBounds(month);

        // ETI used against PAYE reduces the PAYE owed to SARS: Dr PAYE liability, Cr ETI income.
        let journalEntryId = null;
        let postingKey = null;
        const post = body.postEti ?? null;
        if (declaration.eti.utilised > 0 && post?.liabilityAccountId && post?.incomeAccountId) {
          const { data: accounts, error: accountsError } = await supabaseAdmin
            .from('chart_of_accounts').select('id, type')
            .eq('company_id', company_id).in('id', [post.liabilityAccountId, post.incomeAccountId]);
          if (accountsError) throw accountsError;
          const typeOf = (id) => accounts?.find((a) => a.id === id)?.type;
          if (typeOf(post.liabilityAccountId) !== 'Liability' || !['Income', 'Revenue'].includes(typeOf(post.incomeAccountId))) {
            throw new PayrollDomainError({
              stage: 'validation', code: 'ETI_ACCOUNTS_INVALID',
              message: 'Choose a liability account for PAYE and an income account for the ETI.',
              recovery: 'Pick the accounts again.',
            });
          }
          postingKey = `payroll:eti_claim:${returnId}`;
          const { data: posted, error: postError } = await supabaseAdmin.rpc('posting_engine_submit', {
            p_request: {
              company_id,
              posting_date: monthEnd,
              module: 'payroll',
              document_type: 'eti_claim',
              document_id: returnId,
              reference: `EMP201-${period}`,
              description: `Employment Tax Incentive used against PAYE — EMP201 ${period}`,
              currency: 'ZAR',
              source: 'payroll_emp201',
              created_by: user.id,
              idempotency_key: postingKey,
              lines: [
                { account_id: post.liabilityAccountId, debit: declaration.eti.utilised, credit: 0 },
                { account_id: post.incomeAccountId, debit: 0, credit: declaration.eti.utilised },
              ],
            },
            p_mode: 'commit',
          });
          if (postError) throw postError;
          journalEntryId = posted?.journal_id ?? null;
        }

        const declarationJson = JSON.stringify(declaration);
        const row = {
          id: returnId,
          company_id,
          country: 'ZA',
          return_type: 'EMP201',
          tax_year: prepared.taxYear,
          period,
          status: 'ready',
          immutable: true,
          version: (existing?.version ?? 0) + 1,
          generated_by: user.id,
          filed_by: user.id,
          filed_at: new Date().toISOString(),
          source_payroll_runs: declaration.sourcePayrollRunIds,
          validation_result: { ok: true, issues: prepared.issues, validatedAt: new Date().toISOString() },
          declaration_data: declaration,
          content_hash: await sha256Hex(declarationJson),
          journal_entry_id: journalEntryId,
          posting_idempotency_key: postingKey,
        };

        if (existing) {
          const { error: supersedeError } = await supabaseAdmin
            .from('statutory_returns')
            .update({ status: 'superseded', superseded_at: new Date().toISOString(), superseded_reason: replaceReason })
            .eq('id', existing.id);
          if (supersedeError) throw supersedeError;
        }
        const { data: filed, error: fileError } = await supabaseAdmin.from('statutory_returns').insert(row).select().single();
        if (fileError) {
          // Undo what this call did so nothing half-filed remains.
          if (postingKey) {
            await supabaseAdmin.rpc('posting_engine_rollback', {
              p_idempotency_key: postingKey, p_company_id: company_id, p_reason: 'EMP201 filing failed', p_actor_user_id: user.id,
            });
          }
          if (existing) {
            await supabaseAdmin.from('statutory_returns')
              .update({ status: 'ready', superseded_at: null, superseded_reason: null }).eq('id', existing.id);
          }
          throw fileError;
        }
        // The replaced return's ETI journal is reversed once its replacement is filed.
        if (existing?.posting_idempotency_key) {
          const { error: rollbackError } = await supabaseAdmin.rpc('posting_engine_rollback', {
            p_idempotency_key: existing.posting_idempotency_key, p_company_id: company_id,
            p_reason: `EMP201 ${period} replaced: ${replaceReason}`, p_actor_user_id: user.id,
          });
          if (rollbackError) throw rollbackError;
        }
        if (existing) {
          await logReturnEvent(supabaseAdmin, { company_id, return_id: existing.id, event_type: 'superseded', payload: { replaced_by: returnId, reason: replaceReason }, user_id: user.id });
        }
        await logReturnEvent(supabaseAdmin, { company_id, return_id: returnId, event_type: 'generated', content_hash: row.content_hash, payload: { version: row.version, total_payable: declaration.totalPayable }, user_id: user.id });
        await logPayrollAudit(supabaseAdmin, {
          company_id, event_type: existing ? 'emp201_refiled' : 'emp201_filed',
          event_data: {
            return_id: returnId, period, version: row.version, replaced: existing?.id ?? null, reason: replaceReason || null,
            paye: declaration.paye, sdl: declaration.sdl, uif: declaration.uif, eti_utilised: declaration.eti.utilised,
            total_payable: declaration.totalPayable, journal_entry_id: journalEntryId,
          },
          created_by: user.id,
        });
        data = { return: filed, issues: prepared.issues };
        error = null;
        break;
      }

      case 'RECORD_RETURN_SUBMISSION': {
        const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
        if (!/^[A-Za-z0-9-]{4,40}$/.test(reference)) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'REFERENCE_INVALID',
            message: 'Enter the SARS payment reference number (PRN) or submission reference, letters and digits only.',
            recovery: 'Copy the reference from eFiling.',
          });
        }
        const { data: ret, error: retError } = await supabaseAdmin
          .from('statutory_returns').select('id, status, approved_at, content_hash')
          .eq('id', body.returnId).eq('company_id', company_id).single();
        if (retError) throw retError;
        if (ret.status === 'superseded') throw new Error('A superseded return cannot be marked as submitted.');
        // Maker-checker: a filed return is approved before it is recorded as submitted to SARS.
        if (!ret.approved_at) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'RETURN_NOT_APPROVED',
            message: 'Approve the return before recording its submission to SARS.',
            recovery: 'Ask another owner or admin to approve it (or approve it yourself if the owner allows self-approval).',
            status: 409,
          });
        }
        ({ data, error } = await supabaseAdmin
          .from('statutory_returns')
          .update({ status: 'submitted', submission_reference: reference, submitted_at: new Date().toISOString() })
          .eq('id', ret.id).select().single());
        if (!error) {
          await logReturnEvent(supabaseAdmin, { company_id, return_id: ret.id, event_type: 'submitted', content_hash: ret.content_hash, payload: { reference }, user_id: user.id });
          await logPayrollAudit(supabaseAdmin, {
            company_id, event_type: 'statutory_return_submitted',
            event_data: { return_id: ret.id, reference }, created_by: user.id,
          });
        }
        break;
      }

      case 'LIST_STATUTORY_RETURNS': {
        let query = supabaseAdmin
          .from('statutory_returns')
          .select('id, return_type, tax_year, period, status, version, filed_at, filed_by, approved_at, approved_by, self_approved, submitted_at, submission_reference, superseded_at, superseded_reason, content_hash, journal_entry_id, declaration_data')
          .eq('company_id', company_id)
          .order('period', { ascending: false })
          .order('version', { ascending: false });
        if (body.returnType) query = query.eq('return_type', body.returnType);
        ({ data, error } = await query);
        break;
      }

      case 'GET_PAYROLL_CONTROLS': {
        data = { ...(await loadPayrollControls(supabaseAdmin, company_id)), can_change: member.role === 'owner' };
        error = null;
        break;
      }

      case 'UPDATE_PAYROLL_CONTROLS': {
        if (member.role !== 'owner') {
          throw new PayrollDomainError({
            stage: 'auth', code: 'OWNER_REQUIRED',
            message: 'Only the company owner can change payroll approval controls.',
            recovery: 'Ask the company owner to change this setting.',
            status: 403,
          });
        }
        if (typeof body.allow_self_approval !== 'boolean') {
          throw new PayrollDomainError({
            stage: 'validation', code: 'INVALID_CONTROLS',
            message: 'allow_self_approval must be true or false.',
            recovery: 'Reload payroll settings and try again.',
          });
        }
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (body.allow_self_approval && reason.length < 10) {
          throw new PayrollDomainError({
            stage: 'validation', code: 'REASON_REQUIRED',
            message: 'Give a reason (at least 10 characters) for allowing self-approval.',
            recovery: 'For example: "Sole owner runs payroll; no second administrator."',
          });
        }
        const before = await loadPayrollControls(supabaseAdmin, company_id);
        const { error: controlsError } = await supabaseAdmin
          .from('company_payroll_controls')
          .upsert({
            company_id,
            allow_self_approval: body.allow_self_approval,
            self_approval_reason: body.allow_self_approval ? reason : null,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'company_id' });
        if (controlsError) throw controlsError;
        await logPayrollAudit(supabaseAdmin, {
          company_id, event_type: 'payroll_controls_updated',
          event_data: { before, allow_self_approval: body.allow_self_approval, reason: body.allow_self_approval ? reason : null },
          created_by: user.id,
        });
        data = { ...(await loadPayrollControls(supabaseAdmin, company_id)), can_change: true };
        error = null;
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
        const editApprovalCleared = await clearRunApproval(supabaseAdmin, {
          companyId: company_id, runId: payslipRun.payroll_run_id, userId: user.id, reason: 'payslip_edited',
        });
        const { data: existingItems, error: existingItemsError } = await supabaseAdmin
          .from('payslip_items')
          .select('description, type, amount, component_code, irp5_code')
          .eq('payslip_id', payslipId);
        if (existingItemsError) throw existingItemsError;
        const editError = payslipEditError(existingItems ?? [], items ?? []);
        if (editError) throw new Error(editError);
        await addRunPreparer(supabaseAdmin, payslipRun.payroll_run_id, user.id);
        const earnings = items.filter(i => i.type === 'earning').reduce((sum, i) => sum + i.amount, 0);
        const deductions = items.filter(i => i.type === 'deduction').reduce((sum, i) => sum + i.amount, 0);
        const netPay = earnings - deductions;

        await supabaseAdmin.from('payslip_items').delete().eq('payslip_id', payslipId);
        const itemsToInsert = items.map(item => {
          const prior = (existingItems ?? []).find(
            (existing) => existing.description === item.description && existing.type === item.type
          );
          return {
            payslip_id: payslipId,
            description: item.description,
            type: item.type,
            amount: item.amount,
            // IRP5 certificates are built from these codes: keep the generated ones.
            component_code: prior?.component_code ?? null,
            irp5_code: prior?.irp5_code ?? null,
          };
        });
        await supabaseAdmin.from('payslip_items').insert(itemsToInsert);
        ({ data, error } = await supabaseAdmin.from('payslips').update({
          total_earnings: earnings,
          total_deductions: deductions,
          net_pay: netPay,
        }).eq('id', payslipId).eq('company_id', company_id));
        if (!error) {
          data = { approval_cleared: editApprovalCleared };
          await logPayrollAudit(supabaseAdmin, {
            company_id, payroll_run_id: payslipRun.payroll_run_id, payslip_id: payslipId, event_type: 'payslip_updated',
            event_data: { net_pay: netPay, lines: itemsToInsert.length },
            created_by: user.id,
          });
        }
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

        if (!runToFinalize.approved_at && !runToFinalize.journal_entry_id) {
          throw new PayrollDomainError({
            stage: 'validation',
            code: 'NOT_APPROVED',
            message: 'Approve the payroll run before processing it.',
            recovery: 'Review the payslips, approve the run, then process.',
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
        // Leave paid out on this run draws down the annual leave balance (once per employee).
        const leavePayouts = await recordLeavePayouts(supabaseAdmin, company_id, updatedRun ?? runToFinalize, user.id);

        data = {
          run: updatedRun ?? { ...runToFinalize, status: 'finalized', journal_entry_id: entryId, output_metadata: outputMetadata },
          journal_entry_id: entryId,
          posting_request_id: postingResult?.posting_request_id ?? null,
          posting_status: postingResult?.posting_status ?? 'committed',
          summary,
          outputs: outputMetadata,
          recovered,
          leave_payouts_recorded: leavePayouts,
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
        await releaseLeavePayouts(supabaseAdmin, company_id, runId, user.id, body.reason ?? 'Payroll reversal');
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
        await releaseLeavePayouts(supabaseAdmin, company_id, runId, user.id, body.reason ?? 'Payroll reopen for correction');
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
        if (LEAVE_METHODS.has(method)) {
          data = await handleLeaveMethod(method, {
            supabaseAdmin, company_id, user, body, PayrollDomainError, logPayrollAudit, addRunPreparer,
          });
          error = null;
          break;
        }
        if (STATUTORY_RETURN_METHODS.has(method)) {
          data = await handleStatutoryReturnMethod(method, {
            supabaseAdmin, company_id, user, body, member, PayrollDomainError, logPayrollAudit, loadPayrollControls,
          });
          error = null;
          break;
        }
        // A caller error, not a server failure (e.g. a newer screen talking to an older deployment).
        throw new PayrollDomainError({
          stage: 'validation',
          code: 'UNSUPPORTED_METHOD',
          message: `Unsupported method: ${method}`,
          recovery: 'This feature is not available on the server yet. Refresh the page; if it persists, the payroll service needs updating.',
          status: 400,
        });
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
