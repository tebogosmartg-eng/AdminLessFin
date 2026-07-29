/**
 * V15.0 — Disclosure Linking Engine.
 *
 * Every primary-statement line understands its supporting disclosure,
 * accounting policy, schedules, movement tables, reconciliations,
 * framework sections, and validation rules — automatically.
 */
import type { DisclosureLinkSet, StatementClassification } from './types';
import { classifyStatementLine } from './statementClassification';
import type { EfsStatementLine } from '../api';

export type LineLinkRule = {
  lineCodePatterns: string[];
  disclosureCodes: string[];
  policyCodes: string[];
  scheduleCodes?: string[];
  frameworkSections?: string[];
  validationRules?: string[];
  accountCategories?: StatementClassification[];
};

/**
 * Metadata map: statement line patterns → supporting composition artefacts.
 * Renderers and note referencing consume this; they do not hardcode links.
 */
export const LINE_DISCLOSURE_LINK_RULES: LineLinkRule[] = [
  {
    lineCodePatterns: ['sfp.ppe'],
    disclosureCodes: ['DISC.PPE'],
    policyCodes: ['POL.PPE'],
    scheduleCodes: ['SCH.PPE.MOVEMENT'],
    frameworkSections: ['IFRS_SME.17'],
    validationRules: ['VAL.PPE.RECON'],
    accountCategories: ['non_current_assets'],
  },
  {
    lineCodePatterns: ['sfp.intangibles'],
    disclosureCodes: ['DISC.INTANGIBLES'],
    policyCodes: ['POL.INTANGIBLES'],
    scheduleCodes: ['SCH.INTANGIBLES.MOVEMENT'],
    frameworkSections: ['IFRS_SME.18'],
    accountCategories: ['non_current_assets'],
  },
  {
    lineCodePatterns: ['sfp.deferred_tax'],
    disclosureCodes: ['DISC.DEFERREDTAX', 'DISC.TAX'],
    policyCodes: ['POL.TAX'],
    frameworkSections: ['IFRS_SME.29'],
    accountCategories: ['non_current_assets', 'non_current_liabilities'],
  },
  {
    lineCodePatterns: ['sfp.inventories'],
    disclosureCodes: ['DISC.INVENTORIES'],
    policyCodes: ['POL.INVENTORIES'],
    frameworkSections: ['IFRS_SME.13'],
    accountCategories: ['current_assets'],
  },
  {
    lineCodePatterns: ['sfp.receivables'],
    disclosureCodes: ['DISC.RECEIVABLES', 'DISC.FININST'],
    policyCodes: ['POL.FININST'],
    frameworkSections: ['IFRS_SME.11', 'IFRS_SME.12'],
    accountCategories: ['current_assets'],
  },
  {
    lineCodePatterns: ['sfp.cash'],
    disclosureCodes: ['DISC.CASHFLOW'],
    policyCodes: ['POL.CASH'],
    frameworkSections: ['IFRS_SME.7'],
    accountCategories: ['current_assets'],
  },
  {
    lineCodePatterns: ['sfp.share_capital'],
    disclosureCodes: ['DISC.SHARECAPITAL'],
    policyCodes: ['POL.EQUITY'],
    frameworkSections: ['IFRS_SME.22'],
    accountCategories: ['share_capital', 'equity'],
  },
  {
    lineCodePatterns: ['sfp.retained'],
    disclosureCodes: ['DISC.SHARECAPITAL'],
    policyCodes: ['POL.EQUITY'],
    accountCategories: ['retained_earnings', 'equity'],
  },
  {
    lineCodePatterns: ['sfp.borrowings'],
    disclosureCodes: ['DISC.BORROWINGS', 'DISC.FININST'],
    policyCodes: ['POL.FININST', 'POL.BORROWINGS'],
    scheduleCodes: ['SCH.BORROWINGS.MOVEMENT'],
    frameworkSections: ['IFRS_SME.11'],
    accountCategories: ['current_liabilities', 'non_current_liabilities'],
  },
  {
    lineCodePatterns: ['sfp.payables'],
    disclosureCodes: ['DISC.PAYABLES', 'DISC.FININST'],
    policyCodes: ['POL.FININST'],
    accountCategories: ['current_liabilities'],
  },
  {
    lineCodePatterns: ['sfp.tax_payable', 'perf.tax'],
    disclosureCodes: ['DISC.TAX'],
    policyCodes: ['POL.TAX'],
    scheduleCodes: ['SCH.TAX.COMPUTATION'],
    frameworkSections: ['IFRS_SME.29'],
    accountCategories: ['taxation', 'current_liabilities'],
  },
  {
    lineCodePatterns: ['sfp.leases', 'perf.lease'],
    disclosureCodes: ['DISC.LEASES'],
    policyCodes: ['POL.LEASES'],
    frameworkSections: ['IFRS_SME.20'],
  },
  {
    lineCodePatterns: ['sfp.provisions'],
    disclosureCodes: ['DISC.PROVISIONS', 'DISC.CONTINGENT'],
    policyCodes: ['POL.PROVISIONS'],
    frameworkSections: ['IFRS_SME.21'],
  },
  {
    lineCodePatterns: ['sfp.employee', 'perf.employee'],
    disclosureCodes: ['DISC.EMPLOYEE'],
    policyCodes: ['POL.EMPLOYEE'],
    frameworkSections: ['IFRS_SME.28'],
  },
  {
    lineCodePatterns: ['sfp.associates'],
    disclosureCodes: ['DISC.ASSOCIATES'],
    policyCodes: ['POL.ASSOCIATES'],
    frameworkSections: ['IFRS_SME.14'],
  },
  {
    lineCodePatterns: ['sfp.joint'],
    disclosureCodes: ['DISC.JOINTVENTURES'],
    policyCodes: ['POL.JOINTVENTURES'],
    frameworkSections: ['IFRS_SME.15'],
  },
  {
    lineCodePatterns: ['sfp.biological'],
    disclosureCodes: ['DISC.BIOLOGICAL'],
    policyCodes: ['POL.BIOLOGICAL'],
    frameworkSections: ['IFRS_SME.34'],
  },
  {
    lineCodePatterns: ['sfp.investments_subsidiaries', 'note.consolidation'],
    disclosureCodes: ['DISC.CONSOLIDATION'],
    policyCodes: ['POL.CONSOLIDATION'],
    frameworkSections: ['IFRS_SME.9'],
  },
  {
    lineCodePatterns: ['perf.revenue', 'perf.total_revenue'],
    disclosureCodes: ['DISC.REVENUE'],
    policyCodes: ['POL.REVENUE'],
    frameworkSections: ['IFRS_SME.23'],
    accountCategories: ['revenue'],
  },
  {
    lineCodePatterns: ['perf.government', 'perf.grants'],
    disclosureCodes: ['DISC.GRANTS'],
    policyCodes: ['POL.GRANTS'],
    frameworkSections: ['IFRS_SME.24'],
    accountCategories: ['other_income'],
  },
  {
    lineCodePatterns: ['perf.finance'],
    disclosureCodes: ['DISC.BORROWINGS', 'DISC.BORROWINGCOST'],
    policyCodes: ['POL.BORROWINGCOST', 'POL.FININST'],
    accountCategories: ['finance_costs'],
  },
  {
    lineCodePatterns: ['perf.forex'],
    disclosureCodes: ['DISC.FOREX'],
    policyCodes: ['POL.FOREX'],
    frameworkSections: ['IFRS_SME.30'],
  },
  {
    lineCodePatterns: ['perf.impairment'],
    disclosureCodes: ['DISC.IMPAIRMENT'],
    policyCodes: ['POL.IMPAIRMENT'],
    frameworkSections: ['IFRS_SME.27'],
  },
  {
    lineCodePatterns: ['perf.discontinued'],
    disclosureCodes: ['DISC.DISCONTINUED'],
    policyCodes: ['POL.DISCONTINUED'],
    frameworkSections: ['IFRS_SME.5'],
  },
  {
    lineCodePatterns: ['cf.operating', 'cf.generated', 'cf.investing', 'cf.financing'],
    disclosureCodes: ['DISC.CASHFLOW'],
    policyCodes: ['POL.CASH'],
    frameworkSections: ['IFRS_SME.7'],
  },
];

