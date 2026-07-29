// ERP Phase 2 — Enterprise Accounting Health Engine (pure, advisory).
// Continuously analyses the accounting foundation. Never blocks posting.
// Mirrors supabase/functions/_shared/accountingHealth/evaluate.ts

import type {
  AccountingHealthReport,
  HealthDomainKey,
  HealthDomainScore,
  HealthFinding,
  HealthStatus,
} from './model.ts';
import { HEALTH_DOMAIN_LABELS, HEALTH_DOMAIN_ORDER } from './model.ts';

export type HealthAccount = {
  id: string;
  name: string;
  type: string;
  account_number?: number | null;
  account_code?: string | null;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  parent_account_id?: string | null;
  control_account?: boolean | null;
  system_account?: boolean | null;
  allow_manual_posting?: boolean | null;
  posting_blocked?: boolean | null;
  is_active?: boolean | null;
  tax_treatment?: string | null;
  financial_statement?: string | null;
  normal_balance?: string | null;
  balance?: number | null;
};

export type HealthBankAccount = {
  id: string;
  name: string;
  is_default?: boolean | null;
  chart_of_account_id?: string | null;
  status?: string | null;
};

export type HealthFlags = {
  payroll_enabled?: boolean;
  fixed_assets_enabled?: boolean;
  inventory_enabled?: boolean;
};

export type HealthInput = {
  accounts: HealthAccount[];
  bankAccounts: HealthBankAccount[];
  postedAccountIds: string[];
  flags: HealthFlags;
  now?: string;
};

const DOMAIN_BASE = 100;

function finding(
  domain: HealthDomainKey,
  severity: HealthFinding['severity'],
  code: string,
  message: string,
  recommendation: string,
  extra?: Partial<HealthFinding>,
): HealthFinding {
  return {
    id: `${domain}:${code}:${extra?.accountId ?? 'global'}`,
    domain,
    severity,
    code,
    message,
    recommendation,
    ...extra,
  };
}

function isHeaderAccount(account: HealthAccount, childParentIds: Set<string>): boolean {
  return account.posting_blocked === true || childParentIds.has(account.id);
}

function hasAccountRole(account: HealthAccount, roles: string | string[]): boolean {
  const list = Array.isArray(roles) ? roles : [roles];
  return !!account.account_role && list.includes(account.account_role);
}

function scoreDomain(
  domain: HealthDomainKey,
  findings: HealthFinding[],
  applicable: boolean,
): HealthDomainScore {
  if (!applicable) {
    return {
      domain,
      label: HEALTH_DOMAIN_LABELS[domain],
      score: DOMAIN_BASE,
      maxScore: DOMAIN_BASE,
      percent: 100,
      findings: [],
      applicable: false,
    };
  }

  let penalty = 0;
  for (const f of findings) {
    if (f.severity === 'critical') penalty += 18;
    else if (f.severity === 'warning') penalty += 8;
    else penalty += 2;
  }
  const score = Math.max(0, DOMAIN_BASE - penalty);
  return {
    domain,
    label: HEALTH_DOMAIN_LABELS[domain],
    score,
    maxScore: DOMAIN_BASE,
    percent: score,
    findings,
    applicable: true,
  };
}

function overallStatus(percent: number, critical: number): HealthStatus {
  if (critical > 0 || percent < 70) return 'Critical';
  if (percent < 90) return 'Needs Attention';
  return 'Healthy';
}

