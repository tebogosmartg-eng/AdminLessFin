/**
 * Shared terminology asset — professional wording keys reused across packs.
 */
export const TERMINOLOGY = {
  going_concern: 'going concern',
  reporting_date: 'reporting date',
  reporting_period: 'reporting period',
  those_charged_with_governance: 'those charged with governance',
  annual_financial_statements: 'annual financial statements',
  significant_accounting_policies: 'significant accounting policies',
} as const;

export type TerminologyKey = keyof typeof TERMINOLOGY;
