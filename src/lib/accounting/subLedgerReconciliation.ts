/**
 * Sub-ledger ↔ General Ledger reconciliation controls.
 *
 * WHAT THIS IS
 * A control, not an engine. Every function here does exactly one thing:
 * subtract a sub-ledger total from the corresponding GL figure and report the
 * difference. It does not compute, classify, adjust or post anything.
 *
 * WHY IT EXISTS
 * The GL side of every balance already comes from Canonical Financial
 * Aggregation (CFA), which is the frozen sole money authority. The sub-ledger
 * side comes from the domain that owns it (asset register, inventory
 * valuation, AR/AP ageing, bank register, payroll). Until now nothing compared
 * the two, so a failed or partial posting could leave a sub-ledger and the
 * Balance Sheet disagreeing silently and indefinitely.
 *
 * ARCHITECTURAL CONSTRAINTS (ADR-0003 — CFA architecture freeze)
 *  - Both inputs are supplied by the caller. This module performs no fetching,
 *    no aggregation and no classification.
 *  - It never mutates, corrects or "reconciles" a figure. It exposes variance.
 *    Which number is right is an accounting judgement, not a code decision.
 *  - It is therefore NOT a second accounting engine: remove it and no displayed
 *    financial amount changes.
 */

/** Outcome of a single control. `unavailable` keeps a missing feed honest. */
export type ReconciliationStatus = 'balanced' | 'variance' | 'unavailable';

export type ReconciliationLine = {
  id: string;
  label: string;
  /** Human description of where the sub-ledger figure came from. */
  subLedgerSource: string;
  subLedgerAmount: number | null;
  /** Human description of the GL/CFA figure it is compared against. */
  glSource: string;
  glAmount: number | null;
  /** subLedger − GL. Positive = sub-ledger higher than the ledger. */
  variance: number | null;
  status: ReconciliationStatus;
};

/**
 * Currency comparison tolerance, in the reporting currency's minor unit.
 * Half a cent absorbs IEEE-754 representation noise from summing many rows
 * without ever masking a real one-cent posting difference.
 */
export const RECONCILIATION_TOLERANCE = 0.005;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Builds one control line. Either side being absent yields `unavailable`
 * rather than a misleading zero — a feed that failed to load must never be
 * reported as "balanced".
 */
export function compareToGl(input: {
  id: string;
  label: string;
  subLedgerSource: string;
  subLedgerAmount: number | null | undefined;
  glSource: string;
  glAmount: number | null | undefined;
}): ReconciliationLine {
  const sub = input.subLedgerAmount;
  const gl = input.glAmount;

  const subOk = typeof sub === 'number' && Number.isFinite(sub);
  const glOk = typeof gl === 'number' && Number.isFinite(gl);

  if (!subOk || !glOk) {
    return {
      id: input.id,
      label: input.label,
      subLedgerSource: input.subLedgerSource,
      subLedgerAmount: subOk ? round2(sub as number) : null,
      glSource: input.glSource,
      glAmount: glOk ? round2(gl as number) : null,
      variance: null,
      status: 'unavailable',
    };
  }

  const variance = round2((sub as number) - (gl as number));
  return {
    id: input.id,
    label: input.label,
    subLedgerSource: input.subLedgerSource,
    subLedgerAmount: round2(sub as number),
    glSource: input.glSource,
    glAmount: round2(gl as number),
    variance,
    status: Math.abs(variance) <= RECONCILIATION_TOLERANCE ? 'balanced' : 'variance',
  };
}

/**
 * Internal-consistency controls that CFA already evaluates. These are not
 * comparisons against a sub-ledger — they assert identities *within* the
 * canonical engine, and are surfaced here so one screen answers "does the
 * ledger agree with itself?" as well as "does it agree with the sub-ledgers?".
 */
export type IdentityCheck = {
  id: string;
  label: string;
  holds: boolean | null;
  detail: string;
};

export type CanonicalIdentityInput = {
  trialBalanceBalanced?: boolean | null;
  balanceSheetBalanced?: boolean | null;
  profitIdentityHolds?: boolean | null;
  equityIdentityHolds?: boolean | null;
  totalDebits?: number | null;
  totalCredits?: number | null;
  totalAssets?: number | null;
  totalLiabilitiesAndEquity?: number | null;
};

