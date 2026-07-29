// ERP Phase 4 — Accounting Rules Engine (edge shared, self-contained).
// Kept in sync with src/governance/domains/accountingRulesEngine/generate.ts

export type RulesAccount = {
  id: string;
  name: string;
  type?: string;
  account_code?: string | null;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  control_account?: boolean | null;
  system_account?: boolean | null;
  tax_treatment?: string | null;
  is_active?: boolean | null;
};

export type RulesLineItem = {
  net?: number;
  tax?: number;
  quantity?: number;
  unit_price?: number;
  unit_cost?: number;
  income_account_id?: string;
  expense_account_id?: string;
  inventory_asset_account_id?: string;
  cogs_account_id?: string;
  tax_rate_id?: string;
  project_id?: string;
  account_id?: string;
  debit?: number;
  credit?: number;
  type?: 'debit' | 'credit';
  amount?: number;
  dimensions?: Record<string, unknown>;
};

export type RulesPayload = {
  posting_date: string;
  description?: string;
  reference?: string;
  lines?: RulesLineItem[];
  totals?: {
    grand_total?: number;
    net?: number;
    tax?: number;
    wages?: number;
    net_pay?: number;
    deductions?: number;
    employer_contributions?: number;
    depreciation?: number;
    asset_cost?: number;
    accumulated_depreciation?: number;
    proceeds?: number;
    gain_loss?: number;
    vat_payable?: number;
    vat_receivable?: number;
    amount?: number;
  };
  accounts?: Record<string, string>;
  direction?: 'in' | 'out';
  metadata?: Record<string, unknown>;
};

export type RulesDefinitionInput = {
  id: string;
  code: string;
  name: string;
  businessEvent: BusinessEventKey;
  module: string;
  version: number;
  narrationTemplate?: string | null;
  generationHook: string;
};

/** Map rules-engine role keys onto CoA account_role / metadata. */
const ROLE_TO_ACCOUNT_ROLE: Record<string, string | string[]> = {
  trade_debtors: 'trade_receivable',
  trade_creditors: 'trade_payable',
  output_vat: 'output_vat',
  input_vat: 'input_vat',
  retained_earnings: 'retained_earnings',
  inventory_asset: 'inventory_asset',
  cogs: 'cogs',
  payroll_liability: 'payroll_clearing',
  depreciation_expense: 'depreciation_expense',
  accumulated_depreciation: 'accumulated_depreciation',
  fixed_asset: 'fixed_asset',
  gain_on_disposal: 'gain_on_disposal',
  loss_on_disposal: 'loss_on_disposal',
  suspense: 'suspense',
};

function accountMatchesRole(account: RulesAccount, role: string): boolean {
  const mapped = ROLE_TO_ACCOUNT_ROLE[role];
  if (mapped) {
    const roles = Array.isArray(mapped) ? mapped : [mapped];
    if (account.account_role && roles.includes(account.account_role)) return true;
  }
  if (role === 'retained_earnings' && account.system_account) return true;
  if (role === 'output_vat' && account.tax_treatment === 'vat_output') return true;
  if (role === 'input_vat' && account.tax_treatment === 'vat_input') return true;
  if (
    role === 'bank' &&
    (account.account_role === 'bank' ||
      account.account_role === 'cash' ||
      account.subcategory === 'Cash and Cash Equivalents')
  ) {
    return true;
  }
  if (role === 'payroll_expense' && account.type === 'Expense' && account.account_code === '6080') return true;
  if (role === 'fixed_asset' && account.subcategory === 'Property, Plant and Equipment' && !account.control_account) {
    return true;
  }
  if (account.account_code) {
    const byCode: Record<string, string> = {
      '1220': 'trade_debtors',
      '2110': 'trade_creditors',
      '1210': 'inventory_asset',
      '2120': 'output_vat',
      '1240': 'input_vat',
      '2125': 'output_vat',
      '3020': 'retained_earnings',
      '1190': 'accumulated_depreciation',
      '6060': 'depreciation_expense',
      '5020': 'cogs',
      '4530': 'gain_on_disposal',
      '8020': 'loss_on_disposal',
    };
    if (byCode[account.account_code] === role) return true;
  }
  return false;
}

function resolveRole(
  role: string,
  accounts: RulesAccount[],
  payload: RulesPayload,
  line?: RulesLineItem,
): string | null {
  if (role === 'from_line' && line) {
    return line.income_account_id ?? line.expense_account_id ?? line.account_id ?? null;
  }
  if (role === 'revenue' && line?.income_account_id) return line.income_account_id;
  if (role === 'expense' && line?.expense_account_id) return line.expense_account_id;
  if (role === 'inventory_asset') {
    return line?.inventory_asset_account_id ?? payload.accounts?.inventory_asset ?? null;
  }
  if (role === 'cogs') {
    return line?.cogs_account_id ?? payload.accounts?.cogs ?? null;
  }
  if (payload.accounts?.[role]) return payload.accounts[role];

  const active = accounts.filter((a) => a.is_active !== false);
  const match = active.find((a) => accountMatchesRole(a, role));
  return match?.id ?? null;
}