const EMPTY_LINKS: DisclosureLinkSet = {
  statements: [],
  statementLines: [],
  accountCategories: [],
  frameworkSections: [],
  policyCodes: [],
  scheduleCodes: [],
  validationRules: [],
};

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function emptyDisclosureLinks(): DisclosureLinkSet {
  return { ...EMPTY_LINKS, accountCategories: [] };
}

export function resolveLineLinks(
  statementType: string,
  line: Pick<EfsStatementLine, 'line_code' | 'label' | 'section' | 'is_header' | 'is_subheader' | 'is_total'>,
): DisclosureLinkSet {
  const code = String(line.line_code || '').toLowerCase();
  if (!code || line.is_header || line.is_subheader) {
    return emptyDisclosureLinks();
  }

  const matched = LINE_DISCLOSURE_LINK_RULES.filter((r) =>
    r.lineCodePatterns.some((p) => code.includes(p.toLowerCase())),
  );

  if (!matched.length) {
    const classification = classifyStatementLine(statementType, line);
    return {
      ...emptyDisclosureLinks(),
      statements: [statementType],
      statementLines: [String(line.line_code || '')],
      accountCategories: classification === 'unclassified' ? [] : [classification],
    };
  }

  const classification = classifyStatementLine(statementType, line);
  return {
    statements: [statementType],
    statementLines: [String(line.line_code || '')],
    accountCategories: uniq([
      ...(classification !== 'unclassified' && classification !== 'header' && classification !== 'total'
        ? [classification]
        : []),
      ...matched.flatMap((m) => m.accountCategories || []),
    ]),
    frameworkSections: uniq(matched.flatMap((m) => m.frameworkSections || [])),
    policyCodes: uniq(matched.flatMap((m) => m.policyCodes)),
    scheduleCodes: uniq(matched.flatMap((m) => m.scheduleCodes || [])),
    validationRules: uniq(matched.flatMap((m) => m.validationRules || [])),
  };
}

