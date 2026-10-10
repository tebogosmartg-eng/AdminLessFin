// @ts-nocheck
/**
 * The ledger accounts payroll posts to (ADR-0009): the company chooses them once
 * under Settings → Payroll, or lets payroll set up the standard ones, and every
 * run posts gross pay, net pay, PAYE, UIF, SDL and fund contributions to them.
 * The finalise step previews the exact journal (payroll_run_posting_lines, the
 * same function that posts it). Every write is made here with the service role.
 */
import {
  PAYROLL_ACCOUNTS,
  classificationAdvice,
  suggestAccount,
} from '../_shared/payrollRulesEngine/payrollAccounts.ts'

export const ACCOUNT_METHODS = new Set(['GET_PAYROLL_ACCOUNTS', 'SAVE_PAYROLL_ACCOUNTS', 'SET_UP_PAYROLL_ACCOUNTS', 'PREVIEW_RUN_POSTING']);

const ROLES = new Set(PAYROLL_ACCOUNTS.map((s) => s.role));

async function loadChart(admin, companyId) {
  const { data, error } = await admin.from('chart_of_accounts')
    .select('id, name, type, category, subcategory, account_number, account_code, account_role, tax_treatment, is_active')
    .eq('company_id', companyId);
  if (error) throw error;
  return data ?? [];
}

async function loadMappings(admin, companyId) {
  const { data, error } = await admin.from('payroll_account_mappings').select('account_role, account_id, is_active').eq('company_id', companyId);
  if (error) throw error;
  return data ?? [];
}

/** The roles, what each is mapped to (or would use), and what to change. */
async function accountsView(admin, companyId) {
  const [chart, mappings] = await Promise.all([loadChart(admin, companyId), loadMappings(admin, companyId)]);
  const byId = new Map(chart.map((a) => [a.id, a]));
  const roles = PAYROLL_ACCOUNTS.map((spec) => {
    const mapped = mappings.find((m) => m.account_role === spec.role && m.is_active);
    const account = mapped ? byId.get(mapped.account_id) ?? null : null;
    const suggestedId = account ? null : suggestAccount(spec, chart);
    const suggested = suggestedId ? byId.get(suggestedId) : null;
    return {
      role: spec.role,
      label: spec.label,
      help: spec.help,
      required: !!spec.required,
      expects: { type: spec.type, category: spec.category, subcategory: spec.subcategory },
      account: account ? { id: account.id, name: account.name, code: account.account_code, category: account.category, subcategory: account.subcategory } : null,
      suggested: suggested ? { id: suggested.id, name: suggested.name, code: suggested.account_code } : null,
      advice: account ? classificationAdvice(spec, account) : null,
    };
  });
  // The old single liability account is still honoured for anything unmapped.
  const legacy = mappings.find((m) => m.account_role === 'payroll_liability' && m.is_active);
  return {
    roles,
    legacyLiability: legacy ? (byId.get(legacy.account_id)?.name ?? null) : null,
    configured: roles.filter((r) => r.required).every((r) => !!r.account),
    accounts: chart.filter((a) => a.is_active !== false).map((a) => ({ id: a.id, name: a.name, code: a.account_code, type: a.type, category: a.category, subcategory: a.subcategory })),
  };
}

async function writeMapping(admin, companyId, role, accountId) {
  if (!accountId) {
    const { error } = await admin.from('payroll_account_mappings').delete().eq('company_id', companyId).eq('account_role', role);
    if (error) throw error;
    return;
  }
  const { error } = await admin.from('payroll_account_mappings').upsert(
    { company_id: companyId, account_role: role, account_id: accountId, is_active: true, updated_at: new Date().toISOString() },
    { onConflict: 'company_id,account_role' },
  );
  if (error) throw error;
}

/** The journal a run would post, with account names, from the posting function itself. */
export async function previewRunPosting(admin, companyId, runId, overrides, Err) {
  const { data, error } = await admin.rpc('payroll_run_posting_lines', {
    p_company_id: companyId,
    p_run_id: runId,
    p_wage_account_id: overrides.wageAccountId || null,
    p_bank_account_id: overrides.bankAccountId || null,
    p_liability_account_id: overrides.liabilityAccountId || null,
  });
  if (error) {
    const missing = String(error.message || '').match(/role "([a-z_]+)" is not configured/);
    if (missing || /liability control account/.test(String(error.message))) {
      const spec = PAYROLL_ACCOUNTS.find((s) => s.role === missing?.[1]);
      throw new Err({
        stage: 'validation', code: 'MISSING_GL_ACCOUNTS',
        message: spec ? `Choose the ${spec.label.toLowerCase()} account.` : 'Choose an account for the deductions (PAYE, UIF and the others).',
        recovery: 'Choose it here, or set up the payroll accounts once under Settings → Payroll → Payroll accounts.',
      });
    }
    throw error;
  }
  const chart = await loadChart(admin, companyId);
  const byId = new Map(chart.map((a) => [a.id, a]));
  return {
    ...data,
    lines: (data.lines ?? []).map((l) => ({
      accountId: l.account_id,
      account: byId.get(l.account_id)?.name ?? l.account_id,
      code: byId.get(l.account_id)?.account_code ?? null,
      description: l.description,
      role: l.dimensions?.account_role ?? null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    })),
  };
}