function accountName(accounts: RulesAccount[], id: string | null): string | undefined {
  if (!id) return undefined;
  return accounts.find((a) => a.id === id)?.name;
}

function mkLine(
  accountId: string | null,
  accounts: RulesAccount[],
  debit: number,
  credit: number,
  role?: string,
  extra?: Partial<GeneratedJournalLine>,
): GeneratedJournalLine | null {
  if (!accountId || (debit <= 0 && credit <= 0)) return null;
  return {
    account_id: accountId,
    account_name: accountName(accounts, accountId),
    account_role: role,
    debit: round2(debit),
    credit: round2(credit),
    ...extra,
  };
}

function sumLines(lines: GeneratedJournalLine[]) {
  return lines.reduce((acc, l) => ({ debit: acc.debit + l.debit, credit: acc.credit + l.credit }), { debit: 0, credit: 0 });
}

export function generateSalesInvoice(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const out: GeneratedJournalLine[] = [];
  let grandTotal = 0;
  for (const item of payload.lines ?? []) {
    const net = item.net ?? (item.quantity ?? 0) * (item.unit_price ?? 0);
    const tax = item.tax ?? 0;
    grandTotal += net + tax;
    const rev = mkLine(resolveRole('revenue', accounts, payload, item), accounts, 0, net, 'revenue', { project_id: item.project_id, tax_rate_id: item.tax_rate_id });
    if (rev) out.push(rev);
    if (tax > 0) {
      const vat = mkLine(resolveRole('output_vat', accounts, payload, item), accounts, 0, tax, 'output_vat', { tax_rate_id: item.tax_rate_id });
      if (vat) out.push(vat);
    }
    const cogsAmount = item.unit_cost != null && item.quantity != null ? item.quantity * item.unit_cost : 0;
    if (cogsAmount > 0) {
      const cogsLine = mkLine(resolveRole('cogs', accounts, payload, item), accounts, cogsAmount, 0, 'cogs');
      const invLine = mkLine(resolveRole('inventory_asset', accounts, payload, item), accounts, 0, cogsAmount, 'inventory_asset');
      if (cogsLine) out.push(cogsLine);
      if (invLine) out.push(invLine);
    }
  }
  const ar = mkLine(resolveRole('trade_debtors', accounts, payload), accounts, (grandTotal || payload.totals?.grand_total) ?? 0, 0, 'trade_debtors');
  if (ar) out.push(ar);
  return out;
}

export function generateSupplierInvoice(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const out: GeneratedJournalLine[] = [];
  let grandTotal = 0;
  let totalTax = 0;
  for (const item of payload.lines ?? []) {
    const net = item.net ?? (item.quantity ?? 0) * (item.unit_cost ?? 0);
    const tax = item.tax ?? 0;
    grandTotal += net + tax;
    totalTax += tax;
    const exp = mkLine(resolveRole('expense', accounts, payload, item), accounts, net, 0, 'expense', { project_id: item.project_id, tax_rate_id: item.tax_rate_id });
    if (exp) out.push(exp);
  }
  if (totalTax > 0) {
    const vat = mkLine(resolveRole('input_vat', accounts, payload), accounts, totalTax, 0, 'input_vat');
    if (vat) out.push(vat);
  }
  const ap = mkLine(resolveRole('trade_creditors', accounts, payload), accounts, 0, (grandTotal || payload.totals?.grand_total) ?? 0, 'trade_creditors');
  if (ap) out.push(ap);
  return out;
}

export function generatePayrollRun(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const wages = payload.totals?.wages ?? 0;
  const netPay = payload.totals?.net_pay ?? 0;
  const deductions = payload.totals?.deductions ?? 0;
  const employer = payload.totals?.employer_contributions ?? 0;
  const out: GeneratedJournalLine[] = [];
  const wageId = resolveRole('payroll_expense', accounts, payload);
  const bankId = resolveRole('bank', accounts, payload);
  const liabId = resolveRole('payroll_liability', accounts, payload);
  const wage = mkLine(wageId, accounts, wages, 0, 'payroll_expense', { dimensions: { account_role: 'salary_expense' } });
  const bank = mkLine(bankId, accounts, 0, netPay, 'bank', { dimensions: { account_role: 'bank' } });
  const liab = mkLine(liabId, accounts, 0, deductions, 'payroll_liability', { dimensions: { account_role: 'payroll_liability' } });
  if (wage) out.push(wage);
  if (bank) out.push(bank);
  if (deductions > 0 && liab) out.push(liab);
  if (employer > 0) {
    const empExp = mkLine(wageId, accounts, employer, 0, 'payroll_expense', { dimensions: { account_role: 'employer_expense' } });
    const empLiab = mkLine(liabId, accounts, 0, employer, 'payroll_liability', { dimensions: { account_role: 'employer_contributions' } });
    if (empExp) out.push(empExp);
    if (empLiab) out.push(empLiab);
  }
  return out;
}

