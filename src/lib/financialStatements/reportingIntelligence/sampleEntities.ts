/**
 * V17.0 — Regression sample entities for reporting intelligence certification.
 */
import type { DocumentModel } from '../document/documentModel';
import { assembleSignatures } from '../document/signatureModel';
import { assembleFrameworkDocument } from '../framework/frameworkContentEngine';
import { inferDisclosureConditions } from '../framework/frameworkContent';
import type { RegressionScenarioId } from './types';

type ScenarioConfig = {
  id: RegressionScenarioId;
  name: string;
  natureOfBusiness: string;
  statements: DocumentModel['statements'];
};

function baseEntity(name: string, nature: string, overrides: Record<string, unknown> = {}) {
  return {
    registered_name: name,
    trading_name: name.split(' ')[0],
    registration_number: '2020/170017/07',
    reporting_currency: 'ZAR',
    functional_currency: 'ZAR',
    reporting_framework: 'IFRS for SMEs',
    nature_of_business: nature,
    country_of_incorporation: 'South Africa',
    entity_type: 'Private Company',
    registered_office: '17 Intelligence Way, Sandton, 2196',
    business_address: '17 Intelligence Way, Sandton, 2196',
    postal_address: 'PO Box 1700, Sandton, 2196',
    company_secretary: 'R. Secretary',
    auditor: 'Independent Audit Partners',
    engagement_type: 'audit' as const,
    vat_number: '4123456789',
    income_tax_number: '9876543210',
    paye_number: '7123456789',
    prepared_by: 'J. Preparer',
    reviewed_by: 'M. Reviewer',
    partner: 'P. Partner',
    approved_by: 'P. Partner',
    approval_date: '2026-07-15',
    authorisation_date: '2026-07-18',
    issue_date: '2026-07-21',
    comparative_period: 'Year ended 31 March 2025',
    directors: [
      {
        name: 'A. Director',
        role: 'Executive Director',
        appointment_date: '2020-01-01',
        executive: true,
      },
      {
        name: 'B. Director',
        role: 'Non-executive Director',
        appointment_date: '2021-06-01',
        non_executive: true,
        independent: true,
      },
    ],
    principal_bankers: [
      {
        name: 'First National Bank',
        branch: 'Sandton',
        branch_code: '250655',
        account_type: 'Current',
        swift: 'FIRNZAJJ',
        active: true,
      },
      {
        name: 'Standard Bank',
        branch: 'Rosebank',
        branch_code: '051001',
        account_type: 'Call',
        active: true,
      },
    ],
    ...overrides,
  };
}

function sfpLines(overrides: Record<string, number>) {
  const meta: Record<string, { label: string; section: string }> = {
    'sfp.ppe': { label: 'Property, plant and equipment', section: 'assets' },
    'sfp.inventories': { label: 'Inventories', section: 'assets' },
    'sfp.receivables': { label: 'Trade and other receivables', section: 'assets' },
    'sfp.cash': { label: 'Cash and cash equivalents', section: 'assets' },
    'sfp.investments': { label: 'Investments', section: 'assets' },
    'sfp.share_capital': { label: 'Share capital', section: 'equity' },
    'sfp.retained_earnings': { label: 'Retained earnings', section: 'equity' },
    'sfp.payables': { label: 'Trade and other payables', section: 'liabilities' },
    'sfp.borrowings': { label: 'Borrowings', section: 'liabilities' },
    'sfp.lease_liability': { label: 'Lease liabilities', section: 'liabilities' },
    'sfp.total_assets': { label: 'Total assets', section: 'assets' },
    'sfp.total_liabilities_and_equity': { label: 'Total equity and liabilities', section: 'equity' },
  };
  return Object.entries(overrides).map(([code, amount]) => ({
    line_code: code,
    label: meta[code]?.label || code,
    section: meta[code]?.section || 'assets',
    amount,
    prior_amount: Math.round(amount * 0.85),
    is_total: code.includes('total'),
  }));
}

function perfLines(revenue: number, expenses: number, tax = 0) {
  const pbt = revenue - expenses;
  return [
    { line_code: 'perf.revenue', label: 'Revenue', section: 'income', amount: revenue, prior_amount: Math.round(revenue * 0.85) },
    { line_code: 'perf.total_expenses', label: 'Expenses', section: 'income', amount: expenses, prior_amount: Math.round(expenses * 0.85) },
    { line_code: 'perf.finance_costs', label: 'Finance costs', section: 'result', amount: Math.round(expenses * 0.05), prior_amount: Math.round(expenses * 0.04) },
    { line_code: 'perf.tax_expense', label: 'Tax expense', section: 'result', amount: tax, prior_amount: Math.round(tax * 0.85) },
    { line_code: 'perf.profit_before_tax', label: 'Profit before tax', section: 'result', amount: pbt, prior_amount: Math.round(pbt * 0.85), is_total: true },
  ];
}

