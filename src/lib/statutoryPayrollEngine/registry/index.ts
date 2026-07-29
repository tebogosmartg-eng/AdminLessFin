/**
 * Statutory Rules Registry — resolves versioned rules for a payroll period.
 * Legislation selection delegates to src/statutory/south-africa.
 */

import type { StatutoryRuleSet } from '../types';
import {
  LegislationResolutionError,
  getLegislationByTaxYear,
  legislationToStatutoryRuleSet,
  resolveSouthAfricanLegislation,
} from '../../../statutory';
import { VERSIONED_RULE_SETS } from './taxYears';

export { RULE_SET_2024_2025, RULE_SET_2025_2026, RULE_SET_2026_2027, VERSIONED_RULE_SETS } from './taxYears';

export function resolveRuleSetForDate(
  payDate: string,
  _ruleSets?: readonly StatutoryRuleSet[]
): StatutoryRuleSet {
  // Always resolve via legislation registry — never fall back to another year.
  void _ruleSets;
  return legislationToStatutoryRuleSet(resolveSouthAfricanLegislation(payDate));
}

export function getRuleSetByLabel(taxYearLabel: string): StatutoryRuleSet | undefined {
  const legislation = getLegislationByTaxYear(taxYearLabel);
  return legislation ? legislationToStatutoryRuleSet(legislation) : undefined;
}

export function getAllRuleSets(): readonly StatutoryRuleSet[] {
  return VERSIONED_RULE_SETS;
}

function requireBuiltinRuleSet(label: string): StatutoryRuleSet {
  const legislation = getLegislationByTaxYear(label);
  if (!legislation) {
    throw new LegislationResolutionError(
      `No South African legislation package registered for tax year "${label}". Cannot map payroll_tax_year_config row.`
    );
  }
  return legislationToStatutoryRuleSet(legislation);
}

/**
 * Map DB payroll_tax_year_config row to statutory rule set.
 * Tax-year identity comes from the DB row label; all statutory values come
 * exclusively from the locked legislation repository. Silent merge of
 * incomplete DB statutory fields with legislation is prohibited.
 */
export function mapDbRowToRuleSet(row: Record<string, unknown>): StatutoryRuleSet {
  const label = row.tax_year_label as string;
  if (!label) {
    throw new LegislationResolutionError(
      'payroll_tax_year_config row missing tax_year_label. Cannot resolve South African legislation.'
    );
  }

  const legislation = requireBuiltinRuleSet(label);
  return {
    ...legislation,
    id: row.id as string | undefined,
  };
}

export function resolveRuleSetForPayroll(
  payDate: string,
  dbRows?: Record<string, unknown>[]
): StatutoryRuleSet {
  const date = payDate.slice(0, 10);
  if (!dbRows?.length) {
    throw new LegislationResolutionError(
      `No payroll_tax_year_config rows available for pay date ${date}. Cannot resolve SARS tax year.`
    );
  }
  const dbMatch = dbRows.find(
    (r) => date >= (r.effective_from as string) && date <= (r.effective_to as string)
  );
  if (!dbMatch) {
    throw new LegislationResolutionError(
      `No payroll_tax_year_config row matches pay date ${date}. Cannot resolve SARS tax year. Silent fallback to another tax year is prohibited.`
    );
  }
  return mapDbRowToRuleSet(dbMatch);
}
