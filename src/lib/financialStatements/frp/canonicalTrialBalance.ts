/**
 * FRP V7.0.0 — Client-side Canonical Trial Balance helpers
 * Pure functions mirrored from the edge Financial Reporting Platform.
 * Used by UI + unit tests. Does not call Accounting RPCs.
 */

export const FRP_SCHEMA_VERSION = '7.0.0';

export type CanonicalAccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
export type SignRule = 'as_is' | 'invert' | 'debit_positive' | 'credit_positive';

export type RawTbLine = {
  row_number?: number;
  source_account_code?: string | null;
  source_account_name: string;
  source_account_type?: string | null;
  debit?: number;
  credit?: number;
  balance?: number | null;
  period_activity?: number | null;
  opening_balance?: number | null;
  raw_row?: Record<string, unknown>;
};

export type CanonicalTbLineInput = {
  line_key: string;
  account_code?: string | null;
  account_name: string;
  account_type: CanonicalAccountType;
  taxonomy_line_code?: string | null;
  opening_balance: number;
  closing_balance: number;
  period_activity: number;
  debit?: number;
  credit?: number;
  sign_rule_applied?: string;
  source_ref?: Record<string, unknown>;
  sort_order?: number;
};

export const DEFAULT_TYPE_TAXONOMY: Record<CanonicalAccountType, string> = {
  Asset: 'sfp.assets',
  Liability: 'sfp.liabilities',
  Equity: 'sfp.equity',
  Income: 'perf.revenue',
  Expense: 'perf.expenses',
};

export function round2(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function normalizeAccountType(raw: unknown): CanonicalAccountType | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (['asset', 'assets', 'a', 'bs_asset'].includes(s)) return 'Asset';
  if (['liability', 'liabilities', 'l', 'bs_liability'].includes(s)) return 'Liability';
  if (['equity', 'capital', 'net assets', 'net_assets', 'e'].includes(s)) return 'Equity';
  if (['income', 'revenue', 'sales', 'i', 'pl_income'].includes(s)) return 'Income';
  if (['expense', 'expenses', 'cost', 'costs', 'x', 'pl_expense'].includes(s)) return 'Expense';
  const titled = String(raw).trim();
  if (['Asset', 'Liability', 'Equity', 'Income', 'Expense'].includes(titled)) {
    return titled as CanonicalAccountType;
  }
  return null;
}

export function applySignRule(
  amount: number,
  rule: SignRule = 'as_is',
): { amount: number; rule: SignRule } {
  const n = Number(amount || 0);
  if (rule === 'invert') return { amount: round2(-n), rule };
  if (rule === 'debit_positive') return { amount: round2(Math.abs(n)), rule };
  if (rule === 'credit_positive') return { amount: round2(-Math.abs(n)), rule };
  return { amount: round2(n), rule: 'as_is' };
}

export function netFromDebitCredit(debit: number, credit: number): number {
  return round2(Number(debit || 0) - Number(credit || 0));
}

/** Credit-normal types store natural credit balances as positive in AdminLess. */
export function isCreditNormalAccountType(
  accountType: CanonicalAccountType | string | null | undefined,
): boolean {
  const t = normalizeAccountType(accountType) || accountType;
  return t === 'Liability' || t === 'Equity' || t === 'Income';
}

/**
 * Derive Canonical closing_balance from an import row using AdminLess sign convention.
 * Credit-normal → credit − debit; debit-normal → debit − credit.
 * Debit/credit columns are authoritative when present; explicit balance only for
 * balance-only imports.
 */
export function inferCanonicalClosingBalance(
  row: RawTbLine | Record<string, unknown>,
  accountType: CanonicalAccountType | string | null | undefined,
): number {
  const debit = Number((row as RawTbLine).debit || 0);
  const credit = Number((row as RawTbLine).credit || 0);
  const hasDc = Math.abs(debit) > 0.00001 || Math.abs(credit) > 0.00001;
  if (hasDc) {
    if (isCreditNormalAccountType(accountType)) {
      return round2(credit - debit);
    }
    return netFromDebitCredit(debit, credit);
  }
  const balance = (row as RawTbLine).balance;
  if (balance != null && !Number.isNaN(Number(balance))) {
    return round2(Number(balance));
  }
  return 0;
}

export function inferBalanceFromRow(row: RawTbLine): number {
  if (row.balance != null && !Number.isNaN(Number(row.balance))) {
    return round2(Number(row.balance));
  }
  return netFromDebitCredit(Number(row.debit || 0), Number(row.credit || 0));
}

/** Normalize display text to match across native GL and import paths. */
export function normalizeAccountLabel(name: unknown): string {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim();
  return s || 'Unnamed account';
}

