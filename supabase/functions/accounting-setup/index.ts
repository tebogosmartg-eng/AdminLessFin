// @ts-nocheck
// ERP Phase 1B — Accounting Setup edge: Validation Engine is the authority.
// Step completion flags in accounting_readiness are a derived cache only.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts';
import {
  evaluateAccountingReadiness,
  nextIncompleteStep,
} from '../_shared/accountingReadiness/evaluate.ts';

const corsHeaders = ENTERPRISE_CORS_HEADERS;

async function assertCompanyAdmin(supabase: any, userId: string, companyId: string) {
  const { data, error } = await supabase
    .from('company_users')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Permission denied: not a member of this company.');
  if (!['owner', 'admin'].includes(data.role)) {
    throw new Error('Permission denied: accounting setup requires admin access.');
  }
}

async function ensureReadinessRow(supabaseAdmin: any, companyId: string) {
  const { data: existing } = await supabaseAdmin
    .from('accounting_readiness')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabaseAdmin
    .from('accounting_readiness')
    .insert({
      company_id: companyId,
      status: 'NOT_STARTED',
      accounting_ready: false,
      current_step: 'financial_calendar',
    })
    .select('*')
    .single();
  if (error) throw error;
  return created;
}

async function loadEvaluation(supabaseAdmin: any, companyId: string, row: any) {
  const results = await Promise.all([
    supabaseAdmin
      .from('financial_years')
      .select('id, status')
      .eq('company_id', companyId),
    supabaseAdmin
      .from('chart_of_accounts')
      .select(
        'id, name, type, account_role, category, subcategory, control_account, system_account, tax_treatment, financial_statement, normal_balance, account_code, account_number, is_active',
      )
      .eq('company_id', companyId),
    supabaseAdmin.from('tax_rates').select('id').eq('company_id', companyId),
    supabaseAdmin
      .from('bank_accounts')
      .select('id, opening_balance, opening_balance_posted')
      .eq('company_id', companyId),
    supabaseAdmin
      .from('payroll_account_mappings')
      .select('account_role')
      .eq('company_id', companyId)
      .eq('is_active', true),
  ]);

  for (const result of results) {
    if (result.error) throw result.error;
  }

  const [
    { data: financialYears },
    { data: accounts },
    { data: taxRates },
    { data: bankAccounts },
    { data: payrollMappings },
  ] = results;

  return evaluateAccountingReadiness({
    flags: {
      bank_accounts_skipped: row.bank_accounts_skipped,
      opening_balances_zero_intentional: row.opening_balances_zero_intentional,
      inventory_enabled: row.inventory_enabled,
      fixed_assets_enabled: row.fixed_assets_enabled,
      payroll_enabled: row.payroll_enabled,
    },
    financialYears: financialYears ?? [],
    accounts: accounts ?? [],
    taxRates: taxRates ?? [],
    bankAccounts: bankAccounts ?? [],
    payrollMappings: payrollMappings ?? [],
  });
}