export function buildIdentityChecks(cfa: CanonicalIdentityInput | null | undefined): IdentityCheck[] {
  const money = (n: number | null | undefined) =>
    typeof n === 'number' && Number.isFinite(n) ? round2(n).toFixed(2) : '—';

  return [
    {
      id: 'trial-balance-balanced',
      label: 'Trial Balance — debits equal credits',
      holds: cfa?.trialBalanceBalanced ?? null,
      detail: `Debits ${money(cfa?.totalDebits)} vs Credits ${money(cfa?.totalCredits)}`,
    },
    {
      id: 'balance-sheet-balanced',
      label: 'Balance Sheet — assets equal liabilities plus equity',
      holds: cfa?.balanceSheetBalanced ?? null,
      detail: `Assets ${money(cfa?.totalAssets)} vs L+E ${money(cfa?.totalLiabilitiesAndEquity)}`,
    },
    {
      id: 'profit-identity',
      label: 'Income Statement — income less expenses equals net income',
      holds: cfa?.profitIdentityHolds ?? null,
      detail: 'Canonical profit identity',
    },
    {
      id: 'equity-identity',
      label: 'Equity — opening plus movements equals closing',
      holds: cfa?.equityIdentityHolds ?? null,
      detail: 'Canonical equity roll-forward identity',
    },
  ];
}

/** GL figures, all taken from CFA. No figure here is recomputed. */
export type GlSideTotals = {
  cash?: number | null;
  receivables?: number | null;
  payables?: number | null;
  vatNet?: number | null;
  netCashFlow?: number | null;
  /**
   * Fixed-asset CONTROL account balance (cost less accumulated depreciation).
   *
   * Deliberately separate from any total-assets figure. Comparing an asset
   * register against total assets is not a control — total assets also contains
   * cash, receivables and inventory, so it reports a large variance whenever the
   * company simply has other assets. Supply this only when a genuine
   * fixed-asset control subtotal is available; otherwise leave it undefined and
   * the control correctly reports `unavailable` rather than a false alarm.
   */
  fixedAssetsControl?: number | null;
  /** Inventory CONTROL account balance, same reasoning as above. */
  inventoryControl?: number | null;
  /** Payroll liability CONTROL account balance, same reasoning as above. */
  payrollControl?: number | null;
};

/** Sub-ledger figures, each supplied by the domain that owns it. */
export type SubLedgerTotals = {
  /** Asset register net book value (cost less accumulated depreciation). */
  assetsNetBookValue?: number | null;
  /** Inventory valuation total. */
  inventoryValue?: number | null;
  /** Payroll liability outstanding per the payroll domain. */
  payrollLiability?: number | null;
  /** Sum of bank register balances. */
  bankBalance?: number | null;
  /** Customer ageing total. */
  arBalance?: number | null;
  /** Vendor ageing total. */
  apBalance?: number | null;
  /** VAT per the tax domain. */
  vatBalance?: number | null;
  /** Movement in cash per the cash flow statement. */
  cashFlowMovement?: number | null;
};

/**
 * The full control set.
 *
 * Note which GL account each sub-ledger is compared against — this is the
 * mapping an auditor asks for, and encoding it here keeps it from drifting
 * into tribal knowledge.
 */