export function parseCsvTrialBalance(csvText: string): RawTbLine[] {
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const header = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const idx = (aliases: string[]) => {
    for (const a of aliases) {
      const i = header.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iCode = idx(['account_code', 'code', 'account_number', 'acct', 'account']);
  const iName = idx(['account_name', 'name', 'description', 'account_description']);
  const iType = idx(['account_type', 'type', 'category']);
  const iDebit = idx(['debit', 'debits', 'dr']);
  const iCredit = idx(['credit', 'credits', 'cr']);
  const iBalance = idx(['balance', 'amount', 'closing_balance', 'closing']);
  const iOpening = idx(['opening_balance', 'opening', 'open_balance']);
  const iActivity = idx(['period_activity', 'activity', 'movement']);

  if (iName < 0 && iCode < 0) {
    throw new Error('CSV Trial Balance requires an account_name or account_code column.');
  }

  const rows: RawTbLine[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseRow(lines[r]);
    if (cols.every((c) => !c)) continue;
    const code = iCode >= 0 ? cols[iCode] : '';
    const name = iName >= 0 ? cols[iName] : code;
    if (!name) continue;
    const debit = iDebit >= 0 ? Number(String(cols[iDebit]).replace(/,/g, '')) || 0 : 0;
    const credit = iCredit >= 0 ? Number(String(cols[iCredit]).replace(/,/g, '')) || 0 : 0;
    const balanceRaw = iBalance >= 0 ? cols[iBalance] : null;
    const balance =
      balanceRaw != null && String(balanceRaw).trim() !== ''
        ? Number(String(balanceRaw).replace(/,/g, ''))
        : null;
    const opening =
      iOpening >= 0 && cols[iOpening]
        ? Number(String(cols[iOpening]).replace(/,/g, ''))
        : null;
    const activity =
      iActivity >= 0 && cols[iActivity]
        ? Number(String(cols[iActivity]).replace(/,/g, ''))
        : null;

    rows.push({
      row_number: r,
      source_account_code: code || null,
      source_account_name: name,
      source_account_type: iType >= 0 ? cols[iType] || null : null,
      debit,
      credit,
      balance: balance != null && !Number.isNaN(balance) ? balance : null,
      opening_balance: opening != null && !Number.isNaN(opening) ? opening : null,
      period_activity: activity != null && !Number.isNaN(activity) ? activity : null,
      raw_row: Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ''])),
    });
  }
  assertUniqueAccountCodes(rows);
  return rows;
}

/**
 * Reject duplicate non-empty account codes within a single import batch.
 * Scope is the import payload (one CSV / rows[]), not company-wide — the same
 * code may legitimately appear across different imports or periods.
 */
export function assertUniqueAccountCodes(rows: RawTbLine[]) {
  const seen = new Map<string, number>();
  for (const row of rows || []) {
    const code = String(row.source_account_code || '').trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `Duplicate account code "${code}" in Trial Balance import (rows ${seen.get(key)} and ${row.row_number ?? '?'}). Each account code may appear only once per import.`,
      );
    }
    seen.set(key, Number(row.row_number || 0));
  }
}

export function matchMappingRule(line: RawTbLine, rules: Array<Record<string, unknown>>) {
  const sorted = [...(rules || [])]
    .filter((r) => r.active !== false)
    .sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100));

  const code = String(line.source_account_code || '').trim().toLowerCase();
  const name = String(line.source_account_name || '').trim().toLowerCase();
  const type = String(line.source_account_type || '').trim().toLowerCase();

  for (const rule of sorted) {
    const mv = String(rule.match_value || '').trim().toLowerCase();
    if (!mv) continue;
    if (rule.match_kind === 'account_code' && code && code === mv) return rule;
    if (rule.match_kind === 'account_name' && name && name === mv) return rule;
    if (rule.match_kind === 'account_type' && type && type === mv) return rule;
    if (rule.match_kind === 'pattern') {
      try {
        const re = new RegExp(String(rule.match_value), 'i');
        if (re.test(code) || re.test(name)) return rule;
      } catch {
        /* skip invalid */
      }
    }
  }
  return null;
}

