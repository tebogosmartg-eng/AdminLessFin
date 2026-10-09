import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import { Download, FileCheck2, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { accountsQuery } from '../../lib/queries';
import { showError, showSuccess } from '../../utils/toast';
import type { Emp201Declaration } from '../../lib/sars/emp201';
import { downloadEmp201Csv, downloadEmp201Pdf, type FiledEmp201 } from '../../lib/sars/emp201Documents';

type Issue = { severity: 'error' | 'warning'; code: string; message: string };
type Prepared = {
  declaration: Emp201Declaration;
  issues: Issue[];
  taxYear: string;
  filed: { id: string; status: string; version: number; filed_at: string } | null;
};
type FiledRow = FiledEmp201 & { return_type: string; superseded_reason: string | null; journal_entry_id: string | null };
type Account = { id: string; name: string; type: string };

const STATUS_LABEL: Record<string, string> = {
  ready: 'Filed — not yet submitted', submitted: 'Submitted to SARS', superseded: 'Replaced',
};

/**
 * EMP201: prepare a month from finalised payroll (with ETI), file it (locked, optional
 * ETI journal), download it, and record the SARS payment reference once submitted.
 */
export default function Emp201Panel() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const [liabilityAccountId, setLiabilityAccountId] = useState('');
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [replaceReason, setReplaceReason] = useState('');
  const [submitFor, setSubmitFor] = useState<FiledRow | null>(null);
  const [reference, setReference] = useState('');

  const historyKey = ['statutory-returns', companyId, 'EMP201'];
  const { data: history, error: historyError } = useQuery({
    queryKey: historyKey,
    queryFn: () => invokePayroll<FiledRow[]>({ method: 'LIST_STATUTORY_RETURNS', company_id: companyId, returnType: 'EMP201' }),
    enabled: !!companyId,
    // A refusal (e.g. an older payroll service) will not succeed on retry.
    retry: (count, err) => !/Unsupported method|not available on the server/i.test(String((err as Error)?.message)) && count < 1,
  });
  const { data: employerProfile } = useQuery({
    queryKey: ['payroll-employer-profile', companyId ?? ''],
    queryFn: () => invokePayroll<{ profile: { trading_name: string; paye_reference: string } | null }>({ method: 'GET_EMPLOYER_PROFILE', company_id: companyId }),
    enabled: !!companyId,
  });
  const { data: accounts } = useQuery({ ...accountsQuery(companyId ?? ''), enabled: !!companyId && fileOpen });
  const employer = {
    name: employerProfile?.profile?.trading_name ?? activeCompany?.name ?? 'Employer',
    payeReference: employerProfile?.profile?.paye_reference ?? null,
  };

  const prepare = useMutation({
    mutationFn: () => invokePayroll<Prepared>({ method: 'PREPARE_EMP201', company_id: companyId, month }),
    onSuccess: setPrepared,
    onError: (error: Error) => showError(error.message),
  });

  const file = useMutation({
    mutationFn: () => invokePayroll<{ return: FiledRow }>({
      method: 'FILE_EMP201', company_id: companyId, month,
      replaceReason: prepared?.filed ? replaceReason : undefined,
      postEti: liabilityAccountId && incomeAccountId ? { liabilityAccountId, incomeAccountId } : undefined,
    }),
    onSuccess: () => {
      showSuccess(`EMP201 for ${month} filed.`);
      setFileOpen(false);
      setReplaceReason('');
      queryClient.invalidateQueries({ queryKey: historyKey });
      prepare.mutate();
    },
    onError: (error: Error) => showError(error.message),
  });

  const submit = useMutation({
    mutationFn: () => invokePayroll({ method: 'RECORD_RETURN_SUBMISSION', company_id: companyId, returnId: submitFor?.id, reference }),
    onSuccess: () => {
      showSuccess('Submission recorded.');
      setSubmitFor(null);
      setReference('');
      queryClient.invalidateQueries({ queryKey: historyKey });
    },
    onError: (error: Error) => showError(error.message),
  });

  const d = prepared?.declaration;
  const errors = prepared?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = prepared?.issues.filter((i) => i.severity === 'warning') ?? [];
  const etiAccounts = {
    liability: (accounts as Account[] | undefined)?.filter((a) => a.type === 'Liability') ?? [],
    income: (accounts as Account[] | undefined)?.filter((a) => a.type === 'Income') ?? [],
  };

  return (
    <div className="space-y-4" data-testid="emp201-panel">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="emp201-month">Month</Label>
          <Input id="emp201-month" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPrepared(null); }} className="w-44" />
        </div>
        <Button onClick={() => prepare.mutate()} disabled={!month || prepare.isPending}>
          {prepare.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          Prepare EMP201
        </Button>
        {d && (
          <Button variant="default" onClick={() => setFileOpen(true)} disabled={errors.length > 0} data-testid="emp201-file">
            <FileCheck2 className="mr-2 h-4 w-4" /> {prepared?.filed ? 'File a correction' : 'File EMP201'}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Built from finalised payroll paid in the month. Filing locks it here; capture the amounts on SARS eFiling, then record the payment reference (PRN).
      </p>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Not ready to file</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5">{errors.map((i) => <li key={i.code + i.message}>{i.message}</li>)}</ul></AlertDescription>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert>
          <AlertTitle>Check before filing</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5">{warnings.map((i) => <li key={i.code + i.message}>{i.message}</li>)}</ul></AlertDescription>
        </Alert>
      )}
      {prepared?.filed && (
        <Alert>
          <AlertDescription>
            Already filed (version {prepared.filed.version}, {format(new Date(prepared.filed.filed_at), 'PPP')}). Filing again replaces it and needs a reason.
          </AlertDescription>
        </Alert>
      )}

      {d && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          <Table data-testid="emp201-totals">
            <TableBody>
              <TableRow><TableCell>PAYE</TableCell><TableCell className="text-right font-mono">{formatCurrency(d.paye)}</TableCell></TableRow>
              <TableRow><TableCell>SDL</TableCell><TableCell className="text-right font-mono">{formatCurrency(d.sdl)}</TableCell></TableRow>
              <TableRow><TableCell>UIF</TableCell><TableCell className="text-right font-mono">{formatCurrency(d.uif)}</TableCell></TableRow>
              <TableRow><TableCell>ETI this month</TableCell><TableCell className="text-right font-mono">{formatCurrency(d.eti.calculated)}</TableCell></TableRow>
              <TableRow><TableCell>ETI brought forward</TableCell><TableCell className="text-right font-mono">{formatCurrency(d.eti.broughtForward)}</TableCell></TableRow>
              <TableRow><TableCell>ETI used against PAYE</TableCell><TableCell className="text-right font-mono">{d.eti.utilised > 0 ? `−${formatCurrency(d.eti.utilised)}` : formatCurrency(0)}</TableCell></TableRow>
              <TableRow><TableCell>ETI carried forward</TableCell><TableCell className="text-right font-mono">{formatCurrency(d.eti.carriedForward)}</TableCell></TableRow>
              <TableRow><TableCell className="font-semibold">Total payable</TableCell><TableCell className="text-right font-mono font-semibold">{formatCurrency(d.totalPayable)}</TableCell></TableRow>
            </TableBody>
          </Table>
          <div className="space-y-2">
            {!d.eti.employerEligible && <p className="text-sm text-muted-foreground">ETI: {d.eti.employerReason}</p>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Remuneration</TableHead>
                  <TableHead className="text-right">PAYE</TableHead>
                  <TableHead className="text-right">ETI</TableHead>
                  <TableHead>ETI note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.employees.map((l) => (
                  <TableRow key={l.employeeId}>
                    <TableCell>{l.name}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(l.remuneration)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(l.paye)}</TableCell>
                    <TableCell className="text-right font-mono">{l.eti ? formatCurrency(l.eti.eti) : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.eti ? (l.eti.qualifies ? `Cycle ${l.eti.cycle}, ${l.eti.hoursReported} h` : l.eti.reason) : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Filed EMP201s</h3>
        {historyError ? (
          <Alert variant="destructive">
            <AlertDescription>Filed returns could not be loaded: {(historyError as Error).message}</AlertDescription>
          </Alert>
        ) : !history?.length ? (
          <p className="text-sm text-muted-foreground">None filed yet.</p>
        ) : (
          <Table data-testid="emp201-history">
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total payable</TableHead>
                <TableHead>PRN</TableHead>
                <TableHead className="text-right">Files</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id} className={h.status === 'superseded' ? 'opacity-60' : undefined}>
                  <TableCell className="font-mono">{h.period} <span className="text-xs text-muted-foreground">v{h.version}</span></TableCell>
                  <TableCell>
                    <Badge variant={h.status === 'submitted' ? 'default' : 'secondary'}>{STATUS_LABEL[h.status] ?? h.status}</Badge>
                    {h.superseded_reason && <div className="text-xs text-muted-foreground mt-1">{h.superseded_reason}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(h.declaration_data.totalPayable)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {h.submission_reference ?? (h.status === 'ready' ? (
                      <Button size="sm" variant="outline" onClick={() => setSubmitFor(h)}>Record PRN</Button>
                    ) : '—')}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => downloadEmp201Pdf(h, employer)} aria-label={`Download EMP201 ${h.period} PDF`}>
                      <Download className="mr-1 h-3 w-3" />PDF
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadEmp201Csv(h, employer.name)} aria-label={`Download EMP201 ${h.period} CSV`}>
                      <Download className="mr-1 h-3 w-3" />CSV
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={fileOpen} onOpenChange={setFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File EMP201 for {month}</DialogTitle>
            <DialogDescription>
              The declaration is locked once filed. Total payable {d ? formatCurrency(d.totalPayable) : ''}.
            </DialogDescription>
          </DialogHeader>
          {d && d.eti.utilised > 0 && (
            <div className="space-y-2">
              <p className="text-sm">
                Post the {formatCurrency(d.eti.utilised)} ETI used against PAYE to the ledger (Dr PAYE liability, Cr ETI income)? Leave blank to file without posting.
              </p>
              <Select value={liabilityAccountId} onValueChange={setLiabilityAccountId}>
                <SelectTrigger aria-label="PAYE liability account"><SelectValue placeholder="PAYE liability account…" /></SelectTrigger>
                <SelectContent>{etiAccounts.liability.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={incomeAccountId} onValueChange={setIncomeAccountId}>
                <SelectTrigger aria-label="ETI income account"><SelectValue placeholder="ETI income account…" /></SelectTrigger>
                <SelectContent>{etiAccounts.income.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {prepared?.filed && (
            <div className="space-y-1">
              <Label htmlFor="emp201-replace-reason">Reason for the correction</Label>
              <Textarea id="emp201-replace-reason" value={replaceReason} onChange={(e) => setReplaceReason(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileOpen(false)}>Cancel</Button>
            <Button
              onClick={() => file.mutate()}
              disabled={file.isPending || (!!prepared?.filed && replaceReason.trim().length < 10) || (!!liabilityAccountId !== !!incomeAccountId)}
              data-testid="emp201-confirm-file"
            >
              {file.isPending ? 'Filing…' : 'File EMP201'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!submitFor} onOpenChange={(open) => !open && setSubmitFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record submission for {submitFor?.period}</DialogTitle>
            <DialogDescription>Enter the payment reference number (PRN) from SARS eFiling after submitting the EMP201.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Payment reference number" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 7230767891LC2611" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitFor(null)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || reference.trim().length < 4}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
