// ERP Phase 3 — Accounting Policy Engine (pure evaluator for tests + edge mirror).
// Mirrors supabase/functions/_shared/accountingPolicyEngine/evaluate.ts

import type {
  PolicyDomainKey,
  PolicyEvaluationResult,
  PolicySeverity,
  PolicyViolation,
} from './model';

export type PolicyAccount = {
  id: string;
  name: string;
  account_code?: string | null;
  account_role?: string | null;
  subcategory?: string | null;
  parent_account_id?: string | null;
  control_account?: boolean | null;
  system_account?: boolean | null;
  allow_manual_posting?: boolean | null;
  posting_blocked?: boolean | null;
  tax_treatment?: string | null;
};

export type PolicyBankAccount = {
  id: string;
  chart_of_account_id?: string | null;
};

export type PolicyDefinitionInput = {
  code: string;
  name: string;
  domain: PolicyDomainKey;
  defaultSeverity: PolicySeverity;
  isMandatory: boolean;
  enabled: boolean;
  severityOverride?: PolicySeverity | null;
  evaluationHook: string;
};

export type PolicyPostingInput = {
  module: string;
  lines: Array<{ account_id: string; debit?: number; credit?: number }>;
  description?: string | null;
  overrideReason?: string | null;
  overrideCodes?: string[];
};

function effectiveSeverity(
  def: PolicyDefinitionInput,
): PolicySeverity | null {
  if (!def.enabled && !def.isMandatory) return null;
  if (def.isMandatory) return def.defaultSeverity;
  return def.severityOverride ?? def.defaultSeverity;
}

function violation(
  def: PolicyDefinitionInput,
  message: string,
  severity: PolicySeverity,
): PolicyViolation {
  return {
    code: def.code,
    name: def.name,
    domain: def.domain,
    severity,
    message,
  };
}

function passedEntry(def: PolicyDefinitionInput, severity: PolicySeverity, overridden = false): PolicyViolation {
  return {
    code: def.code,
    name: def.name,
    domain: def.domain,
    severity,
    message: overridden ? 'Overridden' : 'Passed',
    overridden,
  };
}

function isRetainedEarnings(account: PolicyAccount): boolean {
  return (
    account.system_account === true
    || account.account_role === 'retained_earnings'
    || account.account_code === '3020'
  );
}

function isVatControl(account: PolicyAccount): boolean {
  return account.tax_treatment === 'vat_control' || account.account_role === 'vat_control';
}

function isDepreciationAccount(account: PolicyAccount): boolean {
  return (
    account.account_role === 'depreciation_expense'
    || account.account_role === 'accumulated_depreciation'
  );
}

function isInventoryAccount(account: PolicyAccount): boolean {
  return account.account_role === 'inventory_asset' || account.account_role === 'cogs';
}

function isBankAccount(account: PolicyAccount): boolean {
  return (
    account.account_role === 'bank' ||
    account.account_role === 'cash' ||
    account.subcategory === 'Cash and Cash Equivalents'
  );
}

function isHeaderAccount(account: PolicyAccount, childParentIds: Set<string>): boolean {
  return account.posting_blocked === true || childParentIds.has(account.id);
}

export function evaluateAccountingPolicies(
  definitions: PolicyDefinitionInput[],
  accounts: PolicyAccount[],
  bankAccounts: PolicyBankAccount[],
  posting: PolicyPostingInput,
  now = new Date().toISOString(),
): PolicyEvaluationResult {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const childParentIds = new Set(
    accounts.map((a) => a.parent_account_id).filter(Boolean) as string[],
  );

  const bankGlCounts = new Map<string, number>();
  for (const ba of bankAccounts) {
    if (!ba.chart_of_account_id) continue;
    bankGlCounts.set(ba.chart_of_account_id, (bankGlCounts.get(ba.chart_of_account_id) ?? 0) + 1);
  }

  const passed: PolicyViolation[] = [];
  const violations: PolicyViolation[] = [];
  const warnings: PolicyViolation[] = [];
  let blocking = false;

  const inventoryModules = new Set(['inventory_receipt', 'inventory_issue']);
  const assetModules = new Set(['fixed_assets']);

  for (const def of definitions) {
    const severity = effectiveSeverity(def);
    if (!severity) continue;

    const overridden = Boolean(
      posting.overrideReason
      && posting.overrideCodes?.includes(def.code)
      && ['information', 'warning', 'error'].includes(severity)
      && !def.isMandatory,
    );

    let message: string | null = null;

    switch (def.evaluationHook) {
      case 'header_no_posting':
        for (const line of posting.lines) {
          const account = accountById.get(line.account_id);
          if (account && isHeaderAccount(account, childParentIds)) {
            message = `Account ${account.name} is a header account and cannot receive postings.`;
            break;
          }
        }
        break;

      case 'control_no_manual':
        if (posting.module === 'manual_journal') {
          for (const line of posting.lines) {
            const account = accountById.get(line.account_id);
            if (account?.control_account && !account.allow_manual_posting) {
              message = `Control account ${account.name} does not accept manual journal postings.`;
              break;
            }
          }
        }
        break;

      case 'retained_earnings_system':
        if (posting.module === 'manual_journal') {
          for (const line of posting.lines) {
            const account = accountById.get(line.account_id);
            if (account && isRetainedEarnings(account)) {
              message = `Retained earnings account ${account.name} is system controlled.`;
              break;
            }
          }
        }
        break;

      case 'vat_control_no_manual':
        if (posting.module === 'manual_journal') {
          for (const line of posting.lines) {
            const account = accountById.get(line.account_id);
            if (account && isVatControl(account)) {
              message = `VAT control account ${account.name} cannot be manually adjusted.`;
              break;
            }
          }
        }
        break;

      case 'depreciation_module_only':
        if (!assetModules.has(posting.module)) {
          for (const line of posting.lines) {
            const account = accountById.get(line.account_id);
            if (account && isDepreciationAccount(account)) {
              message = `Depreciation account ${account.name} may only be posted from the Fixed Assets module.`;
              break;
            }
          }
        }
        break;

      case 'inventory_module_only':
        if (!inventoryModules.has(posting.module)) {
          for (const line of posting.lines) {
            const account = accountById.get(line.account_id);
            if (account && isInventoryAccount(account)) {
              message = `Inventory account ${account.name} may only be posted from the Inventory module.`;
              break;
            }
          }
        }
        break;

      case 'bank_gl_one_to_one': {
        const dup = [...bankGlCounts.entries()].find(([, count]) => count > 1);
        if (dup) {
          message = 'One or more bank GL accounts are linked to multiple bank accounts.';
          break;
        }
        for (const line of posting.lines) {
          const account = accountById.get(line.account_id);
          if (account && isBankAccount(account)) {
            const linked = bankAccounts.some((ba) => ba.chart_of_account_id === account.id);
            if (!linked) {
              message = `Bank GL account ${account.name} has no linked operational bank account.`;
              break;
            }
          }
        }
        break;
      }

      case 'manual_requires_description':
        if (posting.module === 'manual_journal' && !posting.description?.trim()) {
          message = 'Manual journal postings should include a description.';
        }
        break;

      default:
        break;
    }

    if (!message) {
      passed.push(passedEntry(def, severity, false));
      continue;
    }

    if (overridden) {
      passed.push(passedEntry(def, severity, true));
      continue;
    }

    const item = violation(def, message, severity);
    if (severity === 'blocking' || severity === 'error') {
      blocking = true;
      violations.push(item);
    } else {
      warnings.push(item);
    }
  }

  return { passed, violations, warnings, blocking, evaluatedAt: now };
}
