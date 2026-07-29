// @ts-nocheck
// ERP Phase 4 — Accounting Rules Engine edge function.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts';
import { generateJournalFromRule } from '../_shared/accountingRulesEngine/generate.ts';

const corsHeaders = ENTERPRISE_CORS_HEADERS;

const BUSINESS_EVENT_LABELS: Record<string, string> = {
  sales_invoice: 'Sales Invoice',
  customer_receipt: 'Customer Receipt',
  supplier_invoice: 'Supplier Invoice',
  supplier_payment: 'Supplier Payment',
  bank_deposit: 'Bank Deposit',
  bank_withdrawal: 'Bank Withdrawal',
  journal_entry: 'Journal Entry',
  inventory_purchase: 'Inventory Purchase',
  inventory_sale: 'Inventory Sale',
  inventory_adjustment: 'Inventory Adjustment',
  payroll_run: 'Payroll Run',
  payroll_payment: 'Payroll Payment',
  depreciation: 'Depreciation',
  asset_acquisition: 'Asset Acquisition',
  asset_disposal: 'Asset Disposal',
  vat_return: 'VAT Return',
  interest: 'Interest',
  loan: 'Loan',
  opening_balances: 'Opening Balances',
  recurring_journal: 'Recurring Journal',
  accrual: 'Accrual',
  prepayment: 'Prepayment',
  reversal: 'Reversal',
};

