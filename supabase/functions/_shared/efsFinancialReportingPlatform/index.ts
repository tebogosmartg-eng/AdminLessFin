/**
 * EFS FRP V7.0.0 — Financial Reporting Platform (Canonical Trial Balance)
 *
 * Additive layer. Statement Engine / Validation / Review / Publication remain
 * authoritative consumers of sealed Fact Snapshots. This module ensures every
 * sealed fact dataset is projected from a Canonical Trial Balance, whether the
 * source was native AdminLess GL or an imported Trial Balance.
 */
// @ts-nocheck

export const FRP_SCHEMA_VERSION = "7.0.0";

export const SOURCE_SYSTEMS = [
  "adminless",
  "sage",
  "xero",
  "quickbooks",
  "pastel",
  "sap",
  "dynamics365",
  "netsuite",
  "csv",
  "excel",
  "other",
] as const;

export type SourceKind = "native_gl" | "imported_tb";
export type CanonicalAccountType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";
export type SignRule = "as_is" | "invert" | "debit_positive" | "credit_positive";

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

export function round2(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function frpEnabled(): boolean {
  const v = (Deno.env.get("EFS_FRP_CANONICAL_TB") ?? "true").toLowerCase();
  return v === "true" || v === "1";
}

export async function sha256Hex(payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(
    typeof payload === "string" ? payload : JSON.stringify(payload),
  );
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Normalize free-text account type from external systems. */
export function normalizeAccountType(raw: unknown): CanonicalAccountType | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (["asset", "assets", "a", "bs_asset"].includes(s)) return "Asset";
  if (["liability", "liabilities", "l", "bs_liability"].includes(s)) return "Liability";
  if (["equity", "capital", "net assets", "net_assets", "e"].includes(s)) return "Equity";
  if (["income", "revenue", "sales", "i", "pl_income"].includes(s)) return "Income";
  if (["expense", "expenses", "cost", "costs", "x", "pl_expense"].includes(s)) return "Expense";
  // Title-case AdminLess types
  const titled = String(raw).trim();
  if (["Asset", "Liability", "Equity", "Income", "Expense"].includes(titled)) {
    return titled as CanonicalAccountType;
  }
  return null;
}

export function applySignRule(
  amount: number,
  rule: SignRule = "as_is",
): { amount: number; rule: SignRule } {
  const n = Number(amount || 0);
  if (rule === "invert") return { amount: round2(-n), rule };
  if (rule === "debit_positive") return { amount: round2(Math.abs(n)), rule };
  if (rule === "credit_positive") return { amount: round2(-Math.abs(n)), rule };
  return { amount: round2(n), rule: "as_is" };
}

/**
 * Resolve net balance from debit/credit columns (import convention).
 * Debit − Credit; callers may still apply sign rules by account type.
 */
export function netFromDebitCredit(debit: number, credit: number): number {
  return round2(Number(debit || 0) - Number(credit || 0));
}

/** Credit-normal types store natural credit balances as positive in AdminLess. */
export function isCreditNormalAccountType(accountType: CanonicalAccountType | string | null | undefined): boolean {
  const t = normalizeAccountType(accountType) || accountType;
  return t === "Liability" || t === "Equity" || t === "Income";
}

/**
 * Derive Canonical closing_balance from an import row using AdminLess sign convention.
 *
 * Account type MUST be known (from mapping engine's canonical_account_type, or
 * source_account_type). Credit-normal → credit − debit; debit-normal → debit − credit.
 *
 * When debit/credit columns are present they are authoritative (recomputed at seal so a
 * stale mapping-time balance cannot bypass the convention). Explicit balance is used
 * only for balance-only imports (both debit and credit are zero / absent).
 *
 * Applied at mapping (when type is resolved) and again at seal in
 * buildImportedCanonicalLines.
 */
export function inferCanonicalClosingBalance(
  row: RawTbLine | Record<string, unknown>,
  accountType: CanonicalAccountType | string | null | undefined,
): number {
  const debit = Number((row as any).debit || 0);
  const credit = Number((row as any).credit || 0);
  const hasDc = Math.abs(debit) > 0.00001 || Math.abs(credit) > 0.00001;
  if (hasDc) {
    if (isCreditNormalAccountType(accountType)) {
      return round2(credit - debit);
    }
    return netFromDebitCredit(debit, credit);
  }
  const balance = (row as any).balance;
  if (balance != null && balance !== undefined && !Number.isNaN(Number(balance))) {
    return round2(Number(balance));
  }
  return 0;
}

export function inferBalanceFromRow(row: RawTbLine): number {
  if (row.balance != null && row.balance !== undefined && !Number.isNaN(Number(row.balance))) {
    return round2(Number(row.balance));
  }
  return netFromDebitCredit(Number(row.debit || 0), Number(row.credit || 0));
}

/** Normalize display text to match across native GL and import paths. */
export function normalizeAccountLabel(name: unknown): string {
  const s = String(name ?? "").replace(/\s+/g, " ").trim();
  return s || "Unnamed account";
}

/** Minimal CSV parser (quoted fields supported). */
export function parseCsvTrialBalance(csvText: string): RawTbLine[] {
  const text = String(csvText || "").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
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
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const header = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = (aliases: string[]) => {
    for (const a of aliases) {
      const i = header.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iCode = idx(["account_code", "code", "account_number", "acct", "account"]);
  const iName = idx(["account_name", "name", "description", "account_description"]);
  const iType = idx(["account_type", "type", "category"]);
  const iDebit = idx(["debit", "debits", "dr"]);
  const iCredit = idx(["credit", "credits", "cr"]);
  const iBalance = idx(["balance", "amount", "closing_balance", "closing"]);
  const iOpening = idx(["opening_balance", "opening", "open_balance"]);
  const iActivity = idx(["period_activity", "activity", "movement"]);

  if (iName < 0 && iCode < 0) {
    throw new Error(
      "CSV Trial Balance requires an account_name or account_code column.",
    );
  }

  const rows: RawTbLine[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseRow(lines[r]);
    if (cols.every((c) => !c)) continue;
    const code = iCode >= 0 ? cols[iCode] : "";
    const name = iName >= 0 ? cols[iName] : code;
    if (!name) continue;
    const debit = iDebit >= 0 ? Number(String(cols[iDebit]).replace(/,/g, "")) || 0 : 0;
    const credit = iCredit >= 0 ? Number(String(cols[iCredit]).replace(/,/g, "")) || 0 : 0;
    const balanceRaw = iBalance >= 0 ? cols[iBalance] : null;
    const balance =
      balanceRaw != null && String(balanceRaw).trim() !== ""
        ? Number(String(balanceRaw).replace(/,/g, ""))
        : null;
    const opening =
      iOpening >= 0 && cols[iOpening]
        ? Number(String(cols[iOpening]).replace(/,/g, ""))
        : null;
    const activity =
      iActivity >= 0 && cols[iActivity]
        ? Number(String(cols[iActivity]).replace(/,/g, ""))
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
      raw_row: Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""])),
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
  const seen = new Map();
  for (const row of rows || []) {
    const code = String(row.source_account_code || "").trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `Duplicate account code "${code}" in Trial Balance import (rows ${seen.get(key)} and ${row.row_number ?? "?"}). Each account code may appear only once per import.`,
      );
    }
    seen.set(key, Number(row.row_number || 0));
  }
}

