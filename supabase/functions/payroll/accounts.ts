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
import { leaveAccrual } from '../_shared/payrollRulesEngine/leaveAccrual.ts'
import { loadLeaveRows, toLeaveEntry } from '../_shared/leaveRegister.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The leave pay accrual at a date, the accrued leave pay account's balance then,
 * and the journal that brings one to the other (ADR-0009).
 */
async function prepareLeaveAccrual(admin, companyId, asOf, Err) {
  if (!ISO_DATE.test(String(asOf ?? ''))) {
    throw new Err({ stage: 'validation', code: 'ACCRUAL_DATE', message: 'Choose the date to accrue leave pay at (usually the financial year end).', recovery: 'Pick a date.' });
  }
  const [{ data: employees, error: empError }, { data: types, error: typeError }, mappings] = await Promise.all([
    admin.from('employees').select('*').eq('company_id', companyId),
    admin.from('company_leave_types').select('id, accrual, active').eq('company_id', companyId),
    loadMappings(admin, companyId),
  ]);
  if (empError) throw empError;
  if (typeError) throw typeError;
  const annual = (types ?? []).find((t) => t.accrual === 'bcea_annual' && t.active);
  const rows = annual ? await loadLeaveRows(admin, companyId) : [];
  const accrual = leaveAccrual(asOf, employees ?? [], (id) =>
    rows.filter((r) => r.employee_id === id && r.leave_type_id === annual?.id).map(toLeaveEntry));

  const account = (role) => mappings.find((m) => m.account_role === role && m.is_active)?.account_id ?? null;
  const expenseId = account('leave_pay_expense');
  const liabilityId = account('leave_provision');
  let ledgerBalance = 0;
  if (liabilityId) {
    for (let offset = 0; ; offset += 1000) {
      const { data: lines, error } = await admin.from('journal_entry_items')
        .select('type, amount, journal_entries!inner(company_id, entry_date)')
        .eq('account_id', liabilityId).eq('journal_entries.company_id', companyId).lte('journal_entries.entry_date', asOf)
        .order('id').range(offset, offset + 999);
      if (error) throw error;
      for (const l of lines ?? []) ledgerBalance += (l.type === 'credit' ? 1 : -1) * Number(l.amount || 0);
      if (!lines || lines.length < 1000) break;
    }
  }
  const chart = await loadChart(admin, companyId);
  const name = (id) => chart.find((a) => a.id === id)?.name ?? null;
  ledgerBalance = round2(ledgerBalance);
  return {
    ...accrual,
    annualLeaveTracked: !!annual,
    ledgerBalance,
    adjustment: round2(accrual.total - ledgerBalance),
    accounts: { expense: expenseId ? { id: expenseId, name: name(expenseId) } : null, liability: liabilityId ? { id: liabilityId, name: name(liabilityId) } : null },
  };
}

export const ACCOUNT_METHODS = new Set([
  'GET_PAYROLL_ACCOUNTS', 'SAVE_PAYROLL_ACCOUNTS', 'SET_UP_PAYROLL_ACCOUNTS', 'PREVIEW_RUN_POSTING', 'RECLASSIFY_PAYROLL_ACCOUNT',
  'PREPARE_LEAVE_ACCRUAL', 'POST_LEAVE_ACCRUAL',
]);

/** The classification a journal line's role needs (older runs record the single liability roles). */
const SPEC_FOR_ROLE = {
  salary_expense: 'salary_expense',
  employer_expense: 'salary_expense',
  uif_employer_expense: 'uif_employer_expense',
  sdl_expense: 'sdl_expense',
  bank: 'bank',
  // The single payroll liability held PAYE, UIF and SDL together: statutory payables.
  payroll_liability: 'paye_control',
  employer_contributions: 'paye_control',
  paye_control: 'paye_control',
  uif_control: 'uif_control',
  sdl_control: 'sdl_control',
  retirement_fund_control: 'retirement_fund_control',
  medical_aid_control: 'medical_aid_control',
  employee_deductions: 'employee_deductions',
};
/** Ledger roles a payroll account may carry and still be reclassified for payroll. */
const PAYROLL_LEDGER_ROLES = new Set(['', 'payroll_clearing', 'bank']);

