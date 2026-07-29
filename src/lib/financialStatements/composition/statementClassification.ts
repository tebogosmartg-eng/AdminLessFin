/**
 * V15.0 — Statement Classification Engine.
 *
 * Metadata-driven enterprise financial statement classifications.
 * No hardcoded account placement in renderers — classification is resolved here.
 */
import type { EfsStatementLine } from '../api';
import type { StatementClassification } from './types';

export type ClassificationRule = {
  classification: StatementClassification;
  label: string;
  /** Match against lowercase line_code (substring or exact via ^$). */
  lineCodePatterns: string[];
  /** Match against lowercase section field. */
  sectionPatterns?: string[];
  /** Match against lowercase label. */
  labelPatterns?: string[];
  statementTypes?: string[];
  priority: number;
};

/**
 * Canonical classification metadata. Rules are evaluated highest priority first.
 * Placement is derived from metadata — never from renderer conditionals.
 */
export const CLASSIFICATION_RULES: ClassificationRule[] = [
  // Structural
  {
    classification: 'header',
    label: 'Header',
    lineCodePatterns: [],
    labelPatterns: [],
    priority: 1000,
  },
  {
    classification: 'total',
    label: 'Total',
    lineCodePatterns: ['\\.total', 'total_'],
    priority: 900,
  },

  // Statement of Financial Position
  {
    classification: 'non_current_assets',
    label: 'Non-current assets',
    statementTypes: ['financial_position'],
    lineCodePatterns: [
      'sfp.ppe',
      'sfp.intangibles',
      'sfp.invprop',
      'sfp.investment_property',
      'sfp.associates',
      'sfp.joint',
      'sfp.biological',
      'sfp.deferred_tax_asset',
      'sfp.investments_subsidiaries',
      'sfp.heritage',
      'sfp.non_current',
    ],
    sectionPatterns: ['non.current.asset', 'non_current_asset'],
    labelPatterns: ['non-current asset', 'property, plant', 'intangible', 'investment propert'],
    priority: 80,
  },
  {
    classification: 'current_assets',
    label: 'Current assets',
    statementTypes: ['financial_position'],
    lineCodePatterns: [
      'sfp.inventories',
      'sfp.receivables',
      'sfp.cash',
      'sfp.tax_receivable',
      'sfp.current',
    ],
    sectionPatterns: ['current.asset', 'current_asset', '^assets$'],
    labelPatterns: ['inventor', 'receivable', 'cash and cash', 'current asset'],
    priority: 70,
  },
  {
    classification: 'equity',
    label: 'Equity',
    statementTypes: ['financial_position', 'changes_in_equity'],
    lineCodePatterns: ['sfp.share_capital', 'sfp.retained', 'sfp.equity', 'eq.'],
    sectionPatterns: ['^equity$'],
    labelPatterns: ['equity', 'share capital', 'retained earning'],
    priority: 80,
  },
  {
    classification: 'share_capital',
    label: 'Share Capital',
    statementTypes: ['changes_in_equity', 'financial_position'],
    lineCodePatterns: ['share_capital', 'eq.share'],
    labelPatterns: ['share capital', 'issued capital'],
    priority: 85,
  },
  {
    classification: 'reserves',
    label: 'Reserves',
    statementTypes: ['changes_in_equity', 'financial_position'],
    lineCodePatterns: ['reserve', 'eq.reserve'],
    labelPatterns: ['reserve', 'revaluation'],
    priority: 84,
  },
  {
    classification: 'retained_earnings',
    label: 'Retained Earnings',
    statementTypes: ['changes_in_equity', 'financial_position'],
    lineCodePatterns: ['retained', 'eq.opening', 'eq.closing', 'eq.period'],
    labelPatterns: ['retained earning', 'accumulated profit'],
    priority: 84,
  },
  {
    classification: 'other_equity',
    label: 'Other Equity Components',
    statementTypes: ['changes_in_equity'],
    lineCodePatterns: ['eq.other', 'other_equity', 'oci_equity'],
    labelPatterns: ['other component', 'other equity'],
    priority: 60,
  },
  {
    classification: 'non_current_liabilities',
    label: 'Non-current liabilities',
    statementTypes: ['financial_position'],
    lineCodePatterns: [
      'sfp.borrowings_nc',
      'sfp.deferred_tax_liab',
      'sfp.provisions_nc',
      'sfp.leases_nc',
      'sfp.employee_benefits',
    ],
    sectionPatterns: ['non.current.liab', 'non_current_liab'],
    labelPatterns: ['non-current liabilit', 'deferred tax liab'],
    priority: 80,
  },
  {
    classification: 'current_liabilities',
    label: 'Current liabilities',
    statementTypes: ['financial_position'],
    lineCodePatterns: [
      'sfp.payables',
      'sfp.borrowings_c',
      'sfp.borrowings',
      'sfp.tax_payable',
      'sfp.provisions',
      'sfp.leases',
    ],
    sectionPatterns: ['current.liab', 'current_liab', '^liabilities$'],
    labelPatterns: ['payable', 'current liabilit', 'tax payable', 'borrowings'],
    priority: 70,
  },

  // Statement of Profit or Loss
  {
    classification: 'revenue',
    label: 'Revenue',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.revenue', 'perf.total_revenue', 'revenue'],
    sectionPatterns: ['^income$', '^revenue$'],
    labelPatterns: ['^revenue$', 'turnover'],
    priority: 80,
  },
  {
    classification: 'cost_of_sales',
    label: 'Cost of Sales',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.cost_of_sales', 'perf.cos', 'cost_of_sales'],
    labelPatterns: ['cost of sales', 'cost of goods'],
    priority: 80,
  },
  {
    classification: 'gross_profit',
    label: 'Gross Profit',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.gross', 'gross_profit'],
    labelPatterns: ['gross profit'],
    priority: 80,
  },
  {
    classification: 'other_income',
    label: 'Other Income',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.other_income', 'perf.grants', 'perf.government'],
    labelPatterns: ['other income', 'grant income'],
    priority: 75,
  },
  {
    classification: 'operating_expenses',
    label: 'Operating Expenses',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.expense', 'perf.total_expenses', 'perf.impairment', 'perf.operating'],
    sectionPatterns: ['expense'],
    labelPatterns: ['expense', 'operating cost', 'impairment'],
    priority: 70,
  },
  {
    classification: 'finance_costs',
    label: 'Finance Costs',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.finance', 'finance_cost'],
    labelPatterns: ['finance cost', 'interest expense', 'finance income'],
    priority: 80,
  },
  {
    classification: 'taxation',
    label: 'Taxation',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.tax'],
    labelPatterns: ['tax expense', 'income tax', 'taxation'],
    priority: 80,
  },
  {
    classification: 'profit',
    label: 'Profit',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.result', 'perf.profit', 'perf.loss'],
    sectionPatterns: ['^result$'],
    labelPatterns: ['profit', 'loss for the', 'comprehensive income'],
    priority: 75,
  },
  {
    classification: 'other_comprehensive_income',
    label: 'Other Comprehensive Income',
    statementTypes: ['financial_performance'],
    lineCodePatterns: ['perf.oci', 'other_comprehensive'],
    labelPatterns: ['other comprehensive'],
    priority: 80,
  },

  // Cash flows
  {
    classification: 'operating',
    label: 'Operating',
    statementTypes: ['cash_flows'],
    lineCodePatterns: ['cf.operating', 'cf.generated'],
    sectionPatterns: ['^operating$'],
    labelPatterns: ['operating activit'],
    priority: 80,
  },
  {
    classification: 'investing',
    label: 'Investing',
    statementTypes: ['cash_flows'],
    lineCodePatterns: ['cf.investing'],
    sectionPatterns: ['^investing$'],
    labelPatterns: ['investing activit'],
    priority: 80,
  },
  {
    classification: 'financing',
    label: 'Financing',
    statementTypes: ['cash_flows'],
    lineCodePatterns: ['cf.financing'],
    sectionPatterns: ['^financing$'],
    labelPatterns: ['financing activit'],
    priority: 80,
  },
];

