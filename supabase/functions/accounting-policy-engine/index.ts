// @ts-nocheck
// ERP Phase 3 — Accounting Policy Engine edge function.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts';
import { POLICY_DOMAIN_ORDER } from '../_shared/accountingPolicyEngine/constants.ts';

const corsHeaders = ENTERPRISE_CORS_HEADERS;

serve(withEnterprisePlatform('accounting-policy-engine', 'tenant', async (req, _ctx) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated.');

    const body = await req.json();
    const { method, company_id: companyId, limit = 50 } = body;
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

    if (method === 'LIST_POLICIES') {
      const { data: defs, error } = await supabaseAdmin
        .from('accounting_policy_definitions')
        .select(`
          id, code, name, description, domain, policy_type, default_severity,
          is_mandatory, industry_template, evaluation_hook,
          accounting_policy_settings!left ( enabled, severity_override, company_id )
        `)
        .order('domain')
        .order('code');

      if (error) throw error;

      const policies = (defs ?? []).map((d) => {
        const setting = (d.accounting_policy_settings ?? []).find((s) => s.company_id === companyId);
        return {
          id: d.id,
          code: d.code,
          name: d.name,
          description: d.description,
          domain: d.domain,
          policyType: d.policy_type,
          defaultSeverity: d.default_severity,
          isMandatory: d.is_mandatory,
          industryTemplate: d.industry_template,
          enabled: setting?.enabled ?? true,
          severityOverride: setting?.severity_override ?? null,
        };
      });

      return new Response(JSON.stringify(policies), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method === 'GET_AUDIT_LOG') {
      const { data: rows, error } = await supabaseAdmin
        .from('accounting_policy_audit_log')
        .select('id, policy_code, policy_name, result, severity, message, user_id, module, reason, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(limit) || 50, 200));

      if (error) throw error;

      const entries = (rows ?? []).map((r) => ({
        id: r.id,
        policyCode: r.policy_code,
        policyName: r.policy_name,
        result: r.result,
        severity: r.severity,
        message: r.message,
        userId: r.user_id,
        module: r.module,
        reason: r.reason,
        createdAt: r.created_at,
      }));

      return new Response(JSON.stringify(entries), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (method !== 'GET_DASHBOARD') {
      throw new Error(`Unsupported method: ${method}`);
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: defs },
      { data: settings },
      { data: auditRows },
    ] = await Promise.all([
      supabaseAdmin.from('accounting_policy_definitions').select('id, domain, policy_type, is_mandatory'),
      supabaseAdmin.from('accounting_policy_settings').select('policy_id, enabled').eq('company_id', companyId),
      supabaseAdmin.from('accounting_policy_audit_log')
        .select('id, policy_code, policy_name, result, severity, message, user_id, module, reason, created_at')
        .eq('company_id', companyId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const settingsByPolicy = new Map((settings ?? []).map((s) => [s.policy_id, s.enabled]));
    const applicable = (defs ?? []).filter((d) =>
      d.policy_type === 'system' || d.policy_type === 'company' || d.policy_type === 'industry',
    );
    const enabledPolicies = applicable.filter((d) => {
      if (d.is_mandatory) return true;
      const enabled = settingsByPolicy.get(d.id);
      return enabled === undefined ? true : enabled;
    }).length;

    const passedCount = (auditRows ?? []).filter((r) => r.result === 'passed').length;
    const violationCount = (auditRows ?? []).filter((r) => r.result === 'violation').length;
    const overrideCount = (auditRows ?? []).filter((r) => r.result === 'override').length;

    const policiesByDomain = {};
    for (const key of POLICY_DOMAIN_ORDER) {
      policiesByDomain[key] = applicable.filter((d) => d.domain === key).length;
    }

    const mapEntry = (r) => ({
      id: r.id,
      policyCode: r.policy_code,
      policyName: r.policy_name,
      result: r.result,
      severity: r.severity,
      message: r.message,
      userId: r.user_id,
      module: r.module,
      reason: r.reason,
      createdAt: r.created_at,
    });

    const dashboard = {
      totalPolicies: applicable.length,
      enabledPolicies,
      passedCount,
      violationCount,
      overrideCount,
      recentViolations: (auditRows ?? []).filter((r) => r.result === 'violation').slice(0, 5).map(mapEntry),
      recentOverrides: (auditRows ?? []).filter((r) => r.result === 'override').slice(0, 5).map(mapEntry),
      policiesByDomain,
      evaluatedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(dashboard), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}));