/** Cache columns only — never the source of truth for readiness. */
function cachePatchFromEvaluation(
  evaluation: ReturnType<typeof evaluateAccountingReadiness>,
  row: any,
) {
  // Never demote READY / LOCKED (Phase 1A backfill / freeze BC).
  const preserveReady = row.status === 'READY' || row.status === 'LOCKED';
  const accountingReady = preserveReady ? true : evaluation.accountingReady;
  const status =
    row.status === 'LOCKED'
      ? 'LOCKED'
      : accountingReady
        ? 'READY'
        : evaluation.status;

  return {
    status,
    accounting_ready: accountingReady,
    current_step: nextIncompleteStep(evaluation.steps),
    financial_calendar_complete: evaluation.steps.financial_calendar.complete,
    chart_of_accounts_complete: evaluation.steps.chart_of_accounts.complete,
    tax_configuration_complete: evaluation.steps.tax_configuration.complete,
    bank_accounts_complete: evaluation.steps.bank_accounts.complete,
    opening_balances_complete: evaluation.steps.opening_balances.complete,
    validation_complete: evaluation.steps.validation.complete,
    last_validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function composeResponse(row: any, evaluation: ReturnType<typeof evaluateAccountingReadiness>) {
  const preserveReady = row.status === 'READY' || row.status === 'LOCKED';
  const accountingReady = preserveReady ? true : evaluation.accountingReady;
  const status =
    row.status === 'LOCKED'
      ? 'LOCKED'
      : accountingReady
        ? 'READY'
        : evaluation.status;

  return {
    company_id: row.company_id,
    status,
    accounting_ready: accountingReady,
    current_step: nextIncompleteStep(evaluation.steps),
    // Derived step flags (response authority) — DB cache may lag until refresh
    financial_calendar_complete: evaluation.steps.financial_calendar.complete,
    chart_of_accounts_complete: evaluation.steps.chart_of_accounts.complete,
    tax_configuration_complete: evaluation.steps.tax_configuration.complete,
    bank_accounts_complete: evaluation.steps.bank_accounts.complete,
    opening_balances_complete: evaluation.steps.opening_balances.complete,
    validation_complete: evaluation.steps.validation.complete,
    bank_accounts_skipped: row.bank_accounts_skipped,
    opening_balances_zero_intentional: row.opening_balances_zero_intentional,
    inventory_enabled: row.inventory_enabled,
    fixed_assets_enabled: row.fixed_assets_enabled,
    payroll_enabled: row.payroll_enabled,
    last_validated_at: row.last_validated_at,
    progress_percent: evaluation.progressPercent,
    steps: evaluation.steps,
    validation: evaluation.validation,
  };
}

async function persistCache(supabaseAdmin: any, companyId: string, row: any, evaluation: any) {
  if (row.status === 'LOCKED') return row;
  const patch = cachePatchFromEvaluation(evaluation, row);
  const { data: updated, error } = await supabaseAdmin
    .from('accounting_readiness')
    .update(patch)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) throw error;
  return updated;
}

serve(withEnterprisePlatform('accounting-setup', 'tenant', async (req, _ctx) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated.');

    const body = await req.json();
    const { method, company_id: companyId } = body;
    if (!companyId) throw new Error('company_id is required.');

    const { data: membership } = await supabase
      .from('company_users')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) throw new Error('Permission denied: not a member of this company.');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let row = await ensureReadinessRow(supabaseAdmin, companyId);

    switch (method) {
      case 'GET_STATUS':
      case 'EVALUATE':
      case 'COMPLETE_VALIDATION': {
        // Phase 1B: always derive from master data. Cache refresh on EVALUATE /
        // COMPLETE_VALIDATION (alias). GET_STATUS also refreshes cache so
        // dashboard progress stays current without a separate manual step.
        const evaluation = await loadEvaluation(supabaseAdmin, companyId, row);
        row = await persistCache(supabaseAdmin, companyId, row, evaluation);
        const freshEval = await loadEvaluation(supabaseAdmin, companyId, row);
        return new Response(JSON.stringify(composeResponse(row, freshEval)), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      case 'UPDATE_STEP': {
        // Phase 1B: only records explicit intent / module flags.
        // Does NOT accept manual step completion — validation engine decides.
        await assertCompanyAdmin(supabase, user.id, companyId);
        if (row.status === 'LOCKED') {
          throw new Error('Accounting setup is locked and cannot be changed.');
        }

        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (typeof body.bank_accounts_skipped === 'boolean') {
          patch.bank_accounts_skipped = body.bank_accounts_skipped;
        }
        if (typeof body.opening_balances_zero_intentional === 'boolean') {
          patch.opening_balances_zero_intentional = body.opening_balances_zero_intentional;
        }
        if (typeof body.inventory_enabled === 'boolean') {
          patch.inventory_enabled = body.inventory_enabled;
        }
        if (typeof body.fixed_assets_enabled === 'boolean') {
          patch.fixed_assets_enabled = body.fixed_assets_enabled;
        }
        if (typeof body.payroll_enabled === 'boolean') {
          patch.payroll_enabled = body.payroll_enabled;
        }

        if (Object.keys(patch).length === 1) {
          throw new Error(
            'UPDATE_STEP accepts only intent flags (skip banking, zero opening balances, module toggles). Step completion is derived automatically.',
          );
        }

        const { data: updated, error } = await supabaseAdmin
          .from('accounting_readiness')
          .update(patch)
          .eq('company_id', companyId)
          .select('*')
          .single();
        if (error) throw error;
        row = updated;

        const evaluation = await loadEvaluation(supabaseAdmin, companyId, row);
        row = await persistCache(supabaseAdmin, companyId, row, evaluation);
        const freshEval = await loadEvaluation(supabaseAdmin, companyId, row);
        return new Response(JSON.stringify(composeResponse(row, freshEval)), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}));