export function generateDepreciation(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const amount = payload.totals?.depreciation ?? payload.totals?.amount ?? 0;
  return [
    mkLine(resolveRole('depreciation_expense', accounts, payload), accounts, amount, 0, 'depreciation_expense'),
    mkLine(resolveRole('accumulated_depreciation', accounts, payload), accounts, 0, amount, 'accumulated_depreciation'),
  ].filter(Boolean) as GeneratedJournalLine[];
}

export function generateInventoryPurchase(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const amount = payload.totals?.net ?? payload.totals?.amount ?? 0;
  return [
    mkLine(resolveRole('inventory_asset', accounts, payload), accounts, amount, 0, 'inventory_asset'),
    mkLine(resolveRole('trade_creditors', accounts, payload) ?? resolveRole('bank', accounts, payload), accounts, 0, amount, 'trade_creditors'),
  ].filter(Boolean) as GeneratedJournalLine[];
}

export function generateInventorySale(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const amount = payload.totals?.net ?? payload.totals?.amount ?? 0;
  return [
    mkLine(resolveRole('cogs', accounts, payload), accounts, amount, 0, 'cogs'),
    mkLine(resolveRole('inventory_asset', accounts, payload), accounts, 0, amount, 'inventory_asset'),
  ].filter(Boolean) as GeneratedJournalLine[];
}

export function generateOpeningBalances(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const out: GeneratedJournalLine[] = [];
  for (const item of payload.lines ?? []) {
    const debit = item.debit ?? (item.type === 'debit' ? item.amount ?? 0 : 0);
    const credit = item.credit ?? (item.type === 'credit' ? item.amount ?? 0 : 0);
    if (!item.account_id) continue;
    const l = mkLine(item.account_id, accounts, debit, credit, 'from_line', { project_id: item.project_id, dimensions: item.dimensions });
    if (l) out.push(l);
  }
  return out;
}

export function generateVatReturn(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const payable = payload.totals?.vat_payable ?? 0;
  const receivable = payload.totals?.vat_receivable ?? 0;
  const net = round2(payable - receivable);
  const out: GeneratedJournalLine[] = [];
  if (receivable > 0) {
    const inp = mkLine(resolveRole('input_vat', accounts, payload), accounts, 0, receivable, 'input_vat');
    if (inp) out.push(inp);
  }
  if (payable > 0) {
    const outVat = mkLine(resolveRole('output_vat', accounts, payload), accounts, payable, 0, 'output_vat');
    if (outVat) out.push(outVat);
  }
  if (net > 0) {
    const bank = mkLine(resolveRole('bank', accounts, payload), accounts, 0, net, 'bank');
    if (bank) out.push(bank);
  } else if (net < 0) {
    const bank = mkLine(resolveRole('bank', accounts, payload), accounts, Math.abs(net), 0, 'bank');
    if (bank) out.push(bank);
  }
  return out;
}

export function generateManualJournal(accounts: RulesAccount[], payload: RulesPayload): GeneratedJournalLine[] {
  const out: GeneratedJournalLine[] = [];
  for (const item of payload.lines ?? []) {
    const debit = item.debit ?? (item.type === 'debit' ? item.amount ?? 0 : 0);
    const credit = item.credit ?? (item.type === 'credit' ? item.amount ?? 0 : 0);
    if (!item.account_id) continue;
    const l = mkLine(item.account_id, accounts, debit, credit, 'from_line', { project_id: item.project_id, dimensions: item.dimensions });
    if (l) out.push(l);
  }
  return out;
}

const GENERATORS: Record<string, (accounts: RulesAccount[], payload: RulesPayload) => GeneratedJournalLine[]> = {
  sales_invoice: generateSalesInvoice,
  supplier_invoice: generateSupplierInvoice,
  payroll_run: generatePayrollRun,
  depreciation: generateDepreciation,
  inventory_purchase: generateInventoryPurchase,
  inventory_sale: generateInventorySale,
  opening_balances: generateOpeningBalances,
  vat_return: generateVatReturn,
  journal_entry: generateManualJournal,
  recurring_journal: generateManualJournal,
  accrual: generateManualJournal,
  prepayment: generateManualJournal,
  reversal: generateManualJournal,
};

export function generateJournalFromRule(
  rule: RulesDefinitionInput,
  accounts: RulesAccount[],
  payload: RulesPayload,
  now = new Date().toISOString(),
): JournalPreview {
  const generator = GENERATORS[rule.generationHook] ?? GENERATORS[rule.businessEvent];
  if (!generator) throw new Error(`No generator for: ${rule.businessEvent}`);
  const lines = generator(accounts, payload);
  const { debit, credit } = sumLines(lines);
  return {
    businessEvent: rule.businessEvent,
    businessEventLabel: rule.businessEvent,
    ruleId: rule.id,
    ruleCode: rule.code,
    ruleName: rule.name,
    ruleVersion: rule.version,
    narration: payload.description?.trim() || rule.name,
    postingDate: payload.posting_date,
    module: rule.module,
    lines,
    totalDebit: round2(debit),
    totalCredit: round2(credit),
    balanced: Math.abs(debit - credit) < 0.01,
    generatedAt: now,
  };
}
