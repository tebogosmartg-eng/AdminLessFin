import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { loadPdfEngine } from '../../lib/pdf/pdfEngine';
import { showError } from '../../utils/toast';
import type { RoeWorksheet } from '../../lib/payrollRulesEngine/coida';

type Prepared = { worksheet: RoeWorksheet; registrationNumber: string | null; employerName: string | null };

const rand = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatCurrency(n));

function downloadCsv(p: Prepared) {
  const w = p.worksheet;
  const rows = [
    ['Employee', 'Employee number', 'ID number', 'Earnings', 'Assessable earnings (capped)'],
    ...w.employees.map((e) => [e.name, e.employeeNumber ?? '', e.idNumber ?? '', e.earnings.toFixed(2), e.assessable.toFixed(2)]),
    ['Total', '', '', w.totals.earnings.toFixed(2), w.totals.assessable.toFixed(2)],
  ];
  const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `COIDA_ROE_${w.startYear}_employees.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPdf(p: Prepared) {
  const { jsPDF, autoTable } = await loadPdfEngine();
  const w = p.worksheet;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(15);
  doc.text('COIDA Return of Earnings — payroll report', 14, 16);
  doc.setFontSize(9);
  doc.text(`${p.employerName ?? ''}${p.registrationNumber ? `   Registration ${p.registrationNumber}` : ''}`, 14, 23);
  doc.text(`Assessment year ${w.period.start} to ${w.period.end} · maximum earnings per employee R${w.maxEarnings.toLocaleString('en-ZA')}`, 14, 28);
  autoTable(doc, {
    startY: 33,
    head: [['', 'Actual', 'Provisional']],
    body: [
      ['Employees', String(w.totals.employees), String(w.provisional.employees)],
      ['Earnings', rand(w.totals.earnings), rand(w.provisional.earnings)],
      ['Assessable earnings', rand(w.totals.assessable), rand(w.provisional.assessable)],
      ['Rate', w.ratePercent === null ? '—' : `${w.ratePercent}%`, w.ratePercent === null ? '—' : `${w.ratePercent}%`],
      ['Assessment (at least the minimum)', rand(w.assessment), rand(w.provisional.assessment)],
    ],
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  });
  const after = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 70;
  autoTable(doc, {
    startY: after + 6,
    head: [['Employee', 'Employee no.', 'ID number', 'Earnings', 'Assessable']],
    body: w.employees.map((e) => [e.name, e.employeeNumber ?? '', e.idNumber ?? '', rand(e.earnings), rand(e.assessable)]),
    styles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  doc.save(`COIDA_ROE_${w.startYear}.pdf`);
}

/**
 * COIDA Return of Earnings worksheet: the figures to capture on CF Online and the
 * per-employee earnings report to attach. Earnings come from finalised payroll.
 */
export default function CoidaRoePanel() {
  const { activeCompany } = useAuth();
  const now = new Date();
  const lastStart = now.getMonth() >= 2 ? now.getFullYear() - 1 : now.getFullYear() - 2;
  const [startYear, setStartYear] = useState(lastStart);
  const [growth, setGrowth] = useState('0');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const prepare = useMutation({
    mutationFn: () => invokePayroll<Prepared>({ method: 'PREPARE_COIDA_ROE', company_id: activeCompany?.id, startYear, provisionalGrowthPercent: Number(growth) || 0 }),
    onSuccess: setPrepared,
    onError: (e: Error) => showError(e.message),
  });
  const w = prepared?.worksheet;

  return (
    <div className="space-y-4" data-testid="coida-panel">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Assessment year</Label>
          <Select value={String(startYear)} onValueChange={(v) => { setStartYear(Number(v)); setPrepared(null); }}>
            <SelectTrigger className="w-64" aria-label="Assessment year"><SelectValue /></SelectTrigger>
            <SelectContent>{[lastStart + 1, lastStart, lastStart - 1, lastStart - 2].map((y) => <SelectItem key={y} value={String(y)}>{`March ${y} – February ${y + 1}`}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="coida-growth">Provisional growth (%)</Label>
          <Input id="coida-growth" type="number" step="0.5" value={growth} onChange={(e) => setGrowth(e.target.value)} className="w-32" />
        </div>
        <Button onClick={() => prepare.mutate()} disabled={prepare.isPending}>
          {prepare.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Prepare return of earnings
        </Button>
        {prepared && (
          <>
            <Button variant="outline" onClick={() => downloadPdf(prepared)}><Download className="mr-1 h-4 w-4" />Payroll report (PDF)</Button>
            <Button variant="ghost" onClick={() => downloadCsv(prepared)}><Download className="mr-1 h-4 w-4" />Employees (CSV)</Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Capture these totals on CF Online (Compensation Fund) and attach the payroll report. Earnings include salary, wages, overtime, bonuses, commission,
        and taxable allowances, up to the year's maximum per employee; reimbursements and fringe benefits are left out.
      </p>
      {w && w.ratePercent === null && (
        <Alert><AlertDescription>Add your COIDA assessment rate (from the Fund's notice of assessment) under <Link to="/settings" className="underline">Settings → Payroll → Employer details</Link> to work out the assessment.</AlertDescription></Alert>
      )}
      {w && (
        <>
          <Table data-testid="coida-summary">
            <TableHeader><TableRow><TableHead /><TableHead className="text-right">Actual {w.period.start.slice(0, 4)}/{w.period.end.slice(2, 4)}</TableHead><TableHead className="text-right">Provisional next year</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell>Employees</TableCell><TableCell className="text-right">{w.totals.employees}</TableCell><TableCell className="text-right">{w.provisional.employees}</TableCell></TableRow>
              <TableRow><TableCell>Earnings</TableCell><TableCell className="text-right font-mono">{rand(w.totals.earnings)}</TableCell><TableCell className="text-right font-mono">{rand(w.provisional.earnings)}</TableCell></TableRow>
              <TableRow><TableCell>Assessable (each employee up to R{w.maxEarnings.toLocaleString('en-ZA')})</TableCell><TableCell className="text-right font-mono">{rand(w.totals.assessable)}</TableCell><TableCell className="text-right font-mono">{rand(w.provisional.assessable)}</TableCell></TableRow>
              <TableRow><TableCell>Assessment at {w.ratePercent ?? '—'}% (minimum {rand(w.minAssessment)})</TableCell><TableCell className="text-right font-mono font-semibold">{rand(w.assessment)}</TableCell><TableCell className="text-right font-mono">{rand(w.provisional.assessment)}</TableCell></TableRow>
            </TableBody>
          </Table>
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead className="text-right">Earnings</TableHead><TableHead className="text-right">Assessable</TableHead></TableRow></TableHeader>
            <TableBody>
              {w.employees.map((e) => (
                <TableRow key={e.employeeId}>
                  <TableCell>{e.name}{e.capped && <Badge variant="outline" className="ml-2">Capped</Badge>}</TableCell>
                  <TableCell className="text-right font-mono">{rand(e.earnings)}</TableCell>
                  <TableCell className="text-right font-mono">{rand(e.assessable)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
