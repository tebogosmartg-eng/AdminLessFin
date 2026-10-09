/**
 * Download files for a filed EMP201: a working CSV and a printable PDF, both built
 * from the stored (locked) declaration, never recalculated.
 *
 * The EMP201 itself is captured on SARS eFiling or e@syFile; these files are the
 * employer's record of what was declared and the ETI supporting schedule SARS may
 * ask for (PAYE-GEN-01-G05 section 18).
 */

import { loadPdfEngine } from '../pdf/pdfEngine';
import type { Emp201Declaration } from './emp201';

export type FiledEmp201 = {
  id: string;
  period: string;
  version: number;
  status: string;
  filed_at: string | null;
  submission_reference: string | null;
  content_hash: string | null;
  declaration_data: Emp201Declaration;
};

const money = (n: number) => (Number(n) || 0).toFixed(2);

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

/** EMP201 summary followed by the per-employee schedule (amounts with a decimal point, as SARS requires). */
export function buildEmp201Csv(filed: FiledEmp201, employerName: string): string {
  const d = filed.declaration_data;
  const rows: string[] = [
    csvRow(['EMP201', employerName]),
    csvRow(['Period', d.period]),
    csvRow(['Version', filed.version]),
    csvRow(['Status', filed.status]),
    csvRow(['Filed at', filed.filed_at ?? '']),
    csvRow(['Payment reference (PRN)', filed.submission_reference ?? '']),
    csvRow(['Content hash (SHA-256)', filed.content_hash ?? '']),
    '',
    csvRow(['Item', 'Amount']),
    csvRow(['PAYE', money(d.paye)]),
    csvRow(['SDL', money(d.sdl)]),
    csvRow(['UIF', money(d.uif)]),
    csvRow(['ETI calculated', money(d.eti.calculated)]),
    csvRow(['ETI brought forward', money(d.eti.broughtForward)]),
    csvRow(['ETI available', money(d.eti.available)]),
    csvRow(['ETI used against PAYE', money(d.eti.utilised)]),
    csvRow(['ETI carried forward', money(d.eti.carriedForward)]),
    csvRow(['Total payable', money(d.totalPayable)]),
    '',
    csvRow([
      'Employee number', 'Employee', 'Payslips', 'Remuneration', 'Hours', 'PAYE', 'UIF', 'SDL',
      'ETI cycle', 'ETI hours (max 160)', 'Minimum wage per hour', 'Wage paid per hour', 'ETI', 'ETI note',
    ]),
    ...d.employees.map((l) => csvRow([
      l.employeeNumber, l.name, l.payslips, money(l.remuneration), l.hours.toFixed(4), money(l.paye), money(l.uif), money(l.sdl),
      l.eti?.cycle ?? '', l.eti ? l.eti.hoursReported.toFixed(4) : '', l.eti ? money(l.eti.minimumWageHourly) : '',
      l.eti ? money(l.eti.wagePaidHourly) : '', l.eti ? money(l.eti.eti) : '', l.eti?.reason ?? '',
    ])),
  ];
  return rows.join('\r\n');
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadEmp201Csv(filed: FiledEmp201, employerName: string) {
  save(new Blob(['﻿' + buildEmp201Csv(filed, employerName)], { type: 'text/csv;charset=utf-8' }), `EMP201_${filed.period}_v${filed.version}.csv`);
}

const rand = (n: number) => `R ${(Number(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function downloadEmp201Pdf(filed: FiledEmp201, employer: { name: string; payeReference?: string | null }) {
  const { jsPDF, autoTable } = await loadPdfEngine();
  const d = filed.declaration_data;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.text('EMP201 — Monthly Employer Declaration', 14, 18);
  doc.setFontSize(10);
  doc.text(`${employer.name}${employer.payeReference ? `   PAYE ${employer.payeReference}` : ''}`, 14, 26);
  doc.text(`Period ${d.period} · version ${filed.version} · ${filed.status}${filed.submission_reference ? ` · PRN ${filed.submission_reference}` : ''}`, 14, 32);

  autoTable(doc, {
    startY: 38,
    head: [['Declaration', 'Amount']],
    body: [
      ['PAYE', rand(d.paye)],
      ['SDL', rand(d.sdl)],
      ['UIF', rand(d.uif)],
      ['ETI calculated this month', rand(d.eti.calculated)],
      ['ETI brought forward', rand(d.eti.broughtForward)],
      ['ETI used against PAYE', rand(d.eti.utilised > 0 ? -d.eti.utilised : 0)],
      ['ETI carried forward', rand(d.eti.carriedForward)],
      ['Total payable to SARS', rand(d.totalPayable)],
    ],
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 9 },
  });

  const after = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90;
  autoTable(doc, {
    startY: after + 8,
    head: [['Employee', 'Remuneration', 'PAYE', 'UIF', 'SDL', 'ETI']],
    body: d.employees.map((l) => [
      `${l.name}${l.employeeNumber ? ` (${l.employeeNumber})` : ''}`,
      rand(l.remuneration), rand(l.paye), rand(l.uif), rand(l.sdl), l.eti ? rand(l.eti.eti) : '—',
    ]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    styles: { fontSize: 8 },
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.text(
    `Filed ${filed.filed_at ?? ''} · content hash ${filed.content_hash ?? ''}. Capture these amounts on SARS eFiling or e@syFile.`,
    14, pageHeight - 10, { maxWidth: 182 },
  );
  doc.save(`EMP201_${d.period}_v${filed.version}.pdf`);
}