export function validateCanonicalLines(lines: CanonicalTbLineInput[]) {
  const issues: Array<{ severity: 'error' | 'warning'; code: string; message: string }> = [];
  if (!lines.length) {
    issues.push({
      severity: 'error',
      code: 'CTB_EMPTY',
      message: 'Canonical Trial Balance has no lines.',
    });
    return { ok: false as const, issues };
  }

  let debitTotal = 0;
  let creditTotal = 0;
  const byType: Record<string, number> = {};

  for (const line of lines) {
    if (!line.account_type) {
      issues.push({
        severity: 'error',
        code: 'CTB_MISSING_TYPE',
        message: `Line ${line.line_key} missing account_type.`,
      });
    }
    debitTotal += Number(line.debit || 0);
    creditTotal += Number(line.credit || 0);
    byType[line.account_type] = round2(
      (byType[line.account_type] || 0) + Number(line.closing_balance || 0),
    );
  }

  const assets = byType.Asset || 0;
  const liabilities = byType.Liability || 0;
  const equity = byType.Equity || 0;
  const income = byType.Income || 0;
  const expense = byType.Expense || 0;
  const netIncome = round2(income + expense);
  const rhs = round2(liabilities + equity);
  const gap = round2(assets - rhs);
  if (Math.abs(gap) > 0.05 && Math.abs(round2(assets - (rhs + netIncome))) > 0.05) {
    issues.push({
      severity: 'warning',
      code: 'CTB_BS_IMBALANCE',
      message: `Assets (${assets}) do not articulate to Liabilities+Equity (${rhs}); gap=${gap}.`,
    });
  }

  const dcGap = round2(debitTotal - creditTotal);
  // Hard reject when debit/credit columns are in use and do not balance.
  // (Balance-only imports with both totals at 0 skip this gate.)
  if ((debitTotal > 0 || creditTotal > 0) && Math.abs(dcGap) > 0.05) {
    issues.push({
      severity: 'error',
      code: 'CTB_DR_CR_IMBALANCE',
      message: `Debit total (${round2(debitTotal)}) ≠ Credit total (${round2(creditTotal)}). Canonical Trial Balance cannot be sealed while unbalanced.`,
    });
  }

  const hardErrors = issues.filter((i) => i.severity === 'error');
  return {
    ok: hardErrors.length === 0,
    issues,
    totals: {
      assets,
      liabilities,
      equity,
      income,
      expense,
      netIncome,
      debitTotal: round2(debitTotal),
      creditTotal: round2(creditTotal),
    },
  };
}

export function projectCanonicalTbToFactDataset(params: {
  company_id: string;
  canonical_tb: {
    id?: string;
    period_start: string;
    period_end: string;
    prior_as_of?: string | null;
    source_kind?: string;
    content_hash?: string | null;
    provenance?: { period_key?: string };
  };
  lines: CanonicalTbLineInput[];
  cash_flow?: Array<{ section: string; category: string; amount: number }>;
  source_rpc_refs?: unknown[];
}) {
  const { company_id, canonical_tb, lines, cash_flow = [], source_rpc_refs = [] } = params;
  return {
    schema_version: '7.0.0-canonical-tb',
    company_id,
    period: {
      start_date: canonical_tb.period_start,
      end_date: canonical_tb.period_end,
      prior_as_of: canonical_tb.prior_as_of,
      period_key: canonical_tb.provenance?.period_key,
    },
    balances_as_of: {
      as_of: canonical_tb.period_end,
      accounts: lines.map((l) => ({
        id: l.line_key,
        name: l.account_name,
        type: l.account_type,
        balance: round2(Number(l.closing_balance || 0)),
        taxonomy_line_code: l.taxonomy_line_code || null,
        canonical_tb_line: true,
      })),
    },
    balances_prior_as_of: {
      as_of: canonical_tb.prior_as_of,
      accounts: lines.map((l) => ({
        id: l.line_key,
        name: l.account_name,
        type: l.account_type,
        balance: round2(Number(l.opening_balance || 0)),
        taxonomy_line_code: l.taxonomy_line_code || null,
        canonical_tb_line: true,
      })),
    },
    period_activity: lines.map((l) => ({
      id: l.line_key,
      name: l.account_name,
      type: l.account_type,
      opening_balance: round2(Number(l.opening_balance || 0)),
      closing_balance: round2(Number(l.closing_balance || 0)),
      period_activity: round2(Number(l.period_activity || 0)),
      activity: round2(Number(l.period_activity || 0)),
    })),
    cash_flow,
    canonical_trial_balance: {
      id: canonical_tb.id,
      source_kind: canonical_tb.source_kind,
      content_hash: canonical_tb.content_hash,
      schema_version: FRP_SCHEMA_VERSION,
    },
    source_rpc_refs,
    extracted_at: new Date().toISOString(),
  };
}

/** Trace chain required by the Independent Principal Enterprise Financial Reporting Board. */
export const FRP_TRACE_CHAIN = [
  'journal_or_import',
  'ledger_or_mapping',
  'trial_balance',
  'canonical_trial_balance',
  'financial_reporting_engine',
  'statement_line',
  'document_composer',
  'export',
] as const;

export function buildDocumentComposerProvenance(params: {
  canonical_tb_id: string | null;
  fact_snapshot_id: string | null;
  snapshot_version_id: string | null;
  source_kind?: string | null;
}) {
  return {
    schema_version: FRP_SCHEMA_VERSION,
    composer: 'efs_document_composer',
    trace: [...FRP_TRACE_CHAIN],
    ...params,
  };
}