export function evaluateAccountingHealth(input: HealthInput): AccountingHealthReport {
  const accounts = input.accounts ?? [];
  const banks = input.bankAccounts ?? [];
  const posted = new Set(input.postedAccountIds ?? []);
  const flags = input.flags ?? {};
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const childParents = new Set(
    accounts.map((a) => a.parent_account_id).filter((id): id is string => !!id),
  );

  const domainFindings: Record<HealthDomainKey, HealthFinding[]> = {
    chart_of_accounts: [],
    general_ledger: [],
    financial_statements: [],
    tax: [],
    banking: [],
    payroll: [],
    assets: [],
    double_entry: [],
  };

  // ── Chart of Accounts ───────────────────────────────────────────────────
  const codeCounts = new Map<string, HealthAccount[]>();
  const numberCounts = new Map<number, HealthAccount[]>();
  const nameCounts = new Map<string, HealthAccount[]>();

  for (const account of accounts) {
    if (account.account_code) {
      const list = codeCounts.get(account.account_code) ?? [];
      list.push(account);
      codeCounts.set(account.account_code, list);
    }
    if (account.account_number != null) {
      const list = numberCounts.get(account.account_number) ?? [];
      list.push(account);
      numberCounts.set(account.account_number, list);
    }
    const key = account.name.trim().toLowerCase();
    const list = nameCounts.get(key) ?? [];
    list.push(account);
    nameCounts.set(key, list);
  }

  for (const [code, list] of codeCounts) {
    if (list.length > 1) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'critical',
          'DUPLICATE_ACCOUNT_CODE',
          `Duplicate account code "${code}" (${list.length} accounts).`,
          'Merge or renumber duplicate codes so each code is unique.',
          { accountId: list[0].id, accountName: list[0].name },
        ),
      );
    }
  }
  for (const [num, list] of numberCounts) {
    if (list.length > 1) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'critical',
          'DUPLICATE_ACCOUNT_NUMBER',
          `Duplicate account number ${num} (${list.length} accounts).`,
          'Assign unique account numbers across the chart.',
          { accountId: list[0].id, accountName: list[0].name },
        ),
      );
    }
  }
  for (const [, list] of nameCounts) {
    if (list.length > 1) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'warning',
          'DUPLICATE_ACCOUNT_NAME',
          `Duplicate account name "${list[0].name}".`,
          'Rename duplicates to avoid posting and reporting confusion.',
          { accountId: list[0].id, accountName: list[0].name },
        ),
      );
    }
  }

  const mandatoryRoles: { code: string; label: string; check: (a: HealthAccount) => boolean }[] = [
    {
      code: 'MISSING_TRADE_DEBTORS',
      label: 'Trade Debtors',
      check: (a) => hasAccountRole(a, 'trade_receivable') || a.account_code === '1220',
    },
    {
      code: 'MISSING_TRADE_CREDITORS',
      label: 'Trade Creditors',
      check: (a) => hasAccountRole(a, 'trade_payable') || a.account_code === '2110',
    },
    {
      code: 'MISSING_RETAINED_EARNINGS',
      label: 'Retained Earnings',
      check: (a) => hasAccountRole(a, 'retained_earnings') || a.system_account === true || a.account_code === '3020',
    },
    {
      code: 'MISSING_BANK_GL',
      label: 'Bank / Cash',
      check: (a) =>
        a.account_role === 'bank' ||
        a.account_role === 'cash' ||
        a.subcategory === 'Cash and Cash Equivalents',
    },
  ];
  for (const item of mandatoryRoles) {
    if (!accounts.some((a) => a.is_active !== false && item.check(a))) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'critical',
          item.code,
          `Missing mandatory account: ${item.label}.`,
          `Add a ${item.label} account to the Chart of Accounts.`,
        ),
      );
    }
  }

  for (const account of accounts) {
    if (account.parent_account_id && !byId.has(account.parent_account_id)) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'critical',
          'MISSING_PARENT',
          `"${account.name}" references a missing parent account.`,
          'Repair hierarchy: re-link or clear the parent reference.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  // Broken hierarchy cycles (simple parent walk)
  for (const account of accounts) {
    const seen = new Set<string>();
    let cursor: string | null | undefined = account.parent_account_id;
    let depth = 0;
    while (cursor && depth < 20) {
      if (seen.has(cursor) || cursor === account.id) {
        domainFindings.chart_of_accounts.push(
          finding(
            'chart_of_accounts',
            'critical',
            'BROKEN_HIERARCHY',
            `"${account.name}" is part of a broken parent hierarchy (cycle).`,
            'Break the parent cycle so the chart forms a valid tree.',
            { accountId: account.id, accountName: account.name },
          ),
        );
        break;
      }
      seen.add(cursor);
      cursor = byId.get(cursor)?.parent_account_id;
      depth += 1;
    }
  }

  // Abnormal numbering: gaps are OK; out-of-range for type is advisory
  for (const account of accounts) {
    const n = account.account_number;
    if (n == null) continue;
    const expected =
      account.type === 'Asset'
        ? n >= 1000 && n < 2000
        : account.type === 'Liability'
          ? n >= 2000 && n < 3000
          : account.type === 'Equity'
            ? n >= 3000 && n < 4000
            : account.type === 'Income'
              ? n >= 4000 && n < 5000
              : account.type === 'Expense'
                ? n >= 5000 && n < 9000
                : true;
    if (!expected) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'info',
          'ABNORMAL_NUMBERING',
          `"${account.name}" (${n}) is outside the conventional range for ${account.type}.`,
          'Consider renumbering to match your chart numbering convention.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  for (const account of accounts) {
    if (account.control_account && !posted.has(account.id)) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'info',
          'UNUSED_CONTROL_ACCOUNT',
          `Control account "${account.name}" has never been posted to.`,
          'Confirm the control account is required, or deactivate if obsolete.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  // Posting to header accounts
  for (const account of accounts) {
    if (isHeaderAccount(account, childParents) && posted.has(account.id)) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'critical',
          'POSTING_TO_HEADER',
          `Header/summary account "${account.name}" has posting activity.`,
          'Reverse header postings and post to detail accounts instead.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  // Inactive accounts referenced (posted)
  for (const account of accounts) {
    if (account.is_active === false && posted.has(account.id)) {
      domainFindings.chart_of_accounts.push(
        finding(
          'chart_of_accounts',
          'warning',
          'INACTIVE_ACCOUNT_REFERENCED',
          `Inactive account "${account.name}" has historical or current postings.`,
          'Keep inactive for history, but ensure no new postings target it.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  // ── Double Entry foundations ────────────────────────────────────────────
  const hasRetained = accounts.some(
    (a) => hasAccountRole(a, 'retained_earnings') || a.system_account === true || a.account_code === '3020',
  );
  const hasCurrentYear =
    accounts.some((a) => a.type === 'Income') && accounts.some((a) => a.type === 'Expense');
  const hasOpeningBalance = accounts.some(
    (a) => a.account_code === '3010' || (a.type === 'Equity' && a.subcategory === 'Issued Capital'),
  );
  const suspense = accounts.filter((a) => hasAccountRole(a, 'suspense'));

  if (!hasRetained) {
    domainFindings.double_entry.push(
      finding(
        'double_entry',
        'critical',
        'RETAINED_EARNINGS_MISSING',
        'Retained earnings is not configured.',
        'Add a Retained Earnings equity account for year-end close.',
      ),
    );
  }
  if (!hasCurrentYear) {
    domainFindings.double_entry.push(
      finding(
        'double_entry',
        'warning',
        'CURRENT_YEAR_EARNINGS_MISSING',
        'Current year earnings / P&L structure is incomplete.',
        'Ensure Income and Expense accounts exist for current-year earnings.',
      ),
    );
  }
  if (!hasOpeningBalance) {
    domainFindings.double_entry.push(
      finding(
        'double_entry',
        'info',
        'OPENING_BALANCE_ACCOUNT_MISSING',
        'No dedicated opening balance equity account was found.',
        'Add an Opening Balance Equity account if you migrate opening balances.',
      ),
    );
  }
  for (const account of suspense) {
    const bal = Math.abs(account.balance ?? 0);
    if (bal > 0.009) {
      domainFindings.double_entry.push(
        finding(
          'double_entry',
          'critical',
          'SUSPENSE_NOT_EMPTY',
          `Suspense account "${account.name}" has a balance of ${bal.toFixed(2)}.`,
          'Clear suspense by posting correcting journals to proper accounts.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    } else {
      domainFindings.double_entry.push(
        finding(
          'double_entry',
          'info',
          'SUSPENSE_PRESENT',
          `Suspense account "${account.name}" exists (currently empty).`,
          'Keep suspense cleared before period close.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  // Control accounts that allow unrestricted manual posting (quality risk)
  for (const account of accounts) {
    if (account.control_account && account.allow_manual_posting !== false) {
      domainFindings.double_entry.push(
        finding(
          'double_entry',
          'warning',
          'CONTROL_ALLOWS_MANUAL',
          `Control account "${account.name}" allows manual journal posting.`,
          'Disable manual posting on control accounts so only owning modules post.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  // ── Financial Statements ────────────────────────────────────────────────
  for (const account of accounts) {
    if (account.is_active === false) continue;
    if (isHeaderAccount(account, childParents)) continue;
    if (!account.financial_statement) {
      domainFindings.financial_statements.push(
        finding(
          'financial_statements',
          'warning',
          'ORPHAN_FS_MAPPING',
          `"${account.name}" has no financial statement mapping.`,
          'Assign Statement of Financial Position or Profit or Loss.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  const postingCandidates = accounts.filter(
    (a) => a.is_active !== false && !isHeaderAccount(a, childParents),
  );
  for (const account of postingCandidates) {
    if (!account.financial_statement) continue;
    const ok =
      (['Asset', 'Liability', 'Equity'].includes(account.type) &&
        account.financial_statement === 'Statement of Financial Position') ||
      (['Income', 'Expense'].includes(account.type) &&
        account.financial_statement === 'Profit or Loss');
    if (!ok) {
      domainFindings.financial_statements.push(
        finding(
          'financial_statements',
          'warning',
          'FS_MAPPING_MISMATCH',
          `"${account.name}" (${account.type}) maps to "${account.financial_statement}".`,
          'Correct financial_statement so type and statement classification agree.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  // ── General Ledger ──────────────────────────────────────────────────────
  for (const account of accounts) {
    if (account.is_active === false) continue;
    if (isHeaderAccount(account, childParents)) continue;
    if (!posted.has(account.id)) {
      domainFindings.general_ledger.push(
        finding(
          'general_ledger',
          'info',
          'ACCOUNT_NEVER_POSTED',
          `"${account.name}" has never been posted to.`,
          'Deactivate unused accounts or leave them for future use.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  for (const account of accounts) {
    if (
      account.control_account &&
      account.allow_manual_posting === false &&
      posted.has(account.id)
    ) {
      // Expected for module postings — only warn if we cannot distinguish.
      // Advisory: presence is fine; flag if balance looks like manual abuse is N/A.
    }
    if (!['Asset', 'Liability', 'Equity', 'Income', 'Expense'].includes(account.type)) {
      domainFindings.general_ledger.push(
        finding(
          'general_ledger',
          'critical',
          'INVALID_ACCOUNT_TYPE',
          `"${account.name}" has invalid account type "${account.type}".`,
          'Correct the account type to one of Asset, Liability, Equity, Income, Expense.',
          { accountId: account.id, accountName: account.name },
        ),
      );
    }
  }

  // Cap GL "never posted" noise — keep first 15 as findings, summarize rest
  if (domainFindings.general_ledger.filter((f) => f.code === 'ACCOUNT_NEVER_POSTED').length > 15) {
    const never = domainFindings.general_ledger.filter((f) => f.code === 'ACCOUNT_NEVER_POSTED');
    const kept = never.slice(0, 15);
    const rest = never.length - 15;
    domainFindings.general_ledger = [
      ...domainFindings.general_ledger.filter((f) => f.code !== 'ACCOUNT_NEVER_POSTED'),
      ...kept,
      finding(
        'general_ledger',
        'info',
        'ACCOUNT_NEVER_POSTED_SUMMARY',
        `${rest} additional unused accounts omitted from detail.`,
        'Review unused accounts in Chart of Accounts maintenance.',
      ),
    ];
  }

  // ── Banking ─────────────────────────────────────────────────────────────
  const defaults = banks.filter((b) => b.is_default);
  if (defaults.length > 1) {
    domainFindings.banking.push(
      finding(
        'banking',
        'warning',
        'MULTIPLE_DEFAULT_BANKS',
        `${defaults.length} bank accounts are marked as default.`,
        'Keep exactly one default bank account.',
      ),
    );
  }

  const cashGl = accounts.filter(
    (a) =>
      a.is_active !== false &&
      (a.account_role === 'bank' ||
        a.account_role === 'cash' ||
        a.subcategory === 'Cash and Cash Equivalents'),
  );
  if (cashGl.length === 0 && banks.length === 0) {
    domainFindings.banking.push(
      finding(
        'banking',
        'warning',
        'MISSING_CASH_ACCOUNTS',
        'No cash or bank GL accounts were found.',
        'Create Bank / Cash GL accounts or link bank accounts to the chart.',
      ),
    );
  }

  for (const bank of banks) {
    if (!bank.chart_of_account_id || !byId.has(bank.chart_of_account_id)) {
      domainFindings.banking.push(
        finding(
          'banking',
          'critical',
          'UNLINKED_BANK_GL',
          `Bank account "${bank.name}" is not linked to a valid GL account.`,
          'Link the bank account to an Asset GL account.',
        ),
      );
    } else {
      const gl = byId.get(bank.chart_of_account_id)!;
      if (gl.type !== 'Asset') {
        domainFindings.banking.push(
          finding(
            'banking',
            'warning',
            'BANK_GL_WRONG_TYPE',
            `Bank "${bank.name}" links to non-Asset GL "${gl.name}".`,
            'Relink to an Asset cash/bank account.',
            { accountId: gl.id, accountName: gl.name },
          ),
        );
      }
      if (gl.is_active === false) {
        domainFindings.banking.push(
          finding(
            'banking',
            'warning',
            'BANK_GL_INACTIVE',
            `Bank "${bank.name}" links to inactive GL "${gl.name}".`,
            'Reactivate the GL account or relink the bank account.',
            { accountId: gl.id, accountName: gl.name },
          ),
        );
      }
    }
  }

  // ── Tax ─────────────────────────────────────────────────────────────────
  const hasVatControl = accounts.some((a) => hasAccountRole(a, 'vat_control') || a.tax_treatment === 'vat_control');
  const hasVatOutput = accounts.some((a) => hasAccountRole(a, 'output_vat') || a.tax_treatment === 'vat_output');
  const hasVatInput = accounts.some((a) => hasAccountRole(a, 'input_vat') || a.tax_treatment === 'vat_input');
  const hasTaxPayable = accounts.some(
    (a) =>
      hasAccountRole(a, ['output_vat', 'vat_control']) ||
      a.tax_treatment === 'vat_output' ||
      a.tax_treatment === 'vat_control',
  );

  if (!hasVatControl && !hasVatOutput && !hasVatInput) {
    domainFindings.tax.push(
      finding(
        'tax',
        'critical',
        'MISSING_VAT_ACCOUNTS',
        'No VAT accounts were found in the Chart of Accounts.',
        'Add VAT Input, VAT Output, and/or VAT Control accounts.',
      ),
    );
  } else {
    if (!hasVatOutput) {
      domainFindings.tax.push(
        finding(
          'tax',
          'warning',
          'MISSING_OUTPUT_VAT',
          'Output VAT account is missing.',
          'Add a VAT Output (Payable) liability account.',
        ),
      );
    }
    if (!hasVatInput) {
      domainFindings.tax.push(
        finding(
          'tax',
          'warning',
          'MISSING_INPUT_VAT',
          'Input VAT account is missing.',
          'Add a VAT Input (Receivable) asset account.',
        ),
      );
    }
    if (!hasTaxPayable) {
      domainFindings.tax.push(
        finding(
          'tax',
          'warning',
          'MISSING_TAX_PAYABLE',
          'No tax payable / VAT control liability was found.',
          'Configure VAT Control or VAT Output as tax payable.',
        ),
      );
    }
  }

  // ── Payroll (when enabled) ──────────────────────────────────────────────
  if (flags.payroll_enabled) {
    const payrollClearing = accounts.some((a) =>
      hasAccountRole(a, 'payroll_clearing') ||
      a.tax_treatment === 'paye' ||
      a.tax_treatment === 'uif' ||
      a.tax_treatment === 'sdl'
    );
    if (!payrollClearing) {
      domainFindings.payroll.push(
        finding(
          'payroll',
          'critical',
          'MISSING_PAYROLL_CLEARING',
          'Payroll is enabled but no payroll clearing / PAYE control account was found.',
          'Add Payroll Clearing or PAYE Payable and map payroll control accounts.',
        ),
      );
    }
  }

  // ── Assets (when enabled) ───────────────────────────────────────────────
  if (flags.fixed_assets_enabled) {
    const checks: { code: string; label: string; check: (a: HealthAccount) => boolean }[] = [
      {
        code: 'MISSING_ASSET_COST',
        label: 'Asset Cost / PPE',
        check: (a) =>
          hasAccountRole(a, 'fixed_asset') || a.subcategory === 'Property, Plant and Equipment',
      },
      {
        code: 'MISSING_ACCUM_DEP',
        label: 'Accumulated Depreciation',
        check: (a) => hasAccountRole(a, 'accumulated_depreciation') || a.account_code === '1190',
      },
      {
        code: 'MISSING_DEP_EXPENSE',
        label: 'Depreciation Expense',
        check: (a) => hasAccountRole(a, 'depreciation_expense') || a.account_code === '6060',
      },
      {
        code: 'MISSING_DISPOSAL',
        label: 'Disposal / Profit or Loss on Disposal',
        check: (a) =>
          hasAccountRole(a, ['gain_on_disposal', 'loss_on_disposal']) ||
          a.account_code === '4530' ||
          a.account_code === '8020',
      },
    ];
    for (const check of checks) {
      if (!accounts.some((a) => check.check(a))) {
        domainFindings.assets.push(
          finding(
            'assets',
            'warning',
            check.code,
            `Fixed assets enabled but missing: ${check.label}.`,
            `Add a ${check.label} account to support the asset lifecycle.`,
          ),
        );
      }
    }
  }

  const domains = {} as Record<HealthDomainKey, HealthDomainScore>;
  for (const key of HEALTH_DOMAIN_ORDER) {
    const applicable =
      key === 'payroll'
        ? !!flags.payroll_enabled
        : key === 'assets'
          ? !!flags.fixed_assets_enabled
          : true;
    domains[key] = scoreDomain(key, domainFindings[key], applicable);
  }

  const applicableDomains = HEALTH_DOMAIN_ORDER.filter((k) => domains[k].applicable);
  const overallScore =
    applicableDomains.length === 0
      ? 100
      : Math.round(
          applicableDomains.reduce((sum, k) => sum + domains[k].percent, 0) /
            applicableDomains.length,
        );

  const allFindings = applicableDomains.flatMap((k) => domains[k].findings);
  const findingCount = {
    critical: allFindings.filter((f) => f.severity === 'critical').length,
    warning: allFindings.filter((f) => f.severity === 'warning').length,
    info: allFindings.filter((f) => f.severity === 'info').length,
  };

  const warnings = allFindings.filter((f) => f.severity !== 'info');
  const recommendations = Array.from(
    new Set(
      [...allFindings]
        .sort((a, b) => {
          const rank = { critical: 0, warning: 1, info: 2 };
          return rank[a.severity] - rank[b.severity];
        })
        .map((f) => f.recommendation),
    ),
  ).slice(0, 12);

  return {
    overallScore,
    status: accounts.length === 0 ? 'Not Assessed' : overallStatus(overallScore, findingCount.critical),
    domains,
    warnings,
    recommendations,
    findingCount,
    assessedAt: input.now ?? new Date().toISOString(),
  };
}
