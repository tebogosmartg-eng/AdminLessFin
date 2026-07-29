/**
 * Versioned statutory parameters — thin adapter over Legislative Governance packages.
 */

import {
  RULE_SET_2024_2025 as LEGISLATION_2024_2025,
  RULE_SET_2025_2026 as LEGISLATION_2025_2026,
  RULE_SET_2026_2027 as LEGISLATION_2026_2027,
  getAllRegisteredLegislation,
  legislationToStatutoryRuleSet,
} from '../../../statutory';
import type { StatutoryRuleSet } from '../types';

export const RULE_SET_2024_2025: StatutoryRuleSet =
  legislationToStatutoryRuleSet(LEGISLATION_2024_2025);

export const RULE_SET_2025_2026: StatutoryRuleSet =
  legislationToStatutoryRuleSet(LEGISLATION_2025_2026);

export const RULE_SET_2026_2027: StatutoryRuleSet =
  legislationToStatutoryRuleSet(LEGISLATION_2026_2027);

export const VERSIONED_RULE_SETS: readonly StatutoryRuleSet[] =
  getAllRegisteredLegislation().map(legislationToStatutoryRuleSet);