serve(withEnterprisePlatform('accounting-rules-engine', 'tenant', async (req, _ctx) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated.');

    const body = await req.json();
    const { method, company_id: companyId, business_event: businessEvent, payload, mode = 'preview' } = body;
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

    if (method === 'LIST_RULES') {
      const { data: defs, error } = await supabaseAdmin
        .from('accounting_rule_definitions')
        .select(`
          id, code, name, description, business_event, module, trigger_event, rule_type,
          version, is_mandatory, industry_template, narration_template, generation_hook,
          accounting_rule_settings!left ( enabled, company_id )
        `)
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .order('business_event')
        .order('code');

      if (error) throw error;

      const rules = (defs ?? []).map((d) => {
        const setting = (d.accounting_rule_settings ?? []).find((s) => s.company_id === companyId);
        return {
          id: d.id,
          code: d.code,
          name: d.name,
          description: d.description,
          businessEvent: d.business_event,
          module: d.module,
          trigger: d.trigger_event,
          ruleType: d.rule_type,
          version: d.version,
          isMandatory: d.is_mandatory,
          industryTemplate: d.industry_template,
          narrationTemplate: d.narration_template,
          enabled: d.rule_type === 'system' && d.is_mandatory ? true : (setting?.enabled ?? true),
          generationHook: d.generation_hook,
        };
      });

      return new Response(JSON.stringify(rules), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method === 'GET_DASHBOARD') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: defs }, { data: executions }] = await Promise.all([
        supabaseAdmin
          .from('accounting_rule_definitions')
          .select('id, rule_type')
          .or(`company_id.is.null,company_id.eq.${companyId}`),
        supabaseAdmin
          .from('accounting_rule_executions')
          .select('id, rule_code, rule_name, business_event, module, result, created_at')
          .eq('company_id', companyId)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const applicable = defs ?? [];
      const systemRules = applicable.filter((d) => d.rule_type === 'system').length;
      const companyRules = applicable.filter((d) => d.rule_type === 'company').length;
      const industryRules = applicable.filter((d) => d.rule_type === 'industry').length;

      const usageMap = new Map();
      for (const ex of executions ?? []) {
        const key = ex.rule_code;
        if (!usageMap.has(key)) {
          usageMap.set(key, { ruleCode: ex.rule_code, ruleName: ex.rule_name, businessEvent: ex.business_event, executionCount: 0 });
        }
        usageMap.get(key).executionCount += 1;
      }

      const mostUsed = [...usageMap.values()].sort((a, b) => b.executionCount - a.executionCount).slice(0, 5);
      const recentlyExecuted = (executions ?? []).slice(0, 8).map((ex) => ({
        id: ex.id,
        ruleCode: ex.rule_code,
        ruleName: ex.rule_name,
        businessEvent: ex.business_event,
        module: ex.module,
        result: ex.result,
        createdAt: ex.created_at,
      }));

      const dashboard = {
        totalRules: applicable.length,
        systemRules,
        companyRules,
        industryRules,
        recentlyExecuted,
        mostUsed,
        evaluatedAt: new Date().toISOString(),
      };

      return new Response(JSON.stringify(dashboard), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (!businessEvent) throw new Error('business_event is required.');

    const { data: ruleRow, error: ruleError } = await supabaseAdmin.rpc('accounting_rules_resolve', {
      p_company_id: companyId,
      p_business_event: businessEvent,
    });
    if (ruleError) throw ruleError;
    const rule = ruleRow;

    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('chart_of_accounts')
      .select('id, name, type, account_code, control_account, system_account, tax_treatment, is_active')
      .eq('company_id', companyId);
    if (accountsError) throw accountsError;

    const ruleInput = {
      id: rule.id,
      code: rule.code,
      name: rule.name,
      businessEvent: rule.business_event,
      module: rule.module,
      version: rule.version,
      narrationTemplate: rule.narration_template,
      generationHook: rule.generation_hook,
    };

    const preview = generateJournalFromRule(ruleInput, accounts ?? [], payload ?? {});
    preview.businessEventLabel = BUSINESS_EVENT_LABELS[preview.businessEvent] ?? preview.businessEvent;

    if (!preview.balanced && method !== 'PREVIEW') {
      throw new Error(`Generated journal is unbalanced: debit ${preview.totalDebit} ≠ credit ${preview.totalCredit}`);
    }

    if (method === 'PREVIEW') {
      await supabaseAdmin.rpc('accounting_rules_log_execution', {
        p_company_id: companyId,
        p_rule_id: rule.id,
        p_rule_code: rule.code,
        p_rule_name: rule.name,
        p_rule_version: rule.version,
        p_business_event: businessEvent,
        p_module: rule.module,
        p_result: 'preview',
        p_narration: preview.narration,
        p_generated_by: user.id,
        p_posting_request_id: null,
        p_journal_entry_id: null,
        p_total_debit: preview.totalDebit,
        p_total_credit: preview.totalCredit,
        p_line_count: preview.lines.length,
        p_metadata: { mode: 'preview' },
      });

      return new Response(JSON.stringify(preview), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method !== 'EXECUTE') {
      throw new Error(`Unsupported method: ${method}`);
    }

    const postingLines = preview.lines.map((l) => ({
      account_id: l.account_id,
      debit: l.debit,
      credit: l.credit,
      project_id: l.project_id ?? undefined,
      tax_rate_id: l.tax_rate_id ?? undefined,
      dimensions: l.dimensions ?? {},
    }));

    const postingRequest = {
      company_id: companyId,
      posting_date: payload?.posting_date ?? new Date().toISOString().slice(0, 10),
      module: rule.module,
      document_type: payload?.metadata?.document_type ?? businessEvent,
      document_id: payload?.metadata?.document_id ?? null,
      reference: payload?.reference ?? null,
      description: preview.narration,
      currency: payload?.currency ?? 'ZAR',
      source: 'accounting_rules_engine',
      created_by: user.id,
      generated_by: user.id,
      rule_id: rule.id,
      rule_version: rule.version,
      business_event: businessEvent,
      idempotency_key: payload?.idempotency_key ?? `rules:${businessEvent}:${payload?.metadata?.document_id ?? crypto.randomUUID()}`,
      lines: postingLines,
      vendor_id: payload?.metadata?.vendor_id,
      customer_id: payload?.metadata?.customer_id,
    };

    const { data: postingResult, error: postingError } = await supabaseAdmin.rpc('posting_engine_submit', {
      p_request: postingRequest,
      p_mode: mode,
    });
    if (postingError) throw postingError;

    preview.policyResults = postingResult?.policy_results;

    const resultStatus = postingResult?.posting_status === 'committed' ? 'committed'
      : postingResult?.posting_status === 'validated' ? 'validated'
      : 'preview';

    await supabaseAdmin.rpc('accounting_rules_log_execution', {
      p_company_id: companyId,
      p_rule_id: rule.id,
      p_rule_code: rule.code,
      p_rule_name: rule.name,
      p_rule_version: rule.version,
      p_business_event: businessEvent,
      p_module: rule.module,
      p_result: resultStatus,
      p_narration: preview.narration,
      p_generated_by: user.id,
      p_posting_request_id: postingResult?.posting_request_id ?? null,
      p_journal_entry_id: postingResult?.journal_id ?? null,
      p_total_debit: preview.totalDebit,
      p_total_credit: preview.totalCredit,
      p_line_count: preview.lines.length,
      p_metadata: { mode, posting_status: postingResult?.posting_status },
    });

    return new Response(JSON.stringify({
      preview,
      posting: postingResult,
      aiExplanation: {
        ruleCode: rule.code,
        ruleName: rule.name,
        ruleVersion: rule.version,
        businessEvent,
        why: `Journal generated by rule "${rule.name}" (v${rule.version}) for business event "${BUSINESS_EVENT_LABELS[businessEvent] ?? businessEvent}". ${rule.description ?? ''}`.trim(),
        lines: preview.lines.map((l) => ({
          side: l.debit > 0 ? 'Dr' : 'Cr',
          account: l.account_name ?? l.account_id,
          role: l.account_role,
          amount: l.debit > 0 ? l.debit : l.credit,
        })),
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}));
