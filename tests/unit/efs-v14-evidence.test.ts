/**
 * V14.0 — Enterprise Accounts Production evidence + regression.
 *
 * Builds a realistic, fully-populated engagement (entity particulars, section
 * grouped primary statements, standard accounting policies and statutory notes)
 * and renders it through the SAME canonical pipeline used by the workspace. It
 * writes the PDF + DOCX evidence and asserts the professional presentation
 * properties introduced in V14.0.
 *
 * Set V14_LABEL=before|after to name the evidence files.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { DocumentModel } from '../../src/lib/financialStatements/document/documentModel';
import { assembleFrameworkDocument } from '../../src/lib/financialStatements/framework/frameworkContentEngine';
import { assembleSignatures } from '../../src/lib/financialStatements/document/signatureModel';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import {
  buildCanonicalPublishPackage,
  extractDocxPlainText,
} from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';

function decodePdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const matches = [...raw.matchAll(/\((?:\\.|[^\\)])*\)/g)];
  return matches
    .map((m) => m[0].slice(1, -1).replace(/\\n/g, '\n').replace(/\\([()\\])/g, '$1'))
    .join('\n');
}

const ENTITY = {
  registered_name: 'Meridian Trading Solutions (Pty) Ltd',
  trading_name: 'Meridian Trading',
  registration_number: '2016/348271/07',
  vat_number: '4820318456',
  income_tax_number: '9218347160',
  financial_year_end: '31 March',
  reporting_currency: 'ZAR',
  nature_of_business:
    'the wholesale distribution of industrial hardware and the provision of related logistics services',
  business_address: '18 Kyalami Boulevard, Midrand, 1685',
  postal_address: 'PO Box 41128, Halfway House, 1685',
  registered_office: '18 Kyalami Boulevard, Midrand, 1685',
  company_secretary: 'T. Nkosi',
  auditor: 'Delport & Associates Incorporated, Registered Auditors',
  prepared_by: 'A. Petersen CA(SA)',
  reviewed_by: 'S. Moloi CA(SA)',
  approved_by: 'R. van der Merwe',
  approval_date: '2026-06-24',
  authorisation_date: '2026-06-24',
  directors: [
    { name: 'R. van der Merwe', role: 'Managing Director' },
    { name: 'L. Khumalo', role: 'Financial Director' },
    { name: 'P. Naidoo', role: 'Non-executive Director' },
  ],
  principal_bankers: [{ name: 'First National Bank', branch: 'Midrand' }],
};

function buildMeridianModel(): DocumentModel {
  const model = {
    companyId: 'co-meridian',
    workspaceId: 'ws-meridian-fy26',
    workspaceName: 'Meridian Trading Solutions - FY2026',
    frameworkPackId: 'pack-ifrs-sme',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: ENTITY,
    period: {
      label: 'Year ended 31 March 2026',
      period_key: 'FY2026',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    statements: [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        populated: true,
        lines: [
          { line_code: 'sfp.h.assets', label: 'Assets', section: 'assets_header', amount: 0, is_header: true },
          { line_code: 'sfp.h.nca', label: 'Non-current assets', section: 'noncurrent_assets', amount: 0, is_subheader: true },
          { line_code: 'sfp.ppe', label: 'Property, plant and equipment', section: 'noncurrent_assets', amount: 4218650, prior_amount: 3684200 },
          { line_code: 'sfp.intangibles', label: 'Intangible assets', section: 'noncurrent_assets', amount: 312400, prior_amount: 298100 },
          { line_code: 'sfp.deferred_tax_asset', label: 'Deferred tax', section: 'noncurrent_assets', amount: 186300, prior_amount: 152800 },
          { line_code: 'sfp.total_nca', label: 'Total non-current assets', section: 'noncurrent_assets', amount: 4717350, prior_amount: 4135100, is_total: true },
          { line_code: 'sfp.h.ca', label: 'Current assets', section: 'current_assets', amount: 0, is_subheader: true },
          { line_code: 'sfp.inventories', label: 'Inventories', section: 'current_assets', amount: 2864100, prior_amount: 2510800 },
          { line_code: 'sfp.receivables', label: 'Trade and other receivables', section: 'current_assets', amount: 3120540, prior_amount: 2789300 },
          { line_code: 'sfp.cash', label: 'Cash and cash equivalents', section: 'current_assets', amount: 1458920, prior_amount: 1119520 },
          { line_code: 'sfp.total_ca', label: 'Total current assets', section: 'current_assets', amount: 7443560, prior_amount: 6419620, is_total: true },
          { line_code: 'sfp.total_assets', label: 'Total assets', section: 'assets_total', amount: 12160910, prior_amount: 10554720, is_total: true, is_grand_total: true },
          { line_code: 'sfp.h.eq', label: 'Equity and liabilities', section: 'eq_header', amount: 0, is_header: true },
          { line_code: 'sfp.h.equity', label: 'Equity', section: 'equity', amount: 0, is_subheader: true },
          { line_code: 'sfp.share_capital', label: 'Share capital', section: 'equity', amount: 100000, prior_amount: 100000 },
          { line_code: 'sfp.retained_earnings', label: 'Retained earnings', section: 'equity', amount: 6842910, prior_amount: 5180705 },
          { line_code: 'sfp.total_equity', label: 'Total equity', section: 'equity', amount: 6942910, prior_amount: 5280705, is_total: true },
          { line_code: 'sfp.h.ncl', label: 'Non-current liabilities', section: 'noncurrent_liabilities', amount: 0, is_subheader: true },
          { line_code: 'sfp.borrowings_nc', label: 'Borrowings', section: 'noncurrent_liabilities', amount: 1650000, prior_amount: 1980000 },
          { line_code: 'sfp.total_ncl', label: 'Total non-current liabilities', section: 'noncurrent_liabilities', amount: 1650000, prior_amount: 1980000, is_total: true },
          { line_code: 'sfp.h.cl', label: 'Current liabilities', section: 'current_liabilities', amount: 0, is_subheader: true },
          { line_code: 'sfp.payables', label: 'Trade and other payables', section: 'current_liabilities', amount: 2918000, prior_amount: 2642015 },
          { line_code: 'sfp.borrowings_c', label: 'Current portion of borrowings', section: 'current_liabilities', amount: 550000, prior_amount: 520000 },
          { line_code: 'sfp.tax_payable', label: 'Current tax payable', section: 'current_liabilities', amount: 100000, prior_amount: 132000 },
          { line_code: 'sfp.total_cl', label: 'Total current liabilities', section: 'current_liabilities', amount: 3568000, prior_amount: 3294015, is_total: true },
          { line_code: 'sfp.total_equity_liabilities', label: 'Total equity and liabilities', section: 'eq_total', amount: 12160910, prior_amount: 10554720, is_total: true, is_grand_total: true },
        ],
      },
      {
        id: 'financial_performance',
        kind: 'statement',
        statement_type: 'financial_performance',
        title: 'Statement of Profit or Loss and Other Comprehensive Income',
        populated: true,
        lines: [
          { line_code: 'perf.revenue', label: 'Revenue', section: 'income', amount: 28450300, prior_amount: 25128400 },
          { line_code: 'perf.cos', label: 'Cost of sales', section: 'income', amount: -19122400, prior_amount: -16981200 },
          { line_code: 'perf.gross', label: 'Gross profit', section: 'income', amount: 9327900, prior_amount: 8147200, is_total: true },
          { line_code: 'perf.other_income', label: 'Other income', section: 'income', amount: 214600, prior_amount: 186300 },
          { line_code: 'perf.opex', label: 'Operating expenses', section: 'income', amount: -6890120, prior_amount: -6128400 },
          { line_code: 'perf.operating', label: 'Operating profit', section: 'income', amount: 2652380, prior_amount: 2205100, is_total: true },
          { line_code: 'perf.finance_costs', label: 'Finance costs', section: 'income', amount: -238400, prior_amount: -265100 },
          { line_code: 'perf.pbt', label: 'Profit before taxation', section: 'income', amount: 2413980, prior_amount: 1940000, is_total: true },
          { line_code: 'perf.tax', label: 'Taxation', section: 'income', amount: -651775, prior_amount: -523800 },
          { line_code: 'perf.profit', label: 'Profit for the year', section: 'result', amount: 1762205, prior_amount: 1416200, is_total: true },
          { line_code: 'perf.oci', label: 'Other comprehensive income', section: 'result', amount: 0, prior_amount: 0 },
          { line_code: 'perf.tci', label: 'Total comprehensive income for the year', section: 'result', amount: 1762205, prior_amount: 1416200, is_total: true, is_grand_total: true },
        ],
      },
      {
        id: 'changes_in_equity',
        kind: 'statement',
        statement_type: 'changes_in_equity',
        title: 'Statement of Changes in Equity',
        populated: true,
        lines: [
          { line_code: 'eq.opening', label: 'Balance at 1 April 2025', amount: 5180705, is_total: true },
          { line_code: 'eq.profit', label: 'Profit for the year', amount: 1762205 },
          { line_code: 'eq.dividends', label: 'Dividends declared', amount: 0 },
          { line_code: 'eq.closing', label: 'Balance at 31 March 2026', amount: 6942910, is_total: true },
        ],
      },
      {
        id: 'cash_flows',
        kind: 'statement',
        statement_type: 'cash_flows',
        title: 'Statement of Cash Flows',
        populated: true,
        lines: [
          { line_code: 'cf.h.op', label: 'Cash flows from operating activities', section: 'operating', amount: 0, is_subheader: true },
          { line_code: 'cf.generated', label: 'Cash generated from operations', section: 'operating', amount: 2984100 },
          { line_code: 'cf.interest_paid', label: 'Finance costs paid', section: 'operating', amount: -238400 },
          { line_code: 'cf.tax_paid', label: 'Taxation paid', section: 'operating', amount: -602300 },
          { line_code: 'cf.net_op', label: 'Net cash from operating activities', section: 'operating', amount: 2143400, is_total: true },
          { line_code: 'cf.h.inv', label: 'Cash flows from investing activities', section: 'investing', amount: 0, is_subheader: true },
          { line_code: 'cf.ppe', label: 'Acquisition of property, plant and equipment', section: 'investing', amount: -1284000 },
          { line_code: 'cf.net_inv', label: 'Net cash used in investing activities', section: 'investing', amount: -1284000, is_total: true },
          { line_code: 'cf.h.fin', label: 'Cash flows from financing activities', section: 'financing', amount: 0, is_subheader: true },
          { line_code: 'cf.borrowings', label: 'Repayment of borrowings', section: 'financing', amount: -520000 },
          { line_code: 'cf.net_fin', label: 'Net cash used in financing activities', section: 'financing', amount: -520000, is_total: true },
          { line_code: 'cf.net', label: 'Net increase in cash and cash equivalents', section: 'summary', amount: 339400, is_total: true },
          { line_code: 'cf.open', label: 'Cash and cash equivalents at the beginning of the year', section: 'summary', amount: 1119520 },
          { line_code: 'cf.close', label: 'Cash and cash equivalents at the end of the year', section: 'summary', amount: 1458920, is_total: true, is_grand_total: true },
        ],
      },
    ],
    policySets: [],
    notes: [],
    crossReferences: [],
    signatures: assembleSignatures(ENTITY as never),
    trialBalanceCaptured: true,
  } as unknown as DocumentModel;

  const assembled = assembleFrameworkDocument({
    frameworkKey: 'IFRS_SME',
    statements: model.statements,
    serverNotes: [],
    serverPolicySets: [],
  });
  model.notes = assembled.notes;
  model.policySets = assembled.policySets;
  return model;
}

describe('V14.0 — Enterprise Accounts Production evidence', () => {
  const model = buildMeridianModel();
  const overrides = emptyOverrides();
  const pkg = buildCanonicalPublishPackage(model, overrides);
  const pdfText = decodePdfText(pkg.pdfBytes);
  const docxText = extractDocxPlainText(pkg.docxBytes);
  const pageCount = (pkg.pdfString.match(/\/MediaBox/g) || []).length;

  it('writes AFS evidence (PDF + DOCX)', () => {
    const label = process.env.V14_LABEL || 'current';
    const outDir = join(process.cwd(), 'docs/enterprise-accounts-production/V14.0/evidence');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `AFS_V14_Meridian_${label}.pdf`), Buffer.from(pkg.pdfBytes));
    writeFileSync(join(outDir, `AFS_V14_Meridian_${label}.docx`), Buffer.from(pkg.docxBytes));
    writeFileSync(
      join(outDir, `metrics_${label}.json`),
      JSON.stringify(
        {
          label,
          generatedAt: new Date().toISOString(),
          pdfBytes: pkg.pdfBytes.length,
          pageCount,
          noteCount: pkg.view.notes.length,
          statementCount: pkg.view.statements.length,
        },
        null,
        2,
      ),
    );
    expect(pkg.pdfBytes.length).toBeGreaterThan(1000);
  });

  it('renders the primary statements and totals', () => {
    expect(pdfText).toContain('Statement of Financial Position');
    expect(pdfText).toContain('12,160,910.00');
    expect(pdfText).toContain('Total comprehensive income for the year');
  });

  it('suppresses nil amounts on section headers', () => {
    // Headers must never print 0.00 — the clearest machine-generated tell.
    expect(pdfText).not.toMatch(/Current assets\n0\.00/);
    expect(pdfText).not.toMatch(/Equity and liabilities\n0\.00/);
    expect(pdfText).not.toMatch(/Cash flows from operating activities\n0\.00/);
  });

  it('presents comparative years and note references on the SOFP', () => {
    expect(pdfText).toContain('2025');
    expect(pdfText).toContain('2026');
    expect(pdfText).toContain('Notes');
    expect(pdfText).toMatch(/\(19,122,400\.00\)/); // negative as parentheses
  });

  it('uses professional statutory front matter (not template meta-language)', () => {
    expect(pdfText).toContain("Directors' Responsibilities and Approval");
    expect(pdfText).toContain('1. Nature of business');
    expect(pdfText).toContain('Companies Act of South Africa');
    expect(pdfText).not.toMatch(/This section presents the report of the independent auditor/);
    expect(pdfText).not.toContain('Generated by AdminLess Fin');
    expect(pdfText).toContain('AdminLess Fin');
    expect(pdfText).toContain('Approval of Annual Financial Statements');
    expect(pdfText).toContain('Supplementary Information');
  });

  it('renders flowing accounting-policy prose without robotic labels', () => {
    // V15.0: policies render as Phase 3 heading (title case) rather than a numbered note.
    expect(pdfText).toMatch(/Significant [Aa]ccounting [Pp]olicies/);
    expect(pdfText).not.toMatch(/Recognition -/);
    expect(pdfText).not.toMatch(/Initial measurement -/);
    // IFRS for SMEs Section 23 wording (not full IFRS 15 performance obligations).
    expect(pdfText).toContain('Revenue from the sale of goods is recognised when the significant risks and rewards');
    expect(pdfText).not.toMatch(/performance obligation/i);
  });

  it('numbers notes in professional statutory form', () => {
    expect(pdfText).toMatch(/Note 1\. /);
    expect(docxText).toMatch(/Note 1\. /);
  });
});
