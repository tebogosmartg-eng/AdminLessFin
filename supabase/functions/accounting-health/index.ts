// @ts-nocheck
// ERP Phase 2 — Accounting Health edge function (advisory analysis).
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts';
import { evaluateAccountingHealth } from '../_shared/accountingHealth/evaluate.ts';

const corsHeaders = ENTERPRISE_CORS_HEADERS;

serve(withEnterprisePlatform('accounting-health', 'tenant', async (req, _ctx) => {
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

    if (method !== 'GET_HEALTH' && method !== 'ANALYZE') {
      throw new Error(`Unsupported method: ${method}`);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const [
      { data: accounts },
      { data: bankAccounts },
      { data: readiness },
      { data: postedRows },
    ] = await Promise.all([
      supabaseAdmin
        .from('chart_of_accounts')
        .select(
          'id, name, type, account_number, account_code, parent_account_id, control_account, system_account, allow_manual_posting, posting_blocked, is_active, tax_treatment, financial_statement, normal_balance',
        )
        .eq('company_id', companyId),
      supabaseAdmin
        .from('bank_accounts')
        .select('id, name, is_default, chart_of_account_id, status')
        .eq('company_id', companyId),
      supabaseAdmin
        .from('accounting_readiness')
        .select('payroll_enabled, fixed_assets_enabled, inventory_enabled')
        .eq('company_id', companyId)
        .maybeSingle(),
      supabaseAdmin
        .from('journal_entry_items')
        .select('account_id, journal_entries!inner(company_id)')
        .eq('journal_entries.company_id', companyId)
        .limit(20000),
    ]);

    const balanceByAccount = new Map();
    try {
      const { data: balRows, error: balError } = await supabaseAdmin.rpc('get_balances_as_of_date', {
        p_company_id: companyId,
        p_end_date: new Date().toISOString().slice(0, 10),
      });
      if (!balError && Array.isArray(balRows)) {
        for (const row of balRows) {
          const id = row.id ?? row.account_id;
          if (id) balanceByAccount.set(id, Number(row.balance ?? 0));
        }
      }
    } catch {
      // Balances are optional for advisory health — continue without them.
    }

    const postedAccountIds = Array.from(
      new Set((postedRows ?? []).map((r) => r.account_id).filter(Boolean)),
    );

    const enrichedAccounts = (accounts ?? []).map((a) => ({
      ...a,
      balance: balanceByAccount.has(a.id) ? balanceByAccount.get(a.id) : null,
    }));

    const report = evaluateAccountingHealth({
      accounts: enrichedAccounts,
      bankAccounts: bankAccounts ?? [],
      postedAccountIds,
      flags: {
        payroll_enabled: readiness?.payroll_enabled ?? false,
        fixed_assets_enabled: readiness?.fixed_assets_enabled ?? false,
        inventory_enabled: readiness?.inventory_enabled ?? false,
      },
    });

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}));
