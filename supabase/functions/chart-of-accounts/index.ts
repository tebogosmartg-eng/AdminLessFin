// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import {
  DEFAULT_TEMPLATE_KEY,
  getTemplate,
  listTemplates,
} from '../_shared/chartOfAccounts/templates.ts'
import {
  ACCOUNT_ROLES,
  SINGLETON_ACCOUNT_ROLES,
} from '../_shared/chartOfAccounts/accountRoles.ts'
import {
  classificationError,
  subclassificationError,
} from '../_shared/chartOfAccounts/accountClassification.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('chart-of-accounts', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const body = await req.json();
    const { method, company_id } = body;

    if (!company_id) {
      throw new Error("Company ID is required.");
    }
    _ctx.companyId = company_id;

    // Security Check
    const { data: member, error: memberError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !member) throw new Error("Permission denied.");

    const isAdmin = ['owner', 'admin'].includes(member.role);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    /**
     * Classification is authoritative accounting metadata, so it is enforced
     * here as well as in the account form and by the database CHECK constraint.
     * A type/classification pair that cannot present correctly (Liability +
     * Fixed Asset, Expense + Current Assets, Liability with no current /
     * non-current decision) is rejected before it reaches the table.
     */
    const assertClassification = (
      next: Record<string, unknown>,
      current?: { type?: string | null; category?: string | null } | null,
    ) => {
      const type = 'type' in next ? next.type : current?.type
      const hasCategory = 'category' in next
      const category = hasCategory ? next.category : current?.category

      // A partial update that touches neither type nor classification leaves an
      // already-unclassified legacy account as it is — the customer is prompted
      // in the Chart of Accounts, not blocked from renaming the account.
      if (!hasCategory && !('type' in next) && !current?.category) return

      const categoryIssue = classificationError(type, category)
      if (categoryIssue) throw new Error(categoryIssue)

      const subIssue = subclassificationError(
        category,
        'subcategory' in next ? next.subcategory : undefined,
      )
      if (subIssue) throw new Error(subIssue)
    }

    let data, error;

    switch (method) {
      case 'GET': {
        // Optional as_of_date — Banking / KPI consumers pass reporting-period end so
        // cash matches Dashboard. CoA management may omit it (defaults to today).
        const asOf =
          typeof body.as_of_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.as_of_date)
            ? body.as_of_date
            : new Date().toISOString().split('T')[0];
        ({ data, error } = await supabaseAdmin.rpc('get_balances_as_of_date', {
          p_end_date: asOf,
          p_company_id: company_id
        }));
        if (!error && data) {
          data.sort((a, b) => a.account_number - b.account_number);
          const { data: metaRows, error: metaError } = await supabaseAdmin
            .from('chart_of_accounts')
            .select('id, account_role, tax_treatment, control_account, system_account, account_code, category, subcategory, is_active, description')
            .eq('company_id', company_id);
          if (metaError) throw metaError;
          const metaById = new Map((metaRows ?? []).map((m) => [m.id, m]));
          data = data.map((row) => {
            const meta = metaById.get(row.id);
            return meta
              ? {
                  ...row,
                  account_role: meta.account_role ?? null,
                  tax_treatment: meta.tax_treatment ?? null,
                  control_account: meta.control_account ?? false,
                  system_account: meta.system_account ?? false,
                  account_code: meta.account_code ?? null,
                  category: meta.category ?? null,
                  subcategory: meta.subcategory ?? null,
                  is_active: meta.is_active ?? true,
                  description: meta.description ?? row.description ?? null,
                }
              : row;
          });
        }
        break;
      }

      case 'POST': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can create accounts.");
        const accountData = body.accountData ?? {};
        assertClassification(accountData, null);
        ({ data, error } = await supabaseAdmin
          .from('chart_of_accounts')
          .insert({ ...accountData, company_id })
          .select()
          .single());
        break;
      }

      case 'PUT': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can update accounts.");

        // Defense-in-depth for system accounts (the DB trigger is the backstop):
        // identity fields are immutable, but rename/code/description/reorder and
        // deactivation stay allowed. Gives a clean message instead of a raw 23xxx.
        const { data: current } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('system_account, type, account_role, control_account, category')
          .eq('id', body.accountId)
          .eq('company_id', company_id)
          .single();

        if (current?.system_account) {
          const next = body.accountData ?? {};
          const immutable: Array<[string, unknown]> = [
            ['type', current.type],
            ['account_role', current.account_role],
            ['system_account', current.system_account],
            ['control_account', current.control_account],
          ];
          for (const [field, existing] of immutable) {
            if (field in next && next[field] !== existing) {
              throw new Error(
                `This is a system account. Its ${field.replace(/_/g, ' ')} cannot be changed. You can still rename or deactivate it.`,
              );
            }
          }
        }

        assertClassification(body.accountData ?? {}, current);

        ({ data, error } = await supabaseAdmin
          .from('chart_of_accounts')
          .update(body.accountData)
          .eq('id', body.accountId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;
      }

      case 'DELETE': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can delete accounts.");

        const { data: target } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('system_account, name')
          .eq('id', body.accountId)
          .eq('company_id', company_id)
          .single();

        if (target?.system_account) {
          throw new Error(
            `System account "${target.name}" cannot be deleted. Deactivate it instead if you no longer use it.`,
          );
        }

        ({ data, error } = await supabaseAdmin
          .from('chart_of_accounts')
          .delete()
          .eq('id', body.accountId)
          .eq('company_id', company_id));
        break;
      }

      case 'LIST_TEMPLATES':
        // Read-only catalog for onboarding. No account data crosses the wire —
        // the frontend never re-declares the chart; the server is authoritative.
        data = listTemplates();
        break;

      case 'MAP_ROLE': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can map control accounts.");
        const accountId = body.accountId;
        const accountRole = body.account_role;
        if (!accountId) throw new Error('accountId is required.');
        if (!accountRole || !(ACCOUNT_ROLES as readonly string[]).includes(accountRole)) {
          throw new Error('A valid account_role is required.');
        }

        const { data: target, error: targetError } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('id, system_account, account_role, name')
          .eq('id', accountId)
          .eq('company_id', company_id)
          .single();
        if (targetError || !target) throw new Error('Account not found in this company.');

        if (target.system_account && target.account_role && target.account_role !== accountRole) {
          throw new Error(
            `System account "${target.name}" cannot have its account role changed.`,
          );
        }

        if (SINGLETON_ACCOUNT_ROLES.has(accountRole)) {
          const { data: holders, error: holdersError } = await supabaseAdmin
            .from('chart_of_accounts')
            .select('id, system_account, name')
            .eq('company_id', company_id)
            .eq('account_role', accountRole)
            .neq('id', accountId);
          if (holdersError) throw holdersError;
          for (const holder of holders ?? []) {
            if (holder.system_account) {
              throw new Error(
                `That role is already held by system account "${holder.name}" and cannot be reassigned.`,
              );
            }
            const { error: clearError } = await supabaseAdmin
              .from('chart_of_accounts')
              .update({ account_role: null })
              .eq('id', holder.id)
              .eq('company_id', company_id);
            if (clearError) throw clearError;
          }
        }

        const markControl = [
          'trade_receivable',
          'trade_payable',
          'vat_control',
          'output_vat',
          'input_vat',
          'inventory_asset',
          'payroll_clearing',
        ].includes(accountRole);

        ({ data, error } = await supabaseAdmin
          .from('chart_of_accounts')
          .update({
            account_role: accountRole,
            ...(markControl ? { control_account: true } : {}),
          })
          .eq('id', accountId)
          .eq('company_id', company_id)
          .select('id, name, account_role, account_code, account_number')
          .single());
        break;
      }

      case 'GENERATE': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can generate a Chart of Accounts.");

        const templateKey = body.templateKey || DEFAULT_TEMPLATE_KEY;
        const template = getTemplate(templateKey);
        if (!template) throw new Error(`Unknown Chart of Accounts template: ${templateKey}`);

        // Existing charts are authoritative. Generation is only for a company
        // that still has no accounts — never delete, replace, or duplicate.
        const { data: existingAccounts, error: existingError } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('id, source')
          .eq('company_id', company_id);
        if (existingError) throw existingError;

        if ((existingAccounts ?? []).length > 0) {
          throw new Error(
            'This company already has a Chart of Accounts. Map the existing accounts in Accounting Setup instead of generating another chart.',
          );
        }

        // Pass 1 — insert every account (parent left null; codes carry hierarchy).
        const rows = template.accounts.map((a) => ({
          company_id,
          account_number: a.account_number,
          account_code: a.account_code,
          name: a.name,
          type: a.type,
          normal_balance: a.normal_balance,
          category: a.category,
          subcategory: a.subcategory ?? null,
          financial_statement: a.financial_statement,
          cash_flow_classification: a.cash_flow_classification,
          presentation_order: a.presentation_order,
          tax_treatment: a.tax_treatment ?? null,
          account_role: a.account_role ?? null,
          control_account: a.control_account ?? false,
          system_account: a.system_account ?? false,
          allow_manual_posting: a.allow_manual_posting ?? true,
          posting_blocked: a.posting_blocked ?? false,
          is_active: true,
          description: a.description ?? null,
          template_key: template.key,
          source: 'generator',
        }));

        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('chart_of_accounts')
          .insert(rows)
          .select('id, account_code');
        if (insertError) throw insertError;

        // Pass 2 — resolve parent_account_id from account_code hierarchy.
        const idByCode = new Map<string, string>();
        for (const r of inserted ?? []) idByCode.set(r.account_code, r.id);

        for (const a of template.accounts) {
          if (!a.parent_code) continue;
          const childId = idByCode.get(a.account_code);
          const parentId = idByCode.get(a.parent_code);
          if (!childId || !parentId) continue;
          const { error: parentError } = await supabaseAdmin
            .from('chart_of_accounts')
            .update({ parent_account_id: parentId })
            .eq('id', childId)
            .eq('company_id', company_id);
          if (parentError) throw parentError;
        }

        data = { generated: inserted?.length ?? 0, templateKey: template.key };
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
    return edgeFailure(_ctx, error);
  }
}))