export async function handleAccountMethod(method, ctx) {
  const { supabaseAdmin: admin, company_id, user, body, PayrollDomainError: Err, logPayrollAudit } = ctx;

  if (method === 'GET_PAYROLL_ACCOUNTS') return accountsView(admin, company_id);

  if (method === 'SAVE_PAYROLL_ACCOUNTS') {
    const chosen = body.accounts && typeof body.accounts === 'object' ? body.accounts : {};
    const chart = await loadChart(admin, company_id);
    for (const [role, accountId] of Object.entries(chosen)) {
      if (!ROLES.has(role)) throw new Err({ stage: 'validation', code: 'PAYROLL_ACCOUNT_ROLE', message: `Unknown payroll account role ${role}.`, recovery: 'Refresh the page.' });
      if (accountId) {
        const account = chart.find((a) => a.id === accountId && a.is_active !== false);
        const spec = PAYROLL_ACCOUNTS.find((s) => s.role === role);
        if (!account) throw new Err({ stage: 'validation', code: 'PAYROLL_ACCOUNT_NOT_FOUND', message: `The account chosen for ${spec.label.toLowerCase()} is not an active account of this company.`, recovery: 'Choose another account.' });
        // A wrong type would post a liability as an expense: that is refused. A
        // classification the statements present elsewhere is advice only.
        if (String(account.type) !== spec.type) {
          throw new Err({ stage: 'validation', code: 'PAYROLL_ACCOUNT_TYPE', message: `${spec.label} needs a ${spec.type.toLowerCase()} account; ${account.name} is ${account.type ?? 'unclassified'}.`, recovery: 'Choose an account of the right type.' });
        }
      }
      await writeMapping(admin, company_id, role, accountId || null);
    }
    await logPayrollAudit(admin, { company_id, event_type: 'payroll_accounts_saved', event_data: { accounts: chosen }, created_by: user.id });
    return accountsView(admin, company_id);
  }

  if (method === 'SET_UP_PAYROLL_ACCOUNTS') {
    // Every role without an account: use the standard chart's account where the
    // company has it; otherwise add it, classified as the statements need.
    const chart = await loadChart(admin, company_id);
    const mappings = await loadMappings(admin, company_id);
    const used = new Set(chart.map((a) => Number(a.account_number)).filter((n) => Number.isFinite(n)));
    const created = [];
    const mapped = [];
    for (const spec of PAYROLL_ACCOUNTS) {
      if (mappings.some((m) => m.account_role === spec.role && m.is_active)) continue;
      let accountId = suggestAccount(spec, chart);
      if (!accountId && spec.role === 'bank') continue; // which bank pays salaries is the company's choice
      if (!accountId) {
        let number = spec.template.number;
        while (used.has(number)) number += 1;
        used.add(number);
        const { data: account, error } = await admin.from('chart_of_accounts').insert({
          company_id,
          account_number: number,
          account_code: String(number),
          name: spec.template.name,
          type: spec.type,
          normal_balance: spec.type === 'Liability' ? 'credit' : 'debit',
          category: spec.category,
          subcategory: spec.subcategory,
          financial_statement: spec.type === 'Expense' ? 'Profit or Loss' : 'Statement of Financial Position',
          cash_flow_classification: 'operating',
          tax_treatment: spec.template.tax ?? null,
          control_account: spec.template.control ?? false,
          allow_manual_posting: !spec.template.control,
          is_active: true,
          description: `Payroll: ${spec.help}`,
          source: 'payroll',
        }).select('id, name').single();
        if (error) throw error;
        accountId = account.id;
        created.push(account.name);
        chart.push({ id: account.id, name: account.name, type: spec.type, category: spec.category, subcategory: spec.subcategory, account_number: number, is_active: true, tax_treatment: spec.template.tax ?? null });
      } else {
        mapped.push(chart.find((a) => a.id === accountId)?.name);
      }
      await writeMapping(admin, company_id, spec.role, accountId);
    }
    await logPayrollAudit(admin, { company_id, event_type: 'payroll_accounts_set_up', event_data: { created, mapped }, created_by: user.id });
    return { ...(await accountsView(admin, company_id)), created, mapped };
  }

  if (method === 'PREVIEW_RUN_POSTING') {
    if (!body.runId) throw new Err({ stage: 'validation', code: 'MISSING_RUN_ID', message: 'Payroll run ID is required.', recovery: 'Reload the page.' });
    return previewRunPosting(admin, company_id, body.runId, body, Err);
  }
  return undefined;
}