/** Whether payroll may reclassify this account, and why not when it may not. */
function reclassifyBlock(account) {
  const role = String(account.account_role ?? '');
  if (account.system_account) return `${account.name} is a system account; its classification is fixed.`;
  if (!PAYROLL_LEDGER_ROLES.has(role)) {
    return `${account.name} is also your ${role.replace(/_/g, ' ')} account, so it cannot be reclassified for payroll. Set up payroll accounts so new runs post to their own accounts, and move what payroll posted here with a journal.`;
  }
  return null;
}

/** The accounts payroll journals have posted to, and what to change about each. */
async function postedAccounts(admin, companyId, chart) {
  const { data: runs, error } = await admin.from('payroll_runs').select('journal_entry_id').eq('company_id', companyId).not('journal_entry_id', 'is', null);
  if (error) throw error;
  const ids = [...new Set((runs ?? []).map((r) => r.journal_entry_id))];
  const roles = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: lines, error: lineError } = await admin.from('journal_entry_items').select('account_id, dimensions').in('journal_entry_id', ids.slice(i, i + 100));
    if (lineError) throw lineError;
    for (const l of lines ?? []) {
      const role = l.dimensions?.account_role;
      if (!role || !SPEC_FOR_ROLE[role]) continue;
      if (!roles.has(l.account_id)) roles.set(l.account_id, new Set());
      roles.get(l.account_id).add(role);
    }
  }
  const byId = new Map(chart.map((a) => [a.id, a]));
  const out = [];
  for (const [accountId, used] of roles) {
    const account = byId.get(accountId);
    if (!account) continue;
    const spec = PAYROLL_ACCOUNTS.find((x) => x.role === SPEC_FOR_ROLE[[...used][0]]);
    const advice = classificationAdvice(spec, account);
    if (!advice) continue;
    const blocked = reclassifyBlock(account);
    out.push({
      accountId, name: account.name, code: account.account_code, usedFor: [...used],
      category: account.category, subcategory: account.subcategory,
      target: { category: spec.category, subcategory: spec.subcategory },
      role: spec.role,
      advice: blocked ?? advice,
      canReclassify: !blocked && String(account.type) === spec.type,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const ROLES = new Set(PAYROLL_ACCOUNTS.map((s) => s.role));

async function loadChart(admin, companyId) {
  const { data, error } = await admin.from('chart_of_accounts')
    .select('id, name, type, category, subcategory, account_number, account_code, account_role, tax_treatment, is_active, system_account, control_account')
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
      advice: account ? (classificationAdvice(spec, account) ? (reclassifyBlock(account) ?? classificationAdvice(spec, account)) : null) : null,
      canReclassify: !!account && !!classificationAdvice(spec, account) && !reclassifyBlock(account) && String(account.type) === spec.type,
    };
  });
  const posted = await postedAccounts(admin, companyId, chart);
  // The old single liability account is still honoured for anything unmapped.
  const legacy = mappings.find((m) => m.account_role === 'payroll_liability' && m.is_active);
  return {
    roles,
    legacyLiability: legacy ? (byId.get(legacy.account_id)?.name ?? null) : null,
    posted,
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

  if (method === 'RECLASSIFY_PAYROLL_ACCOUNT') {
    // One account, on the user's say-so: classified as the statements need it
    // for the payroll role it carries. Amounts and journals are not touched.
    const spec = PAYROLL_ACCOUNTS.find((x) => x.role === body.role);
    if (!spec) throw new Err({ stage: 'validation', code: 'PAYROLL_ACCOUNT_ROLE', message: 'Unknown payroll account role.', recovery: 'Refresh the page.' });
    const chart = await loadChart(admin, company_id);
    const account = chart.find((a) => a.id === body.accountId);
    if (!account) throw new Err({ stage: 'validation', code: 'PAYROLL_ACCOUNT_NOT_FOUND', message: 'That account is not in this company.', recovery: 'Refresh the page.' });
    const blocked = reclassifyBlock(account);
    if (blocked) throw new Err({ stage: 'validation', code: 'PAYROLL_ACCOUNT_SHARED', message: blocked, recovery: 'Set up payroll accounts instead.' });
    if (String(account.type) !== spec.type) {
      throw new Err({ stage: 'validation', code: 'PAYROLL_ACCOUNT_TYPE', message: `${account.name} is ${account.type ?? 'unclassified'}; ${spec.label.toLowerCase()} needs a ${spec.type.toLowerCase()} account.`, recovery: 'Choose another account.' });
    }
    const before = { category: account.category, subcategory: account.subcategory };
    const { error } = await admin.from('chart_of_accounts').update({ category: spec.category, subcategory: spec.subcategory })
      .eq('id', account.id).eq('company_id', company_id);
    if (error) throw error;
    await logPayrollAudit(admin, { company_id, event_type: 'payroll_account_reclassified', event_data: { account_id: account.id, name: account.name, before, after: { category: spec.category, subcategory: spec.subcategory } }, created_by: user.id });
    return accountsView(admin, company_id);
  }

  if (method === 'PREPARE_LEAVE_ACCRUAL') return prepareLeaveAccrual(admin, company_id, body.asOf, Err);

  if (method === 'POST_LEAVE_ACCRUAL') {
    // Posted only when the user accepts it: the difference between what is owed
    // for leave and what the accrued leave pay account holds at the date.
    const prepared = await prepareLeaveAccrual(admin, company_id, body.asOf, Err);
    if (!prepared.accounts.expense || !prepared.accounts.liability) {
      throw new Err({
        stage: 'validation', code: 'ACCRUAL_ACCOUNTS',
        message: 'Choose the leave pay and accrued leave pay accounts first.',
        recovery: 'Settings → Payroll → Payroll accounts ("Set up payroll accounts" adds them).',
      });
    }
    if (Math.abs(prepared.adjustment) < 0.01) return { ...prepared, posted: false };
    if (body.expectedAdjustment != null && Math.abs(Number(body.expectedAdjustment) - prepared.adjustment) >= 0.01) {
      throw new Err({ stage: 'state_transition', code: 'ACCRUAL_CHANGED', message: 'The leave figures changed since you prepared the accrual.', recovery: 'Prepare it again and check the new amount.', status: 409 });
    }
    const up = prepared.adjustment > 0;
    const amount = Math.abs(prepared.adjustment);
    const documentId = crypto.randomUUID();
    const { data: posted, error } = await admin.rpc('posting_engine_submit', {
      p_request: {
        company_id,
        posting_date: prepared.asOf,
        module: 'payroll',
        document_type: 'leave_accrual',
        document_id: documentId,
        reference: `LEAVE-${prepared.asOf}`,
        description: `Leave pay accrual at ${prepared.asOf}`,
        currency: 'ZAR',
        source: 'payroll_leave_accrual',
        created_by: user.id,
        idempotency_key: `payroll:leave_accrual:${prepared.asOf}:${prepared.ledgerBalance.toFixed(2)}:${prepared.total.toFixed(2)}`,
        lines: [
          { account_id: prepared.accounts.expense.id, debit: up ? amount : 0, credit: up ? 0 : amount, description: up ? 'Leave pay accrued' : 'Leave pay accrual released', dimensions: { account_role: 'leave_pay_expense' } },
          { account_id: prepared.accounts.liability.id, debit: up ? 0 : amount, credit: up ? amount : 0, description: 'Accrued leave pay', dimensions: { account_role: 'leave_provision' } },
        ],
      },
      p_mode: 'commit',
    });
    if (error) throw error;
    await logPayrollAudit(admin, { company_id, event_type: 'leave_accrual_posted', event_data: { as_of: prepared.asOf, total: prepared.total, ledger_before: prepared.ledgerBalance, adjustment: prepared.adjustment, journal_id: posted?.journal_id, document_id: documentId }, created_by: user.id });
    return { ...(await prepareLeaveAccrual(admin, company_id, prepared.asOf, Err)), posted: true, journalNumber: posted?.journal_number ?? null };
  }

  if (method === 'PREVIEW_RUN_POSTING') {
    if (!body.runId) throw new Err({ stage: 'validation', code: 'MISSING_RUN_ID', message: 'Payroll run ID is required.', recovery: 'Reload the page.' });
    return previewRunPosting(admin, company_id, body.runId, body, Err);
  }
  return undefined;
}