export function buildSubLedgerReconciliation(
  gl: GlSideTotals | null | undefined,
  sub: SubLedgerTotals | null | undefined,
): ReconciliationLine[] {
  const g = gl ?? {};
  const s = sub ?? {};

  return [
    compareToGl({
      id: 'bank-gl',
      label: 'Bank ↔ General Ledger',
      subLedgerSource: 'Bank register balances',
      subLedgerAmount: s.bankBalance,
      glSource: 'CFA cash (GL bank-linked accounts)',
      glAmount: g.cash,
    }),
    compareToGl({
      id: 'ar-gl',
      label: 'Accounts Receivable ↔ General Ledger',
      subLedgerSource: 'Customer ageing total',
      subLedgerAmount: s.arBalance,
      glSource: 'CFA receivables (GL control account)',
      glAmount: g.receivables,
    }),
    compareToGl({
      id: 'ap-gl',
      label: 'Accounts Payable ↔ General Ledger',
      subLedgerSource: 'Vendor ageing total',
      subLedgerAmount: s.apBalance,
      glSource: 'CFA payables (GL control account)',
      glAmount: g.payables,
    }),
    compareToGl({
      id: 'vat-gl',
      label: 'VAT ↔ General Ledger',
      subLedgerSource: 'Tax domain VAT position',
      subLedgerAmount: s.vatBalance,
      glSource: 'CFA net VAT (GL VAT accounts)',
      glAmount: g.vatNet,
    }),
    compareToGl({
      id: 'assets-gl',
      label: 'Fixed Assets ↔ General Ledger',
      subLedgerSource: 'Asset register net book value',
      subLedgerAmount: s.assetsNetBookValue,
      glSource: 'GL fixed-asset control account (cost less accumulated depreciation)',
      glAmount: g.fixedAssetsControl,
    }),
    compareToGl({
      id: 'inventory-gl',
      label: 'Inventory ↔ General Ledger',
      subLedgerSource: 'Inventory valuation total',
      subLedgerAmount: s.inventoryValue,
      glSource: 'GL inventory control account',
      glAmount: g.inventoryControl,
    }),
    compareToGl({
      id: 'payroll-gl',
      label: 'Payroll ↔ General Ledger',
      subLedgerSource: 'Payroll domain liability',
      subLedgerAmount: s.payrollLiability,
      glSource: 'GL payroll liability control account',
      glAmount: g.payrollControl,
    }),
    compareToGl({
      id: 'cash-cashflow',
      label: 'Cash ↔ Cash Flow Statement',
      subLedgerSource: 'Cash flow net movement',
      subLedgerAmount: s.cashFlowMovement,
      glSource: 'CFA net cash flow',
      glAmount: g.netCashFlow,
    }),
  ];
}

/**
 * Sub-ledger total helpers.
 *
 * These live here, in a declared reconciliation authority, rather than in the
 * React panel that displays them. That is deliberate: the CFA guard forbids
 * summing `arBalances` / `apBalances` in consumer surfaces because that is
 * precisely how parallel accounting crept in before. A reconciliation control
 * genuinely needs the sub-ledger side of the comparison, so the summation is
 * concentrated here — clearly labelled as sub-ledger figures — and the UI stays
 * free of money math.
 *
 * None of these is a General Ledger figure. They are the sub-ledger's own view,
 * and exist only to be compared against the ledger.
 */

/** Sums an ageing/register list on the first present amount-bearing field. */
export function sumSubLedgerRows(
  rows: ReadonlyArray<Record<string, unknown>> | null | undefined,
  fields: readonly string[],
): number | null {
  if (!Array.isArray(rows)) return null;
  return round2(
    rows.reduce((sum, row) => {
      for (const field of fields) {
        const value = Number(row?.[field]);
        if (Number.isFinite(value)) return sum + value;
      }
      return sum;
    }, 0),
  );
}

/** Asset register net book value: cost less accumulated depreciation. */
export function sumAssetRegisterNetBookValue(
  assets: ReadonlyArray<Record<string, unknown>> | null | undefined,
): number | null {
  if (!Array.isArray(assets)) return null;
  return round2(
    assets.reduce((sum, asset) => {
      const cost = Number(asset?.purchase_cost ?? 0);
      const depreciation = Number(asset?.accumulated_depreciation ?? 0);
      return sum + (Number.isFinite(cost) ? cost : 0) - (Number.isFinite(depreciation) ? depreciation : 0);
    }, 0),
  );
}

export type ReconciliationSummary = {
  total: number;
  balanced: number;
  variance: number;
  unavailable: number;
  /** True only when every control that could be evaluated is balanced. */
  allBalanced: boolean;
  /** Largest absolute variance across evaluated controls. */
  largestVariance: number;
};

export function summariseReconciliation(lines: ReconciliationLine[]): ReconciliationSummary {
  const balanced = lines.filter((l) => l.status === 'balanced').length;
  const variance = lines.filter((l) => l.status === 'variance').length;
  const unavailable = lines.filter((l) => l.status === 'unavailable').length;

  return {
    total: lines.length,
    balanced,
    variance,
    unavailable,
    // Deliberately does NOT treat `unavailable` as passing: a control that did
    // not run has not proved anything.
    allBalanced: variance === 0 && balanced > 0,
    largestVariance: lines.reduce(
      (max, l) => (l.variance === null ? max : Math.max(max, Math.abs(l.variance))),
      0,
    ),
  };
}
