// Governance Foundation — Accounting Policies domain model.
//
// Phase G3.4 (third production migration) makes this domain the authoritative
// owner of Accounting Policies configuration. Only Materiality has a real
// company-wide persisted backing today (`company_materiality_settings`).
//
// Other Volume I §3.5 surfaces are modeled honestly:
//   • Currency / Inventory valuation — pass-through of CURRENT IMPLICIT
//     defaults already hardcoded in the product (ZAR / weighted_average).
//     These are not fabricated stores; they document today's behaviour.
//   • Tax default — pass-through of `tax_rates.is_default` (existing SoT).
//     The Tax governance *domain* remains dormant; only the default is
//     exposed here as an Accounting Policies concern.
//   • Depreciation / Default GL Accounts — no company-wide SoT exists
//     (G1 audit). Target shapes only; service methods are explicit stubs.
//   • Financial Reporting / narrative Accounting Policies — backed by the
//     existing EFS `efs_accounting_policy_sets` edge methods; Governance
//     becomes the access authority without changing composition/calculations.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

export interface MaterialitySettingsDomainModel {
  companyId: string;
  percentageThreshold: number;
  absoluteThreshold: number;
}

/** Implicit display / reporting currency today (formatCurrency + EFS wizards). */
export const IMPLICIT_DEFAULT_CURRENCY = 'ZAR' as const;

export interface CurrencyDefaultDomainModel {
  companyId: string;
  /** ISO 4217. Source: implicit product default — no companies.currency column. */
  defaultCurrency: typeof IMPLICIT_DEFAULT_CURRENCY;
  source: 'implicit_product_default';
}

export interface TaxDefaultDomainModel {
  companyId: string;
  taxRateId: string;
  name: string;
  rate: number;
  source: 'tax_rates.is_default';
}

/** Target shape only — no company-wide depreciation default table (G1). */
export interface DepreciationDefaultDomainModel {
  companyId: string;
  defaultMethod: 'straight-line' | 'reducing-balance';
  defaultUsefulLifeYears: number;
}

/** Implicit product-create / inventory-edge fallback today. */
export const IMPLICIT_INVENTORY_COST_METHOD = 'weighted_average' as const;

export interface InventoryValuationDefaultDomainModel {
  companyId: string;
  defaultCostMethod: typeof IMPLICIT_INVENTORY_COST_METHOD;
  source: 'implicit_product_default';
}

/** Target shape only — no company-wide default GL accounts object (G1). */
export interface DefaultGlAccountsDomainModel {
  companyId: string;
  accounts: Record<string, string>;
}

/**
 * Narrative / financial-reporting accounting policy set (EFS).
 * Mirrors the existing edge payload; Governance does not own composition.
 */
export interface FinancialReportingPolicySetDomainModel {
  id: string;
  workspaceId: string;
  title: string;
  status?: string;
  versionNo?: number;
  policies?: Array<{
    id: string;
    policyCode: string;
    title: string;
    body?: string;
    sortOrder?: number;
    status?: string;
  }>;
}

export interface ReportingDefaultsDomainModel {
  companyId: string;
  /** Pass-through of the same implicit currency used for display today. */
  reportingCurrency: typeof IMPLICIT_DEFAULT_CURRENCY;
  source: 'implicit_product_default';
}

// Validation model
export function validateMaterialitySettings(settings: Partial<MaterialitySettingsDomainModel>): ValidationResult {
  const errors: string[] = [];
  // Match MaterialitySettingsDialog's pre-migration client gate (non-negative).
  // Server-side SET_MATERIALITY_SETTINGS remains the authoritative business rule.
  if (settings.percentageThreshold == null || settings.percentageThreshold < 0) {
    errors.push('percentageThreshold must be zero or a positive number.');
  }
  if (settings.absoluteThreshold == null || settings.absoluteThreshold < 0) {
    errors.push('absoluteThreshold must be zero or a positive number.');
  }
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const ACCOUNTING_POLICIES_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'accountingPolicies.view',
    requiredRole: 'member',
    description: 'View materiality and other accounting policy settings.',
  },
  edit: {
    action: 'accountingPolicies.edit',
    requiredRole: 'admin',
    description: 'Edit materiality and other accounting policy settings.',
  },
};
