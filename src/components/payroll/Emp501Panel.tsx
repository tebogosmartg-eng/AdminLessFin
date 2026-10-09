import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, Download, FileCheck2, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';
import type { Emp501Reconciliation, FilingIssue, TaxCertificate } from '../../lib/sars/emp501';
import { reconciliationPeriod, type Emp501Kind } from '../../lib/sars/statutoryCalendar';
import { downloadCertificatesPdf, downloadEasyFile, type IssuedCertificate } from '../../lib/sars/certificateDocuments';
import type { EmployerProfile } from '../../lib/sars/employerProfile';

type Prepared = {
  reconciliation: Emp501Reconciliation;
  certificates: TaxCertificate[];
  issues: FilingIssue[];
  filed: { id: string; status: string; version: number; filed_at: string | null } | null;
};
type FiledEmp501 = {
  id: string;
  period: string;
  version: number;
  status: string;
  filed_at: string | null;
  approved_at: string | null;
  self_approved: boolean | null;
  submission_reference: string | null;
  superseded_reason: string | null;
  declaration_data: { kind: Emp501Kind; yearOfAssessment: number; certificateCount: number; reconciliation: Emp501Reconciliation };
};

const KIND_LABEL: Record<Emp501Kind, string> = { interim: 'Interim (March–August)', annual: 'Annual (March–February)' };

function statusLabel(row: FiledEmp501): string {
  if (row.status === 'superseded') return 'Replaced';
  if (row.status === 'submitted' || row.status === 'accepted') return 'Submitted to SARS';
  return row.approved_at ? 'Approved — not yet submitted' : 'Filed — awaiting approval';
}

const diffCell = (n: number) => (Math.abs(n) < 0.005 ? <span className="text-muted-foreground">—</span> : <span className="text-destructive font-semibold">{formatCurrency(n)}</span>);

/**
 * EMP501: reconcile the EMP201s with the certificates and the payments, file it (which
 * issues numbered IRP5 / IT3(a) certificates), approve it, and produce the e@syFile file
 * and the employees' certificates.
 */
