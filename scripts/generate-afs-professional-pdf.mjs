/**
 * Offline professional AFS PDF generator for V6.10.3 certification evidence.
 * Run: npx --yes tsx scripts/generate-afs-professional-pdf.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load via tsx path — this file is executed with tsx
async function main() {
  const { extractCanonicalTables } = await import(
    '../src/lib/financialStatements/publication/canonical.ts'
  );
  const {
    generateProfessionalAfsPdf,
    validateProfessionalLayout,
  } = await import('../src/lib/financialStatements/publication/afsProfessionalPdf.ts');
  const { validateAfsArticulation } = await import(
    '../src/lib/financialStatements/publication/afsAccountingValidation.ts'
  );

  const pack = {
    metadata: {
      company_name: 'Spaceman',
      period_label: 'Financial Year 2025/26',
      framework_key: 'IFRS_SME',
      framework_label: 'IFRS for SMEs',
      reporting_currency: 'ZAR',
      title: 'Annual Financial Statements — Spaceman',
    },
    engagement: {
      company_name: 'Spaceman',
      reporting_period: {
        period_key: 'FY2025-26',
        label: 'Financial Year 2025/26',
        start_date: '2025-04-01',
        end_date: '2026-03-31',
      },
      framework: { framework_key: 'IFRS_SME', name: 'IFRS for SMEs' },
    },
    statements: [
      {
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        lines: [
          { line_code: 'sfp.assets', label: 'Assets', section: 'assets', amount: 83300 },
          {
            line_code: 'sfp.total_assets',
            label: 'Total Assets',
            section: 'assets',
            amount: 83300,
            is_total: true,
          },
          { line_code: 'sfp.liabilities', label: 'Liabilities', section: 'liabilities', amount: 3111 },
          {
            line_code: 'sfp.total_liabilities',
            label: 'Total Liabilities',
            section: 'liabilities',
            amount: 3111,
            is_total: true,
          },
          { line_code: 'sfp.equity', label: 'Equity', section: 'equity', amount: 0 },
          {
            line_code: 'sfp.current_period_result',
            label: 'Profit / (Loss) for the period',
            section: 'equity',
            amount: 80189,
          },
          {
            line_code: 'sfp.total_equity',
            label: 'Total Equity',
            section: 'equity',
            amount: 80189,
            is_total: true,
          },
          {
            line_code: 'sfp.total_liabilities_and_equity',
            label: 'Total Liabilities and Equity',
            section: 'totals',
            amount: 83300,
            is_total: true,
          },
        ],
      },
      {
        statement_type: 'financial_performance',
        title: 'Statement of Profit or Loss',
        lines: [
          { line_code: 'perf.revenue', label: 'Revenue', section: 'revenue', amount: 200 },
          {
            line_code: 'perf.total_revenue',
            label: 'Total Revenue',
            section: 'revenue',
            amount: 200,
            is_total: true,
          },
          { line_code: 'perf.expenses', label: 'Expenses', section: 'expenses', amount: -79989 },
          {
            line_code: 'perf.total_expenses',
            label: 'Total Expenses',
            section: 'expenses',
            amount: -79989,
            is_total: true,
          },
          {
            line_code: 'perf.result',
            label: 'Profit / (Loss) for the period',
            section: 'result',
            amount: 80189,
            is_total: true,
          },
        ],
      },
      {
        statement_type: 'changes_in_equity',
        title: 'Statement of Changes in Equity',
        lines: [
          { line_code: 'eq.opening', label: 'Opening Equity', amount: 0, is_total: true },
          {
            line_code: 'eq.period_result',
            label: 'Profit / (Loss) for the period',
            amount: 80189,
          },
          { line_code: 'eq.other_movements', label: 'Other movements', amount: 0 },
          { line_code: 'eq.closing', label: 'Closing Equity', amount: 80189, is_total: true },
        ],
      },
      {
        statement_type: 'cash_flows',
        title: 'Statement of Cash Flows',
        lines: [
          { line_code: 'cf.operating', label: 'Operating activities', amount: -8450 },
          { line_code: 'cf.investing', label: 'Investing activities', amount: 0 },
          { line_code: 'cf.financing', label: 'Financing activities', amount: -8450 },
          {
            line_code: 'cf.net_change',
            label: 'Net increase / (decrease) in cash',
            amount: -16900,
            is_total: true,
          },
        ],
      },
    ],
    disclosures: [
      { disclosure_code: 'DISC.BASIS', title: 'Basis of preparation', status: 'active' },
      { disclosure_code: 'DISC.POLICIES', title: 'Significant accounting policies', status: 'active' },
      { disclosure_code: 'DISC.REVENUE', title: 'Revenue', status: 'active' },
      { disclosure_code: 'DISC.PPE', title: 'Property, plant and equipment', status: 'active' },
      { disclosure_code: 'DISC.RELATED', title: 'Related parties', status: 'active' },
      { disclosure_code: 'DISC.EVENTS', title: 'Events after the reporting period', status: 'active' },
      { disclosure_code: 'DISC.CONTINGENT', title: 'Contingencies and commitments', status: 'active' },
    ],
  };

  const outDir = join(root, 'docs/financial-statements-certification/V6.10.3/evidence');
  mkdirSync(outDir, { recursive: true });

  const pdf = generateProfessionalAfsPdf(pack, extractCanonicalTables);
  const pdfPath = join(outDir, 'AFS_V6.10.3_Spaceman_Professional.pdf');
  writeFileSync(pdfPath, Buffer.from(pdf));

  const text = Buffer.from(pdf)
    .toString('latin1')
    .match(/\((?:\\.|[^\\)])*\)/g)
    ?.map((m) => m.slice(1, -1).replace(/\\([()\\])/g, '$1'))
    .join('\n') || '';

  const layout = validateProfessionalLayout(text);
  const accounting = validateAfsArticulation(pack);

  const report = {
    version: '6.10.3',
    generatedAt: new Date().toISOString(),
    pdfPath,
    byteSize: pdf.length,
    layout,
    accounting,
    decision:
      layout.ok && accounting.ok
        ? 'PROFESSIONAL ANNUAL FINANCIAL STATEMENTS CERTIFIED'
        : 'NOT CERTIFIED',
  };
  writeFileSync(join(outDir, 'professional-pdf-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