export function normalizeImportedRows(rows: unknown[]): RawTbLine[] {
  const out = (rows || []).map((raw, i) => {
    const r = (raw || {}) as Record<string, unknown>;
    const name = String(
      r.source_account_name ?? r.account_name ?? r.name ?? r.description ?? "",
    ).trim();
    if (!name) {
      throw new Error(`Import row ${i + 1} missing account name.`);
    }
    return {
      row_number: Number(r.row_number ?? i + 1),
      source_account_code: (r.source_account_code ?? r.account_code ?? r.code ?? null) as
        | string
        | null,
      source_account_name: name,
      source_account_type: (r.source_account_type ?? r.account_type ?? r.type ?? null) as
        | string
        | null,
      debit: Number(r.debit ?? 0) || 0,
      credit: Number(r.credit ?? 0) || 0,
      balance: r.balance != null ? Number(r.balance) : null,
      opening_balance: r.opening_balance != null ? Number(r.opening_balance) : null,
      period_activity: r.period_activity != null ? Number(r.period_activity) : null,
      raw_row: r,
    };
  });
  assertUniqueAccountCodes(out);
  return out;
}

/**
 * Match an import line against FRP mapping rules (highest priority first).
 */
export function matchMappingRule(line: RawTbLine, rules: any[]) {
  const sorted = [...(rules || [])]
    .filter((r) => r.active !== false)
    .sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100));

  const code = String(line.source_account_code || "").trim().toLowerCase();
  const name = String(line.source_account_name || "").trim().toLowerCase();
  const type = String(line.source_account_type || "").trim().toLowerCase();

  for (const rule of sorted) {
    const mv = String(rule.match_value || "").trim().toLowerCase();
    if (!mv) continue;
    if (rule.match_kind === "account_code" && code && code === mv) return rule;
    if (rule.match_kind === "account_name" && name && name === mv) return rule;
    if (rule.match_kind === "account_type" && type && type === mv) return rule;
    if (rule.match_kind === "pattern") {
      try {
        const re = new RegExp(rule.match_value, "i");
        if (re.test(code) || re.test(name)) return rule;
      } catch {
        /* invalid pattern — skip */
      }
    }
  }
  return null;
}