export default function Emp501Panel({ yearOfAssessment }: { yearOfAssessment: number }) {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Emp501Kind>('annual');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const [replaceReason, setReplaceReason] = useState('');
  const [submitFor, setSubmitFor] = useState<FiledEmp501 | null>(null);
  const [reference, setReference] = useState('');

  const listKey = ['statutory-returns', companyId, 'EMP501'];
  const { data: filedList } = useQuery({
    queryKey: listKey,
    queryFn: () => invokePayroll<FiledEmp501[]>({ method: 'LIST_STATUTORY_RETURNS', company_id: companyId, returnType: 'EMP501' }),
    enabled: !!companyId,
  });
  const periods = [reconciliationPeriod(yearOfAssessment, 'interim'), reconciliationPeriod(yearOfAssessment, 'annual')];
  const filed = (filedList ?? []).filter((r) => periods.includes(r.period));
  const current = filed.find((r) => r.period === reconciliationPeriod(yearOfAssessment, kind) && r.status !== 'superseded') ?? null;

  const { data: certificates } = useQuery({
    queryKey: ['tax-certificates', companyId, current?.id],
    queryFn: () => invokePayroll<IssuedCertificate[]>({ method: 'LIST_TAX_CERTIFICATES', company_id: companyId, returnId: current?.id }),
    enabled: !!companyId && !!current,
  });
  const { data: employerProfile } = useQuery({
    queryKey: ['payroll-employer-profile', companyId ?? ''],
    queryFn: () => invokePayroll<{ profile: EmployerProfile | null }>({ method: 'GET_EMPLOYER_PROFILE', company_id: companyId }),
    enabled: !!companyId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: listKey });
    queryClient.invalidateQueries({ queryKey: ['tax-certificates', companyId] });
    queryClient.invalidateQueries({ queryKey: ['statutory-workspace', companyId] });
  };

  const prepare = useMutation({
    mutationFn: () => invokePayroll<Prepared>({ method: 'PREPARE_EMP501', company_id: companyId, yearOfAssessment, kind }),
    onSuccess: setPrepared,
    onError: (error: Error) => showError(error.message),
  });
  const file = useMutation({
    mutationFn: () => invokePayroll({
      method: 'FILE_EMP501', company_id: companyId, yearOfAssessment, kind,
      replaceReason: prepared?.filed ? replaceReason.trim() : undefined,
    }),
    onSuccess: () => {
      showSuccess(`EMP501 filed; certificates issued.`);
      setFileOpen(false);
      setReplaceReason('');
      refresh();
      prepare.mutate();
    },
    onError: (error: Error) => showError(error.message),
  });
  const approve = useMutation({
    mutationFn: (returnId: string) => invokePayroll({ method: 'APPROVE_RETURN', company_id: companyId, returnId }),
    onSuccess: () => { showSuccess('EMP501 approved.'); refresh(); },
    onError: (error: Error) => showError(error.message),
  });
  const submit = useMutation({
    mutationFn: () => invokePayroll({ method: 'RECORD_RETURN_SUBMISSION', company_id: companyId, returnId: submitFor?.id, reference: reference.trim() }),
    onSuccess: () => { showSuccess('Submission recorded.'); setSubmitFor(null); setReference(''); refresh(); },
    onError: (error: Error) => showError(error.message),
  });
  const exportFile = useMutation({
    mutationFn: (args: { returnId: string; live: boolean }) =>
      invokePayroll<{ fileName: string; content: string }>({ method: 'EXPORT_EMP501_FILE', company_id: companyId, ...args }),
    onSuccess: (result) => downloadEasyFile(result.content, result.fileName),
    onError: (error: Error) => showError(error.message),
  });

  const p = employerProfile?.profile;
  const employer = {
    name: p?.trading_name ?? activeCompany?.name ?? 'Employer',
    payeReference: p?.paye_reference ?? null,
    sdlReference: p?.sdl_reference ?? null,
    uifReference: p?.uif_reference ?? null,
    address: [p?.address_street_number, p?.address_street_name, p?.address_suburb, p?.address_city, p?.address_postal_code].filter(Boolean).join(', '),
  };
  const errors = prepared?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = prepared?.issues.filter((i) => i.severity === 'warning') ?? [];
  const r = prepared?.reconciliation;

  return (
    <div className="space-y-4" data-testid="emp501-panel">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Reconciliation</Label>
          <Select value={kind} onValueChange={(v) => { setKind(v as Emp501Kind); setPrepared(null); }}>
            <SelectTrigger className="w-60" aria-label="Reconciliation"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="interim">{KIND_LABEL.interim}</SelectItem>
              <SelectItem value="annual">{KIND_LABEL.annual}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => prepare.mutate()} disabled={prepare.isPending}>
          {prepare.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          Reconcile
        </Button>
        {r && (
          <Button onClick={() => setFileOpen(true)} disabled={errors.length > 0} data-testid="emp501-file">
            <FileCheck2 className="mr-2 h-4 w-4" /> {prepared?.filed ? 'File a correction' : 'File EMP501'}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Compares what each EMP201 declared with the employees' certificates and with what was paid. Filing locks the reconciliation and issues
        numbered IRP5 / IT3(a) certificates; after approval, download the e@syFile file and import it into e@syFile Employer.
      </p>

      {errors.length > 0 && (
        <Alert variant="destructive" data-testid="emp501-errors">
          <AlertTitle>{errors.length} issue{errors.length === 1 ? '' : 's'} to fix before filing</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 max-h-60 overflow-auto">{errors.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert>
          <AlertTitle>Check before filing</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 max-h-40 overflow-auto">{warnings.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}

      {r && (
        <>
          <Table data-testid="emp501-reconciliation">
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">PAYE declared</TableHead>
                <TableHead className="text-right">PAYE on certificates</TableHead>
                <TableHead className="text-right">UIF difference</TableHead>
                <TableHead className="text-right">SDL difference</TableHead>
                <TableHead className="text-right">Payable</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Unpaid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="font-mono">{m.month}{!m.declared && m.hasPayroll && <Badge variant="destructive" className="ml-2">No EMP201</Badge>}</TableCell>
                  <TableCell className="text-right font-mono">{m.declared ? formatCurrency(m.declared.paye) : '—'}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(m.certificates.paye)} {m.differences.paye ? <span className="text-destructive">({formatCurrency(m.differences.paye)})</span> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono">{diffCell(m.differences.uif)}</TableCell>
                  <TableCell className="text-right font-mono">{diffCell(m.differences.sdl)}</TableCell>
                  <TableCell className="text-right font-mono">{m.declared ? formatCurrency(m.declared.totalPayable) : '—'}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(m.paid)}</TableCell>
                  <TableCell className="text-right font-mono">{m.declared ? diffCell(m.differences.payment) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(r.totals.declared.paye)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(r.totals.certificates.paye)}</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-mono">{formatCurrency(r.totals.declared.payable)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(r.totals.paid)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
          <p className="text-sm text-muted-foreground">
            {r.certificateCount.irp5} IRP5 and {r.certificateCount.it3a} IT3(a) certificate{r.certificateCount.it3a === 1 ? '' : 's'} ·
            ETI on certificates {formatCurrency(r.totals.certificates.eti)} · ETI used on EMP201s {formatCurrency(r.totals.declared.eti)}
          </p>
          <Table data-testid="emp501-certificates-preview">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead className="text-right">Taxable income</TableHead>
                <TableHead className="text-right">PAYE</TableHead>
                <TableHead>Checks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prepared!.certificates.map((c) => {
                const bad = c.issues.filter((i) => i.severity === 'error').length;
                return (
                  <TableRow key={c.employeeId}>
                    <TableCell>{c.employeeName}</TableCell>
                    <TableCell>{c.certificateType === 'IRP5' ? 'IRP5' : `IT3(a) · reason ${c.reasonCode}`}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(c.grossTaxable)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(c.tax.paye)}</TableCell>
                    <TableCell>{bad ? <Badge variant="destructive">{bad} to fix</Badge> : <Badge variant="secondary">OK</Badge>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Filed EMP501s for {yearOfAssessment}</h3>
        {!filed.length ? (
          <p className="text-sm text-muted-foreground">None filed yet.</p>
        ) : (
          <Table data-testid="emp501-history">
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Certificates</TableHead>
                <TableHead>Submission</TableHead>
                <TableHead className="text-right">Files</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filed.map((h) => (
                <TableRow key={h.id} className={h.status === 'superseded' ? 'opacity-60' : undefined}>
                  <TableCell className="font-mono">
                    {h.period} <span className="text-xs text-muted-foreground">v{h.version} · {h.declaration_data.kind}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={h.status === 'submitted' ? 'default' : 'secondary'}>{statusLabel(h)}</Badge>
                    {h.superseded_reason && <div className="text-xs text-muted-foreground mt-1">{h.superseded_reason}</div>}
                    {h.self_approved && <div className="text-xs text-muted-foreground mt-1">Self-approved (owner exception)</div>}
                  </TableCell>
                  <TableCell className="text-right">{h.declaration_data.certificateCount}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {h.submission_reference ?? (h.status === 'ready' ? (
                      h.approved_at ? (
                        <Button size="sm" variant="outline" onClick={() => setSubmitFor(h)}>Record submission</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => approve.mutate(h.id)} disabled={approve.isPending} aria-label={`Approve EMP501 ${h.period}`}>
                          <CheckCircle2 className="mr-1 h-3 w-3" />Approve
                        </Button>
                      )
                    ) : '—')}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {h.status !== 'superseded' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => exportFile.mutate({ returnId: h.id, live: false })} disabled={exportFile.isPending}>
                          <Download className="mr-1 h-3 w-3" />e@syFile (test)
                        </Button>
                        <Button
                          size="sm" variant="ghost" onClick={() => exportFile.mutate({ returnId: h.id, live: true })}
                          disabled={exportFile.isPending || !h.approved_at}
                          title={h.approved_at ? undefined : 'Approve the EMP501 first'}
                        >
                          <Download className="mr-1 h-3 w-3" />e@syFile (live)
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {current && (certificates ?? []).length > 0 && (
        <div className="space-y-2" data-testid="tax-certificates">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Certificates issued ({KIND_LABEL[kind]})</h3>
            <Button
              size="sm" variant="outline"
              onClick={() => downloadCertificatesPdf(certificates!.filter((c) => c.status === 'issued'), employer, `Certificates_${current.period}_v${current.version}.pdf`)}
            >
              <Download className="mr-1 h-3 w-3" />All certificates (PDF)
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Certificate number</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certificates!.map((c) => (
                <TableRow key={c.id} className={c.status === 'cancelled' ? 'opacity-60' : undefined}>
                  <TableCell className="font-mono text-xs">{c.certificate_number}</TableCell>
                  <TableCell>{c.certificate_data.employeeName}</TableCell>
                  <TableCell>{c.certificate_type === 'IRP5' ? 'IRP5' : 'IT3(a)'}</TableCell>
                  <TableCell>{c.status === 'issued' ? 'Issued' : `Cancelled — ${c.cancelled_reason ?? ''}`}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm" variant="ghost" aria-label={`Certificate PDF for ${c.certificate_data.employeeName}`}
                      onClick={() => downloadCertificatesPdf([c], employer, `${c.certificate_type}_${c.certificate_number}.pdf`)}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={fileOpen} onOpenChange={setFileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File the {kind} EMP501 for {yearOfAssessment}</DialogTitle>
            <DialogDescription>
              The reconciliation is locked and {prepared?.certificates.length ?? 0} certificate{prepared?.certificates.length === 1 ? '' : 's'} are
              issued with new numbers. Numbers are never reused: a correction cancels these certificates and issues new ones.
            </DialogDescription>
          </DialogHeader>
          {prepared?.filed && (
            <div className="space-y-1">
              <Label htmlFor="emp501-replace-reason">Reason for the correction</Label>
              <Textarea id="emp501-replace-reason" value={replaceReason} onChange={(e) => setReplaceReason(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileOpen(false)}>Cancel</Button>
            <Button onClick={() => file.mutate()} disabled={file.isPending || (!!prepared?.filed && replaceReason.trim().length < 10)} data-testid="emp501-confirm-file">
              {file.isPending ? 'Filing…' : 'File EMP501'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!submitFor} onOpenChange={(open) => !open && setSubmitFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record EMP501 submission</DialogTitle>
            <DialogDescription>Enter the submission reference e@syFile or eFiling gave you{submitFor?.filed_at ? ` (filed ${format(new Date(submitFor.filed_at), 'PPP')})` : ''}.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Submission reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitFor(null)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || reference.trim().length < 4}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
