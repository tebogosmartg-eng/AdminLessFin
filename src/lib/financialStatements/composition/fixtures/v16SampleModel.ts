/**
 * V16.0 — Sample document model for tests and regression scenarios (browser-safe).
 */
import type { DocumentModel } from '../../document/documentModel';
import { assembleSignatures } from '../../document/signatureModel';
import { assembleFrameworkDocument } from '../../framework/frameworkContentEngine';
import { inferDisclosureConditions } from '../../framework/frameworkContent';

export function buildV16SampleModel(): DocumentModel {
  const statements = [
    {
      id: 'financial_position',
      kind: 'statement' as const,
      statement_type: 'financial_position',
      title: 'Statement of Financial Position',
      populated: true,
      lines: [
        {
          line_code: 'sfp.ppe',
          label: 'Property, plant and equipment',
          section: 'assets',
          amount: 8500000,
          prior_amount: 7200000,
        },
        {
          line_code: 'sfp.inventories',
          label: 'Inventories',
          section: 'assets',
          amount: 2100000,
          prior_amount: 1800000,
        },
        {
          line_code: 'sfp.receivables',
          label: 'Trade and other receivables',
          section: 'assets',
          amount: 1650000,
          prior_amount: 1400000,
        },
        {
          line_code: 'sfp.cash',
          label: 'Cash and cash equivalents',
          section: 'assets',
          amount: 980000,
          prior_amount: 750000,
        },
        {
          line_code: 'sfp.total_assets',
          label: 'Total assets',
          section: 'assets',
          amount: 13230000,
          is_total: true,
        },
        { line_code: 'sfp.share_capital', label: 'Share capital', section: 'equity', amount: 1000000 },
        { line_code: 'sfp.retained_earnings', label: 'Retained earnings', section: 'equity', amount: 8230000 },
        { line_code: 'sfp.payables', label: 'Trade and other payables', section: 'liabilities', amount: 1900000 },
        { line_code: 'sfp.borrowings', label: 'Borrowings', section: 'liabilities', amount: 2100000 },
        {
          line_code: 'sfp.total_liabilities_and_equity',
          label: 'Total equity and liabilities',
          section: 'equity',
          amount: 13230000,
          is_total: true,
        },
      ],
    },
    {
      id: 'financial_performance',
      kind: 'statement' as const,
      statement_type: 'financial_performance',
      title: 'Statement of Profit or Loss and Other Comprehensive Income',
      populated: true,
      lines: [
        { line_code: 'perf.revenue', label: 'Revenue', section: 'income', amount: 18500000 },
        { line_code: 'perf.total_expenses', label: 'Expenses', section: 'income', amount: 14200000 },
        { line_code: 'perf.finance_costs', label: 'Finance costs', section: 'result', amount: 420000 },
        { line_code: 'perf.tax_expense', label: 'Tax expense', section: 'result', amount: 972500 },
        {
          line_code: 'perf.profit_before_tax',
          label: 'Profit before tax',
          section: 'result',
          amount: 3880000,
          is_total: true,
        },
      ],
    },
    {
      id: 'changes_in_equity',
      kind: 'statement' as const,
      statement_type: 'changes_in_equity',
      title: 'Statement of Changes in Equity',
      populated: true,
      lines: [
        { line_code: 'eq.opening', label: 'Opening equity', section: 'equity', amount: 6322500, is_total: true },
        { line_code: 'eq.period_result', label: 'Profit for the period', section: 'equity', amount: 2907500 },
        { line_code: 'eq.closing', label: 'Closing equity', section: 'equity', amount: 9230000, is_total: true },
      ],
    },
    {
      id: 'cash_flows',
      kind: 'statement' as const,
      statement_type: 'cash_flows',
      title: 'Statement of Cash Flows',
      populated: true,
      lines: [
        { line_code: 'cf.operating', label: 'Net cash from operating activities', section: 'operating', amount: 3100000 },
        { line_code: 'cf.investing', label: 'Net cash from investing activities', section: 'investing', amount: -1200000 },
        { line_code: 'cf.financing', label: 'Net cash from financing activities', section: 'financing', amount: -650000 },
      ],
    },
  ];

  const assembled = assembleFrameworkDocument({
    frameworkKey: 'IFRS_SME',
    statements,
    context: { conditions: inferDisclosureConditions(statements) },
  });

  const entity = {
    registered_name: 'Meridian Enterprise Disclosure (Pty) Ltd',
    trading_name: 'Meridian Enterprise',
    registration_number: '2020/160016/07',
    reporting_currency: 'ZAR',
    nature_of_business: 'Industrial components distribution.',
    registered_office: '2 Disclosure Way, Sandton, 2196',
    company_secretary: 'B. Secretary',
    auditor: 'Independent Audit Partners',
    directors: [{ name: 'A. Director' }, { name: 'C. Director' }],
  };

  return {
    companyId: 'co-v16',
    workspaceId: 'ws-v16',
    workspaceName: 'FY2026 Annual Financial Statements',
    frameworkPackId: 'pack-ifrs-sme',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: entity as DocumentModel['entity'],
    period: {
      label: 'Year ended 31 March 2026',
      comparative_label: 'Year ended 31 March 2025',
      period_key: 'FY2026',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    statements,
    policySets: assembled.policySets,
    notes: assembled.notes,
    crossReferences: [],
    signatures: assembleSignatures(entity as never),
    trialBalanceCaptured: true,
    optionalDisclosures: assembled.optionalDisclosures,
    manualFields: assembled.manualFields,
  };
}
