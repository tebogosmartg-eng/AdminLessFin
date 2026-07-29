import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import { generatePayslipPdf } from '../src/lib/payrollDocuments';
import autoTable from 'jspdf-autotable';

const root = process.cwd();

function dataUrl(rel: string) {
  return `data:image/png;base64,${readFileSync(join(root, rel)).toString('base64')}`;
}

for (const p of [
  'public/icons/favicon-32.png',
  'public/icons/favicon-192.png',
  'public/icons/apple-touch-icon.png',
  'public/icons/app-icon.png',
]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  try {
    doc.addImage(dataUrl(p), 'PNG', 14, 8, 16, 16);
    console.log(p, 'addImage OK', readFileSync(join(root, p)).length);
  } catch (e) {
    console.log(p, 'addImage FAIL', (e as Error).message);
  }
}

// Reproduce company-logo payslip with favicon-192
async function main() {
  const logo = dataUrl('public/icons/favicon-192.png');
  const doc = await generatePayslipPdf({
    companyName: 'Acme Manufacturing (Pty) Ltd',
    companyAddress: '12 Long Street\nCape Town CBD\nWestern Cape\n8001\nSouth Africa',
    companyTaxId: '9876543210',
    companyLogoUrl: logo,
    employee: {
      first_name: 'Thabo',
      last_name: 'Molefe',
      employee_number: 'EMP-0042',
      department: 'Operations',
      tax_number: '9001015800083',
      bank_name: 'FNB',
      bank_account_number: '62000000001',
      bank_branch_code: '250655',
    },
    payPeriodStart: '2026-04-01',
    payPeriodEnd: '2026-04-30',
    payDate: '2026-04-25',
    items: [
      { description: 'Basic Salary', type: 'earning', amount: 25000 },
      { description: 'Travel Allowance', type: 'earning', amount: 2500 },
      { description: 'PAYE', type: 'deduction', amount: 4200 },
      { description: 'UIF', type: 'deduction', amount: 177.12 },
      { description: 'Medical Aid', type: 'deduction', amount: 1800 },
      { description: 'UIF Employer', type: 'employer_contribution', amount: 177.12 },
      { description: 'SDL', type: 'employer_contribution', amount: 275 },
    ],
    total_earnings: 27500,
    total_deductions: 6177.12,
    net_pay: 21322.88,
    payment_method: 'EFT',
    bank_reference: 'PAY-2026-04-25',
    audit_reference: 'PSL-QAFIX01',
    payslip_id: 'qa-fix-001',
    tax_year: '2025/2026',
    rule_version: '2025.2.0',
    calculation_version: '3.0.2',
  });
  const pdfPath = 'tmp/payslip-qa/payslip-favicon-logo.pdf';
  writeFileSync(pdfPath, Buffer.from(doc.output('arraybuffer')));
  const { pdf } = await import('pdf-to-img');
  let n = 0;
  for await (const image of await pdf(pdfPath, { scale: 2 })) {
    n += 1;
    writeFileSync(`tmp/payslip-qa/favicon-logo-page-${n}.png`, image);
  }
  console.log('wrote', pdfPath);

  // Also verify autoTable margins in isolation after addImage
  const d2 = new jsPDF({ unit: 'mm', format: 'a4' });
  d2.addImage(logo, 'PNG', 14, 8, 16, 16);
  const pageWidth = d2.internal.pageSize.getWidth();
  autoTable(d2, {
    startY: 40,
    head: [['Deductions', 'Amount']],
    body: [['PAYE', 'R 4 200,00']],
    headStyles: { fillColor: [4, 120, 87] },
    margin: { left: pageWidth / 2 + 4, right: 14 },
  });
  autoTable(d2, {
    startY: 60,
    head: [['Employer Contributions', 'Amount']],
    body: [['UIF Employer', 'R 177,12']],
    headStyles: { fillColor: [100, 100, 100] },
    margin: { left: 14, right: 14 },
  });
  writeFileSync('tmp/payslip-qa/autotable-probe.pdf', Buffer.from(d2.output('arraybuffer')));
  n = 0;
  for await (const image of await pdf('tmp/payslip-qa/autotable-probe.pdf', { scale: 2 })) {
    n += 1;
    writeFileSync(`tmp/payslip-qa/autotable-probe-page-${n}.png`, image);
  }
  console.log('autotable probe done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