/**
 * Default type → taxonomy map when no explicit rule / taxonomy assigned.
 * Mirrors efs_default_type_maps line codes.
 */
export const DEFAULT_TYPE_TAXONOMY: Record<CanonicalAccountType, string> = {
  Asset: "sfp.assets",
  Liability: "sfp.liabilities",
  Equity: "sfp.equity",
  Income: "perf.revenue",
  Expense: "perf.expenses",
};

export function validateCanonicalLines(lines: CanonicalTbLineInput[]) {
  const issues: Array<{ severity: "error" | "warning"; code: string; message: string }> = [];
  if (!lines.length) {
    issues.push({
      severity: "error",
      code: "CTB_EMPTY",
      message: "Canonical Trial Balance has no lines.",
    });
    return { ok: false, issues };
  }

  let debitTotal = 0;
  let creditTotal = 0;
  const byType: Record<string, number> = {};

  for (const line of lines) {
    if (!line.account_type) {
      issues.push({
        severity: "error",
        code: "CTB_MISSING_TYPE",
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
  const netIncome = round2(income - Math.abs(expense));
  // Prefer income − |expense| so native (positive expense activity) and signed
  // expense balances both articulate to the Canonical Financial Aggregation NI.
  const rhs = round2(liabilities + equity);
  const gap = round2(assets - rhs);
  // Soft check — imported TBs may store P&L separately from equity
  if (Math.abs(gap) > 0.05 && Math.abs(round2(assets - (rhs + netIncome))) > 0.05) {
    issues.push({
      severity: "warning",
      code: "CTB_BS_IMBALANCE",
      message: `Assets (${assets}) do not articulate to Liabilities+Equity (${rhs}); gap=${gap}.`,
    });
  }

  const dcGap = round2(debitTotal - creditTotal);
  // Hard reject when debit/credit columns are in use and do not balance.
  // (Balance-only imports with both totals at 0 skip this gate.)
  if ((debitTotal > 0 || creditTotal > 0) && Math.abs(dcGap) > 0.05) {
    issues.push({
      severity: "error",
      code: "CTB_DR_CR_IMBALANCE",
      message: `Debit total (${round2(debitTotal)}) ≠ Credit total (${round2(creditTotal)}). Canonical Trial Balance cannot be sealed while unbalanced.`,
    });
  }

  const unmapped = lines.filter((l) => !l.taxonomy_line_code).length;
  if (unmapped > 0) {
    issues.push({
      severity: "warning",
      code: "CTB_UNMAPPED_TAXONOMY",
      message: `${unmapped} canonical line(s) lack taxonomy_line_code.`,
    });
  }

  const hardErrors = issues.filter((i) => i.severity === "error");
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

/**
 * Build Canonical TB lines from native GL extract rows (closing / opening / activity).
 */
export function buildNativeCanonicalLines(params: {
  closingBalances: any[];
  openingBalances: any[];
  periodActivity: any[];
  typeMap?: Map<string, string>;
}): CanonicalTbLineInput[] {
  const openingMap = new Map(
    (params.openingBalances || []).map((a) => [a.id, Number(a.balance || 0)]),
  );
  const activityMap = new Map(
    (params.periodActivity || []).map((a) => [
      a.id,
      Number(a.period_activity ?? a.activity ?? 0),
    ]),
  );
  const typeMap = params.typeMap || new Map();

  return (params.closingBalances || []).map((a, idx) => {
    const account_type = (normalizeAccountType(a.type) || a.type) as CanonicalAccountType;
    const open = round2(openingMap.get(a.id) || 0);
    const close = round2(Number(a.balance || 0));
    const activity = activityMap.has(a.id)
      ? round2(activityMap.get(a.id)!)
      : round2(close - open);
    const taxonomy =
      typeMap.get(account_type) || DEFAULT_TYPE_TAXONOMY[account_type] || null;
    // Place amount on the normal debit/credit side for the account type so a
    // balanced native TB still articulates under the hard DR=CR seal gate.
    const abs = Math.abs(close);
    const debitNormal = account_type === "Asset" || account_type === "Expense";
    let debit = 0;
    let credit = 0;
    if (close >= 0) {
      if (debitNormal) debit = abs;
      else credit = abs;
    } else if (debitNormal) {
      credit = abs;
    } else {
      debit = abs;
    }

    return {
      line_key: String(a.id || `native-${idx}`),
      account_code: a.account_number != null ? String(a.account_number) : null,
      account_name: normalizeAccountLabel(a.name),
      account_type,
      taxonomy_line_code: taxonomy,
      opening_balance: open,
      closing_balance: close,
      period_activity: activity,
      debit: round2(debit),
      credit: round2(credit),
      sign_rule_applied: "as_is",
      source_ref: {
        origin: "native_gl",
        account_id: a.id,
        trace: ["journal", "ledger", "trial_balance", "canonical_trial_balance"],
      },
      sort_order: idx * 10,
    };
  });
}

/**
 * Build Canonical TB lines from mapped import lines.
 */
export function buildImportedCanonicalLines(mappedLines: any[]): CanonicalTbLineInput[] {
  return (mappedLines || [])
    .filter((l) => l.mapping_status !== "excluded")
    .map((l, idx) => {
      const account_type = (normalizeAccountType(l.canonical_account_type) ||
        normalizeAccountType(l.source_account_type) ||
        "Asset") as CanonicalAccountType;
      // Type-aware close: must run after mapping has resolved canonical_account_type.
      const closing = inferCanonicalClosingBalance(l, account_type);
      const signed = applySignRule(closing, (l.sign_rule_applied || "as_is") as SignRule);
      const opening =
        l.opening_balance != null ? round2(Number(l.opening_balance)) : 0;
      const activity =
        l.period_activity != null
          ? round2(Number(l.period_activity))
          : round2(signed.amount - opening);
      const taxonomy =
        l.taxonomy_line_code || DEFAULT_TYPE_TAXONOMY[account_type] || null;

      return {
        line_key: `import:${l.id || idx}`,
        account_code: l.source_account_code || null,
        account_name: normalizeAccountLabel(l.source_account_name),
        account_type,
        taxonomy_line_code: taxonomy,
        opening_balance: opening,
        closing_balance: signed.amount,
        period_activity: activity,
        debit: round2(Number(l.debit || 0)),
        credit: round2(Number(l.credit || 0)),
        sign_rule_applied: signed.rule,
        source_ref: {
          origin: "imported_tb",
          import_line_id: l.id,
          row_number: l.row_number,
          trace: ["imported_trial_balance", "mapping_engine", "canonical_trial_balance"],
        },
        sort_order: Number(l.row_number || idx) * 10,
      };
    });
}

/**
 * Project a sealed Canonical Trial Balance into the Fact Snapshot dataset shape
 * expected by the certified Statement Engine adapter (V6.4.1).
 */
export function projectCanonicalTbToFactDataset(params: {
  company_id: string;
  canonical_tb: any;
  lines: CanonicalTbLineInput[] | any[];
  cash_flow?: any[];
  source_rpc_refs?: unknown[];
}) {
  const { company_id, canonical_tb, lines, cash_flow = [], source_rpc_refs = [] } = params;
  const period_start = canonical_tb.period_start;
  const period_end = canonical_tb.period_end;
  const prior_as_of = canonical_tb.prior_as_of;

  const balances_as_of = {
    as_of: period_end,
    accounts: lines.map((l) => ({
      id: l.line_key,
      account_number: l.account_code ? Number(l.account_code) || l.account_code : undefined,
      name: l.account_name,
      type: l.account_type,
      balance: round2(Number(l.closing_balance || 0)),
      taxonomy_line_code: l.taxonomy_line_code || null,
      canonical_tb_line: true,
    })),
  };

  const balances_prior_as_of = {
    as_of: prior_as_of,
    accounts: lines.map((l) => ({
      id: l.line_key,
      account_number: l.account_code ? Number(l.account_code) || l.account_code : undefined,
      name: l.account_name,
      type: l.account_type,
      balance: round2(Number(l.opening_balance || 0)),
      taxonomy_line_code: l.taxonomy_line_code || null,
      canonical_tb_line: true,
    })),
  };

  const period_activity = lines.map((l) => ({
    id: l.line_key,
    account_number: l.account_code ? Number(l.account_code) || l.account_code : undefined,
    name: l.account_name,
    type: l.account_type,
    opening_balance: round2(Number(l.opening_balance || 0)),
    closing_balance: round2(Number(l.closing_balance || 0)),
    period_activity: round2(Number(l.period_activity || 0)),
    activity: round2(Number(l.period_activity || 0)),
  }));

  return {
    schema_version: "7.0.0-canonical-tb",
    company_id,
    period: {
      start_date: period_start,
      end_date: period_end,
      prior_as_of,
      period_key: canonical_tb.provenance?.period_key,
    },
    balances_as_of,
    balances_prior_as_of,
    period_activity,
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

/**
 * Document Composer provenance envelope — professional AFS layout remains in
 * the certified Publication platform; this attaches CTB → statement → export trace.
 */
export function buildDocumentComposerProvenance(params: {
  canonical_tb_id: string | null;
  fact_snapshot_id: string | null;
  snapshot_version_id: string | null;
  statement_instance_ids?: string[];
  publication_pack_id?: string | null;
  source_kind?: SourceKind | null;
}) {
  return {
    schema_version: FRP_SCHEMA_VERSION,
    composer: "efs_document_composer",
    trace: [
      "journal_or_import",
      "ledger_or_mapping",
      "trial_balance",
      "canonical_trial_balance",
      "financial_reporting_engine",
      "statement_line",
      "document_composer",
      "export",
    ],
    canonical_tb_id: params.canonical_tb_id,
    fact_snapshot_id: params.fact_snapshot_id,
    snapshot_version_id: params.snapshot_version_id,
    statement_instance_ids: params.statement_instance_ids || [],
    publication_pack_id: params.publication_pack_id || null,
    source_kind: params.source_kind || null,
  };
}