function matchesAny(value: string, patterns: string[]): boolean {
  if (!patterns.length) return false;
  return patterns.some((p) => {
    if (p.startsWith('^') || p.endsWith('$')) {
      try {
        return new RegExp(p, 'i').test(value);
      } catch {
        return value.includes(p.replace(/^\^|\$$/g, ''));
      }
    }
    return value.includes(p);
  });
}

/**
 * Resolve classification for a statement line from metadata rules.
 */
export function classifyStatementLine(
  statementType: string,
  line: Pick<EfsStatementLine, 'line_code' | 'label' | 'section' | 'is_header' | 'is_subheader' | 'is_total' | 'is_grand_total'>,
): StatementClassification {
  if (line.is_header || line.is_subheader) return 'header';
  if (line.is_grand_total || line.is_total) return 'total';

  const code = String(line.line_code || '').toLowerCase();
  const label = String(line.label || '').toLowerCase();
  const section = String(line.section || '').toLowerCase();
  const stmt = String(statementType || '').toLowerCase();

  const eligible = CLASSIFICATION_RULES.filter((r) => {
    if (r.classification === 'header' || r.classification === 'total') return false;
    if (r.statementTypes && !r.statementTypes.includes(stmt)) return false;
    return true;
  }).sort((a, b) => b.priority - a.priority);

  for (const rule of eligible) {
    if (
      matchesAny(code, rule.lineCodePatterns) ||
      matchesAny(section, rule.sectionPatterns || []) ||
      matchesAny(label, rule.labelPatterns || [])
    ) {
      return rule.classification;
    }
  }

  // Soft section fallbacks
  if (stmt === 'financial_position') {
    if (section.includes('asset')) return 'current_assets';
    if (section.includes('liab')) return 'current_liabilities';
    if (section.includes('equity')) return 'equity';
  }
  if (stmt === 'cash_flows') {
    if (section.includes('operating')) return 'operating';
    if (section.includes('investing')) return 'investing';
    if (section.includes('financing')) return 'financing';
  }

  return 'unclassified';
}

export function classificationLabel(c: StatementClassification): string {
  const rule = CLASSIFICATION_RULES.find((r) => r.classification === c);
  return rule?.label || c.replace(/_/g, ' ');
}

/** Group line codes by classification for a statement. */
export function groupLinesByClassification(
  statementType: string,
  lines: EfsStatementLine[],
): Array<{ classification: StatementClassification; label: string; lineCodes: string[] }> {
  const order: StatementClassification[] = [];
  const map = new Map<StatementClassification, string[]>();

  for (const line of lines) {
    const c = classifyStatementLine(statementType, line);
    if (!map.has(c)) {
      map.set(c, []);
      order.push(c);
    }
    const code = String(line.line_code || '');
    if (code) map.get(c)!.push(code);
  }

  return order.map((classification) => ({
    classification,
    label: classificationLabel(classification),
    lineCodes: map.get(classification) || [],
  }));
}