/** Invert line links: disclosure code → linked statement lines. */
export function linksForDisclosure(
  disclosureCode: string,
  allLinks: Array<{ statementType: string; lineCode: string; links: DisclosureLinkSet }>,
): DisclosureLinkSet {
  const code = disclosureCode.toUpperCase();
  const rules = LINE_DISCLOSURE_LINK_RULES.filter((r) =>
    r.disclosureCodes.map((c) => c.toUpperCase()).includes(code),
  );
  const lineHits = allLinks.filter((l) =>
    rules.some((r) => r.lineCodePatterns.some((p) => l.lineCode.toLowerCase().includes(p))),
  );

  return {
    statements: uniq(lineHits.map((l) => l.statementType)),
    statementLines: uniq(lineHits.map((l) => l.lineCode)),
    accountCategories: uniq(lineHits.flatMap((l) => l.links.accountCategories)),
    frameworkSections: uniq(rules.flatMap((r) => r.frameworkSections || [])),
    policyCodes: uniq(rules.flatMap((r) => r.policyCodes)),
    scheduleCodes: uniq(rules.flatMap((r) => r.scheduleCodes || [])),
    validationRules: uniq(rules.flatMap((r) => r.validationRules || [])),
  };
}

/** Primary map used by face-statement note referencing. */
export function disclosureCodeForLine(lineCode: string): string | null {
  const code = lineCode.toLowerCase();
  for (const rule of LINE_DISCLOSURE_LINK_RULES) {
    if (rule.lineCodePatterns.some((p) => code.includes(p.toLowerCase()))) {
      return rule.disclosureCodes[0] || null;
    }
  }
  return null;
}