function equityLines(result: number) {
  const opening = 5_000_000;
  return [
    { line_code: 'eq.opening', label: 'Opening equity', section: 'equity', amount: opening, prior_amount: Math.round(opening * 0.9), is_total: true },
    { line_code: 'eq.period_result', label: 'Profit for the period', section: 'equity', amount: result, prior_amount: Math.round(result * 0.85) },
    { line_code: 'eq.closing', label: 'Closing equity', section: 'equity', amount: opening + result, prior_amount: Math.round((opening + result) * 0.9), is_total: true },
  ];
}

function cfLines() {
  return [
    { line_code: 'cf.operating', label: 'Net cash from operating activities', section: 'operating', amount: 1_500_000, prior_amount: 1_200_000 },
    { line_code: 'cf.investing', label: 'Net cash from investing activities', section: 'investing', amount: -800_000, prior_amount: -600_000 },
    { line_code: 'cf.financing', label: 'Net cash from financing activities', section: 'financing', amount: -200_000, prior_amount: -150_000 },
  ];
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'service_entity',
    name: 'Apex Consulting Services (Pty) Ltd',
    natureOfBusiness: 'Software and technology services.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.receivables': 3_200_000, 'sfp.cash': 1_100_000, 'sfp.share_capital': 500_000, 'sfp.retained_earnings': 3_800_000, 'sfp.payables': 800_000, 'sfp.total_assets': 4_300_000, 'sfp.total_liabilities_and_equity': 4_300_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(12_000_000, 9_500_000, 750_000) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(1_750_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'retail_entity',
    name: 'Urban Retail Holdings (Pty) Ltd',
    natureOfBusiness: 'Retail trading of consumer goods.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.inventories': 4_500_000, 'sfp.receivables': 800_000, 'sfp.cash': 600_000, 'sfp.share_capital': 1_000_000, 'sfp.retained_earnings': 3_900_000, 'sfp.payables': 1_800_000, 'sfp.total_assets': 5_900_000, 'sfp.total_liabilities_and_equity': 5_900_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(28_000_000, 24_500_000, 875_000) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(1_625_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'manufacturing_entity',
    name: 'Precision Manufacturing Works (Pty) Ltd',
    natureOfBusiness: 'Manufacturing of industrial components.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.ppe': 18_000_000, 'sfp.inventories': 3_200_000, 'sfp.receivables': 2_100_000, 'sfp.cash': 1_200_000, 'sfp.share_capital': 2_000_000, 'sfp.retained_earnings': 20_500_000, 'sfp.payables': 1_500_000, 'sfp.borrowings': 500_000, 'sfp.total_assets': 24_500_000, 'sfp.total_liabilities_and_equity': 24_500_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(45_000_000, 38_000_000, 1_750_000) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(5_250_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'investment_holding',
    name: 'Meridian Investment Holdings Ltd',
    natureOfBusiness: 'Investment holding company.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.investments': 85_000_000, 'sfp.cash': 2_500_000, 'sfp.share_capital': 10_000_000, 'sfp.retained_earnings': 77_500_000, 'sfp.total_assets': 87_500_000, 'sfp.total_liabilities_and_equity': 87_500_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(8_500_000, 1_200_000, 2_100_000) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(5_200_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'professional_practice',
    name: 'Sterling Audit & Advisory (Pty) Ltd',
    natureOfBusiness: 'Professional audit and advisory practice.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.receivables': 1_800_000, 'sfp.cash': 900_000, 'sfp.share_capital': 200_000, 'sfp.retained_earnings': 2_500_000, 'sfp.payables': 500_000, 'sfp.total_assets': 2_700_000, 'sfp.total_liabilities_and_equity': 2_700_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(6_500_000, 4_800_000, 425_000) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(1_275_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'npo',
    name: 'Community Development Foundation NPC',
    natureOfBusiness: 'Non-profit organisation — community development.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.cash': 450_000, 'sfp.receivables': 120_000, 'sfp.share_capital': 100_000, 'sfp.retained_earnings': 470_000, 'sfp.total_assets': 570_000, 'sfp.total_liabilities_and_equity': 570_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(1_200_000, 1_150_000, 0) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(50_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'dormant_entity',
    name: 'Dormant Shelf Company (Pty) Ltd',
    natureOfBusiness: 'Dormant entity — no trading activity.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.cash': 1_000, 'sfp.share_capital': 100, 'sfp.retained_earnings': 900, 'sfp.total_assets': 1_000, 'sfp.total_liabilities_and_equity': 1_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(0, 0, 0) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(0) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: [{ line_code: 'cf.operating', label: 'Operating', section: 'operating', amount: 0 }] },
    ],
  },
  {
    id: 'high_growth_entity',
    name: 'Velocity Growth Technologies (Pty) Ltd',
    natureOfBusiness: 'High-growth technology services.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.receivables': 5_500_000, 'sfp.cash': 3_200_000, 'sfp.share_capital': 1_000_000, 'sfp.retained_earnings': 7_700_000, 'sfp.total_assets': 8_700_000, 'sfp.total_liabilities_and_equity': 8_700_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: [{ line_code: 'perf.revenue', label: 'Revenue', section: 'income', amount: 25_000_000, prior_amount: 15_000_000 }, { line_code: 'perf.prior_revenue', label: 'Prior revenue', section: 'income', amount: 15_000_000 }, ...perfLines(25_000_000, 18_000_000, 1_750_000).slice(1)] },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(4_250_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'loss_making_entity',
    name: 'Turnaround Industries (Pty) Ltd',
    natureOfBusiness: 'Manufacturing — restructuring phase.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.ppe': 8_000_000, 'sfp.inventories': 1_500_000, 'sfp.receivables': 900_000, 'sfp.cash': 200_000, 'sfp.share_capital': 2_000_000, 'sfp.retained_earnings': 4_600_000, 'sfp.borrowings': 4_000_000, 'sfp.total_assets': 10_600_000, 'sfp.total_liabilities_and_equity': 10_600_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(8_000_000, 10_500_000, 0) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(-2_500_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'asset_intensive_entity',
    name: 'Heavy Assets Mining Services (Pty) Ltd',
    natureOfBusiness: 'Asset-intensive mining services.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.ppe': 120_000_000, 'sfp.inventories': 2_000_000, 'sfp.receivables': 5_000_000, 'sfp.cash': 3_000_000, 'sfp.share_capital': 5_000_000, 'sfp.retained_earnings': 115_000_000, 'sfp.borrowings': 10_000_000, 'sfp.total_assets': 130_000_000, 'sfp.total_liabilities_and_equity': 130_000_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(35_000_000, 28_000_000, 2_100_000) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(4_900_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
  {
    id: 'debt_intensive_entity',
    name: 'Leveraged Property Developments (Pty) Ltd',
    natureOfBusiness: 'Property development and construction.',
    statements: [
      { id: 'financial_position', kind: 'statement', statement_type: 'financial_position', title: 'SFP', populated: true, lines: sfpLines({ 'sfp.ppe': 15_000_000, 'sfp.inventories': 8_000_000, 'sfp.receivables': 2_000_000, 'sfp.cash': 500_000, 'sfp.share_capital': 3_000_000, 'sfp.retained_earnings': 2_500_000, 'sfp.borrowings': 20_000_000, 'sfp.total_assets': 25_500_000, 'sfp.total_liabilities_and_equity': 25_500_000 }) },
      { id: 'financial_performance', kind: 'statement', statement_type: 'financial_performance', title: 'P&L', populated: true, lines: perfLines(18_000_000, 15_000_000, 750_000) },
      { id: 'changes_in_equity', kind: 'statement', statement_type: 'changes_in_equity', title: 'SOCE', populated: true, lines: equityLines(2_250_000) },
      { id: 'cash_flows', kind: 'statement', statement_type: 'cash_flows', title: 'SCF', populated: true, lines: cfLines() },
    ],
  },
];

export function buildRegressionScenarioModel(scenarioId: RegressionScenarioId): DocumentModel {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown regression scenario: ${scenarioId}`);

  const assembled = assembleFrameworkDocument({
    frameworkKey: 'IFRS_SME',
    statements: scenario.statements,
    context: { conditions: inferDisclosureConditions(scenario.statements) },
  });

  const entityOverrides: Record<RegressionScenarioId, Record<string, unknown>> = {
    service_entity: {},
    retail_entity: { entity_type: 'Private Company' },
    manufacturing_entity: { entity_type: 'Private Company' },
    investment_holding: {
      entity_type: 'Public Company',
      engagement_type: 'audit',
    },
    professional_practice: {
      engagement_type: 'independent_review',
      auditor: null,
      independent_reviewer: 'Sterling Review Partners',
    },
    npo: {
      entity_type: 'Non-Profit Organisation',
      engagement_type: 'compilation',
      auditor: null,
      compilation_engagement: true,
    },
    dormant_entity: {
      entity_type: 'Private Company',
      engagement_type: 'unaudited',
      auditor: null,
      directors: [{ name: 'S. Sole Director', appointment_date: '2019-01-01' }],
      principal_bankers: [],
    },
    high_growth_entity: { entity_type: 'Private Company' },
    loss_making_entity: { entity_type: 'Private Company' },
    asset_intensive_entity: { entity_type: 'Private Company' },
    debt_intensive_entity: { entity_type: 'Private Company' },
  };

  const entity = baseEntity(
    scenario.name,
    scenario.natureOfBusiness,
    entityOverrides[scenarioId] || {},
  );

  return {
    companyId: `co-${scenarioId}`,
    workspaceId: `ws-${scenarioId}`,
    workspaceName: `FY2026 — ${scenario.name}`,
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
    statements: scenario.statements,
    policySets: assembled.policySets,
    notes: assembled.notes,
    crossReferences: [],
    signatures: assembleSignatures(entity as never),
    trialBalanceCaptured: true,
    optionalDisclosures: assembled.optionalDisclosures,
    manualFields: assembled.manualFields,
  };
}

export function allRegressionScenarioIds(): RegressionScenarioId[] {
  return SCENARIOS.map((s) => s.id);
}

export function scenarioLabel(id: RegressionScenarioId): string {
  return SCENARIOS.find((s) => s.id === id)?.name ?? id;
}
