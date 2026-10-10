import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';
import { UIF_EMPLOYMENT_STATUS, UIF_NON_CONTRIBUTION, type UifEmployeeLine } from '../../lib/payrollRulesEngine/uifDeclaration';

type Issue = { severity: 'error' | 'warning'; message: string };
type Prepared = {
  month: string;
  lines: UifEmployeeLine[];
  totals: { gross: number; remuneration: number; contributions: number; employees: number };
  issues: Issue[];
  fileName: string;
  filed: { id: string; version: number; fileSequence: number } | null;
};
type Filed = { id: string; period: string; version: number; status: string; filed_at: string; declaration_data: { fileName: string; totals: Prepared['totals'] } };

function download(content: string, fileName: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** UI-19 style register of the declaration, for manual capture on uFiling. */
function registerCsv(p: Prepared): string {
  const cell = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = [
    ['Surname', 'First names', 'ID number', 'Passport / other', 'Employee number', 'Date of birth', 'Employed from', 'Employed to', 'Status', 'Non-contribution reason', 'Gross taxable remuneration', 'Remuneration subject to UIF', 'UIF contribution (employee + employer)'],
    ...p.lines.map((l) => [l.surname, l.firstNames, l.idNumber, l.otherNumber, l.employeeNumber, l.dateOfBirth, l.employedFrom, l.employedTo,
      UIF_EMPLOYMENT_STATUS[l.status]?.label ?? l.status, l.nonContributionReason ? UIF_NON_CONTRIBUTION[l.nonContributionReason] : '',
      l.grossTaxable.toFixed(2), l.uifRemuneration.toFixed(2), l.contribution.toFixed(2)]),
  ];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * Monthly UIF declaration to the Department of Employment and Labour (E03 file). The payment
 * itself goes to SARS on the EMP201; this declares who was employed and earned what.
 */
export default function UifDeclarationPanel() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const historyKey = ['statutory-returns', companyId, 'UIF_DECLARATION'];
  const { data: history } = useQuery({
    queryKey: historyKey,
    queryFn: () => invokePayroll<Filed[]>({ method: 'LIST_STATUTORY_RETURNS', company_id: companyId, returnType: 'UIF_DECLARATION' }),
    enabled: !!companyId,
  });
  const prepare = useMutation({
    mutationFn: () => invokePayroll<Prepared>({ method: 'PREPARE_UIF_DECLARATION', company_id: companyId, month }),
    onSuccess: setPrepared,
    onError: (e: Error) => showError(e.message),
  });
  const exportFile = useMutation({
    mutationFn: (live: boolean) => invokePayroll<{ fileName: string; content: string }>({ method: 'EXPORT_UIF_DECLARATION', company_id: companyId, month, live }),
    onSuccess: (r, live) => {
      download(r.content, live ? r.fileName : `${r.fileName}.TEST`);
      showSuccess(live ? `Saved ${r.fileName}. Email it to declarations@labour.gov.za with the subject "Declarations".` : 'Test file downloaded.');
      queryClient.invalidateQueries({ queryKey: historyKey });
    },
    onError: (e: Error) => showError(e.message),
  });
  const errors = prepared?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = prepared?.issues.filter((i) => i.severity === 'warning') ?? [];

  return (
    <div className="space-y-4" data-testid="uif-declaration-panel">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="uif-month">Month</Label>
          <Input id="uif-month" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPrepared(null); }} className="w-44" />
        </div>
        <Button onClick={() => prepare.mutate()} disabled={prepare.isPending}>
          {prepare.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Prepare declaration
        </Button>
        {prepared && (
          <>
            <Button variant="outline" onClick={() => exportFile.mutate(false)} disabled={exportFile.isPending || errors.length > 0}><Download className="mr-1 h-4 w-4" />Test file</Button>
            <Button onClick={() => exportFile.mutate(true)} disabled={exportFile.isPending || errors.length > 0} data-testid="uif-live-file"><Download className="mr-1 h-4 w-4" />Declaration file</Button>
            <Button variant="ghost" onClick={() => download(registerCsv(prepared), `UIF_register_${month}.csv`, 'text/csv')}><Download className="mr-1 h-4 w-4" />Register (CSV)</Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Declares every employee employed in the month to the Department of Employment and Labour (UIF E03 file), by the 7th of the next month: email the file to
        declarations@labour.gov.za with the subject "Declarations", one file per email. The register helps with capturing on uFiling (e.g. foreign nationals).
      </p>
      {errors.length > 0 && (
        <Alert variant="destructive"><AlertTitle>To fix first</AlertTitle><AlertDescription><ul className="list-disc pl-5">{errors.map((i, n) => <li key={n}>{i.message}</li>)}</ul></AlertDescription></Alert>
      )}
      {warnings.length > 0 && (
        <Alert><AlertTitle>Check</AlertTitle><AlertDescription><ul className="list-disc pl-5 max-h-40 overflow-auto">{warnings.map((i, n) => <li key={n}>{i.message}</li>)}</ul></AlertDescription></Alert>
      )}
      {prepared && (
        <>
          <p className="text-sm">
            {prepared.totals.employees} employee{prepared.totals.employees === 1 ? '' : 's'} · gross {formatCurrency(prepared.totals.gross)} · UIF remuneration {formatCurrency(prepared.totals.remuneration)} ·
            contributions {formatCurrency(prepared.totals.contributions)} · file {prepared.fileName}{prepared.filed ? ` (replaces the file sent before, version ${prepared.filed.version})` : ''}
          </p>
          <div className="overflow-x-auto">
            <Table data-testid="uif-lines">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead><TableHead>Status</TableHead>
                  <TableHead className="text-right">Gross</TableHead><TableHead className="text-right">UIF remuneration</TableHead><TableHead className="text-right">Contribution</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prepared.lines.map((l) => (
                  <TableRow key={l.employeeId}>
                    <TableCell>{l.firstNames} {l.surname}<div className="text-xs text-muted-foreground">{l.idNumber ?? l.otherNumber ?? l.employeeNumber}</div></TableCell>
                    <TableCell className="text-sm">
                      {UIF_EMPLOYMENT_STATUS[l.status]?.label ?? l.status}
                      {l.nonContributionReason && <div className="text-xs text-muted-foreground">{UIF_NON_CONTRIBUTION[l.nonContributionReason]}</div>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(l.grossTaxable)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(l.uifRemuneration)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(l.contribution)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {(history ?? []).length > 0 && (
        <div className="space-y-1">
          <div className="text-sm font-semibold">Declaration files</div>
          <ul className="text-sm text-muted-foreground">
            {(history ?? []).map((h) => (
              <li key={h.id}>
                {h.period} · {h.declaration_data.fileName} · {h.declaration_data.totals?.employees} employees · {formatCurrency(h.declaration_data.totals?.contributions ?? 0)}
                {h.status === 'superseded' ? <Badge variant="outline" className="ml-2">Replaced</Badge> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
