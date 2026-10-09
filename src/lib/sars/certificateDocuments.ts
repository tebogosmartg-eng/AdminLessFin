/**
 * Printable IRP5 / IT3(a) employee tax certificates and the e@syFile download, built
 * from the certificates issued with a filed EMP501 (never recalculated). The certificate
 * shows the SARS source codes; ETI is never printed on the employee's certificate (BRS
 * V25.3.0 section 3o). It is the employer's certificate for the employee, not a SARS-certified form.
 */

import { loadPdfEngine } from '../pdf/pdfEngine';
import type { TaxCertificate } from './emp501';

export type IssuedCertificate = {
  id: string;
  certificate_number: string;
  certificate_type: 'IRP5' | 'IT3A';
  status: 'issued' | 'cancelled';
  cancelled_reason: string | null;
  issued_at: string;
  certificate_data: TaxCertificate;
};

export type CertificateEmployer = {
  name: string;
  payeReference: string | null;
  sdlReference: string | null;
  uifReference: string | null;
  address: string;
};

const CODE_DESCRIPTIONS: Record<string, string> = {
  '3601': 'Income (taxable)',
  '3602': 'Income (non-taxable)',
  '3605': 'Annual payment',
  '3606': 'Commission',
  '3607': 'Overtime',
  '3701': 'Travel allowance',
  '3702': 'Reimbursive travel allowance',
  '3704': 'Subsistence allowance (local)',
  '3713': 'Other allowances (taxable)',
  '3714': 'Other allowances (non-taxable)',
  '3801': 'General fringe benefits',
  '3802': 'Use of motor vehicle',
  '3805': 'Accommodation',
  '3810': 'Medical scheme contributions (employer)',
  '3696': 'Gross non-taxable income',
  '3699': 'Gross employment income (taxable)',
  '4001': 'Pension fund contributions',
  '4003': 'Provident fund contributions',
  '4005': 'Medical scheme contributions',
  '4006': 'Retirement annuity fund contributions',
  '4474': 'Employer medical scheme contributions',
  '4497': 'Total deductions / contributions',
  '4102': 'PAYE',
  '4116': 'Medical scheme fees tax credit',
  '4141': 'UIF contributions',
  '4142': 'SDL contributions',
  '4149': 'Total tax, SDL and UIF',
};

const REASON_CODES: Record<string, string> = {
  '02': 'Earns less than the tax threshold',
  '08': 'No tax due to the medical scheme fees tax credit',
};

const rand = (n: number, cents = false) =>
  `R ${(Number(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
const label = (code: string) => `${code}  ${CODE_DESCRIPTIONS[code] ?? ''}`.trim();

function addressLines(c: TaxCertificate): string {
  const r = c.employee.residential;
  return [
    [r.unitNumber, r.complex].filter(Boolean).join(' '),
    [r.streetNumber, r.streetName].filter(Boolean).join(' '),
    r.suburb, r.city, r.postalCode,
  ].filter((part) => part && String(part).trim()).join(', ');
}

/** One PDF, one page per certificate. */
export async function downloadCertificatesPdf(certificates: IssuedCertificate[], employer: CertificateEmployer, fileName: string) {
  const { jsPDF, autoTable } = await loadPdfEngine();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;

  certificates.forEach((issued, index) => {
    if (index > 0) doc.addPage();
    const c = issued.certificate_data;
    const isIrp5 = issued.certificate_type === 'IRP5';
    doc.setFontSize(15);
    doc.text(isIrp5 ? 'IRP5 — Employee Tax Certificate' : 'IT3(a) — Employee Tax Certificate (no tax deducted)', 14, 16);
    doc.setFontSize(9);
    doc.text(`Certificate number ${issued.certificate_number}    Year of assessment ${c.yearOfAssessment}    Period ${c.period}`, 14, 23);
    if (issued.status === 'cancelled') {
      doc.setTextColor(200, 0, 0);
      doc.text(`CANCELLED — ${issued.cancelled_reason ?? ''}`, 14, 28, { maxWidth: 182 });
      doc.setTextColor(0, 0, 0);
    }

    autoTable(doc, {
      startY: 32,
      head: [['Employer', '']],
      body: [
        ['Name', employer.name],
        ['PAYE reference', employer.payeReference ?? ''],
        ['SDL / UIF reference', [employer.sdlReference, employer.uifReference].filter(Boolean).join(' / ') || '—'],
        ['Address', employer.address],
      ],
      styles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 45 } },
    });
    const e = c.employee;
    autoTable(doc, {
      startY: lastY() + 3,
      head: [['Employee', '']],
      body: [
        ['Name', `${e.firstName} ${e.lastName}`],
        ['Employee number', e.employeeNumber ?? ''],
        ['Identity / passport', e.idNumber || (e.passportNumber ? `${e.passportNumber} (${e.passportCountry ?? ''})` : '—')],
        ['Date of birth', e.dateOfBirth ?? ''],
        ['Income tax reference', e.taxNumber ?? '—'],
        ['Period of employment', `${c.periodStart} to ${c.periodEnd}`],
        ['Pay periods', `${c.payPeriodsWorked.toFixed(4)} of ${c.payPeriodsInYear.toFixed(4)}`],
        ['Residential address', addressLines(c)],
      ],
      styles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 45 } },
    });
    autoTable(doc, {
      startY: lastY() + 3,
      head: [['Income', 'Amount']],
      body: [
        ...c.income.map((i) => [label(i.code), rand(i.amount)]),
        ...(c.grossNonTaxable > 0 ? [[label('3696'), rand(c.grossNonTaxable)]] : []),
        [label('3699'), rand(c.grossTaxable)],
      ],
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    });
    if (c.deductions.length) {
      autoTable(doc, {
        startY: lastY() + 3,
        head: [['Deductions and contributions', 'Amount']],
        body: [
          ...c.deductions.map((d) => [label(d.code), rand(d.amount)]),
          [label('4497'), rand(c.totalDeductions ?? 0)],
        ],
        styles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
      });
    }
    const taxRows: string[][] = [];
    if (isIrp5) taxRows.push([label('4102'), rand(c.tax.paye, true)]);
    if (c.tax.medicalCredit !== null) taxRows.push([label('4116'), rand(c.tax.medicalCredit, true)]);
    if (c.tax.uif !== null) taxRows.push([label('4141'), rand(c.tax.uif, true)]);
    if (c.tax.sdl !== null) taxRows.push([label('4142'), rand(c.tax.sdl, true)]);
    taxRows.push([label('4149'), rand(c.tax.total, true)]);
    if (c.reasonCode) taxRows.push([`4150  Reason no tax was deducted`, `${c.reasonCode} — ${REASON_CODES[c.reasonCode] ?? ''}`]);
    autoTable(doc, {
      startY: lastY() + 3,
      head: [['Employees’ tax', 'Amount']],
      body: taxRows,
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right', cellWidth: 60 } },
    });
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.text(
      `Issued ${issued.issued_at.slice(0, 10)} by ${employer.name} from its finalised payroll. Keep this certificate for your income tax return.`,
      14, pageHeight - 10, { maxWidth: 182 },
    );
  });
  doc.save(fileName);
}

/** Saves the e@syFile import file exactly as the payroll function produced it. */
export function downloadEasyFile(content: string, fileName: string) {
  // ISO-8859-1 is what e@syFile expects; characters outside it become '?'.
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i += 1) {
    const code = content.charCodeAt(i);
    bytes[i] = code <= 0xff ? code : 0x3f;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/csv;charset=iso-8859-1' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
