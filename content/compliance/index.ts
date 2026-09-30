/**
 * The compliance content repository: everything the seed script publishes.
 */
import type { ContentRepository } from './schema';
import { ACTIVITY_RULES } from './za/activities';
import { CORPORATE_CIPC_RULES } from './za/corporate_cipc';
import { EMPLOYMENT_RULES } from './za/employment';
import { BBBEE_RULES, GENERAL_GOVERNANCE_RULES, INFORMATION_PRIVACY_RULES } from './za/other_categories';
import { CATEGORIES, INDUSTRIES, ZA_AUTHORITIES, ZA_PUBLIC_HOLIDAYS } from './za/reference';
import { TAX_SARS_RULES } from './za/tax_sars';

export const COMPLIANCE_CONTENT: ContentRepository = {
  authorities: ZA_AUTHORITIES,
  categories: CATEGORIES,
  industries: INDUSTRIES,
  holidays: { ZA: ZA_PUBLIC_HOLIDAYS },
  rules: [
    ...CORPORATE_CIPC_RULES,
    ...TAX_SARS_RULES,
    ...EMPLOYMENT_RULES,
    ...INFORMATION_PRIVACY_RULES,
    ...BBBEE_RULES,
    ...GENERAL_GOVERNANCE_RULES,
    ...ACTIVITY_RULES,
  ],
};
