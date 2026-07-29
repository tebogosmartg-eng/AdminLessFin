import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  CheckCircle,
  Download,
  FileText,
  Mail,
  BookOpen,
  Users,
  AlertTriangle,
  ExternalLink,
  Landmark,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { formatCurrency } from '../../lib/utils';
import type { PayrollRunSummaryReport, BankBatchMetadata } from '../../lib/payrollDocuments';
import { BANK_BATCH_STATUS_LABELS } from '../../lib/payrollDocuments';
import JournalEntryDetail from '../JournalEntryDetail';
import { useState } from 'react';

type OutputMetadata = {
  payslips_generated?: number;
  reports_generated?: boolean;
  register_generated?: boolean;
  journal_posted?: boolean;
  emails_sent?: number;
  email_failures?: { payslip_id: string; reason: string }[];
  distribution_complete?: boolean;
  bank_batch?: BankBatchMetadata;
  bank_file_generated?: boolean;
};

type Props = {
  run: {
    id: string;
    pay_period_start: string;
    pay_period_end: string;
    pay_date: string;
    processed_at?: string | null;
    journal_entry_id?: string | null;
    output_metadata?: OutputMetadata | null;
  };
  summary: PayrollRunSummaryReport | null;
  payslipCount: number;
  onDownloadRegister: () => void;
  onDownloadSummary: () => void;
  onDownloadAllPayslips: () => void;
  onDownloadBankFile?: (format: 'csv' | 'eft') => void;
  onAdvanceBankBatch?: () => void;
  onEmailAll: () => void;
  isEmailing?: boolean;
  warnings?: string[];
};

const PayrollCommandCentre = ({
  run,
  summary,
  payslipCount,
  onDownloadRegister,
  onDownloadSummary,
  onDownloadAllPayslips,
  onDownloadBankFile,
  onAdvanceBankBatch,
  onEmailAll,
  isEmailing,
  warnings = [],
}: Props) => {
  const navigate = useNavigate();
  const [journalOpen, setJournalOpen] = useState(false);
  const meta = run.output_metadata ?? {};
  const bankBatch = meta.bank_batch;

  return (
    <>
      <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600 shrink-0" />
              <div>
                <CardTitle className="text-green-800 dark:text-green-300">Payroll Completed</CardTitle>
                <CardDescription>
                  {format(new Date(run.pay_period_start), 'PPP')} – {format(new Date(run.pay_period_end), 'PPP')}
                  {run.processed_at && ` · Finalized ${format(new Date(run.processed_at), 'PPP p')}`}
                </CardDescription>
              </div>
            </div>
            <Badge variant="success" className="capitalize">Finalized</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Employees Paid</p>
              <p className="text-2xl font-bold">{summary?.employees_paid ?? payslipCount}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Gross Pay</p>
              <p className="text-2xl font-bold font-mono">{formatCurrency(summary?.total_gross ?? 0)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Net Pay</p>
              <p className="text-2xl font-bold font-mono">{formatCurrency(summary?.total_net ?? 0)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">PAYE</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(summary?.total_paye ?? 0)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">UIF</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(summary?.total_uif ?? 0)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">SDL</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(summary?.total_sdl ?? 0)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Payslip Status</p>
              <p className="text-lg font-semibold">{meta.payslips_generated ?? payslipCount} generated</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Bank Batch</p>
              <p className="text-lg font-semibold capitalize">
                {bankBatch?.status ? BANK_BATCH_STATUS_LABELS[bankBatch.status] : 'Not generated'}
              </p>
            </div>
            {summary && (
              <>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Payroll Cost (CTC)</p>
                  <p className="text-lg font-semibold font-mono">{formatCurrency(summary.payroll_cost)}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Variance vs Previous</p>
                  <p className={cnVariance(summary.variance_previous)}>
                    {summary.variance_previous != null ? formatCurrency(summary.variance_previous) : 'N/A'}
                  </p>
                </div>
              </>
            )}
          </div>

          {bankBatch && (
            <div className="rounded-lg border bg-card p-4">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Landmark className="h-4 w-4" /> Bank Payment Batch
              </h4>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {(['generated', 'downloaded', 'submitted', 'paid'] as const).map((step, idx) => (
                  <span key={step} className="flex items-center gap-1">
                    <Badge variant={bankBatch.status === step || idx < ['generated', 'downloaded', 'submitted', 'paid'].indexOf(bankBatch.status) + 1 ? 'default' : 'outline'}>
                      {BANK_BATCH_STATUS_LABELS[step]}
                    </Badge>
                    {idx < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {bankBatch.employee_count} payments · {formatCurrency(bankBatch.total_amount)} · Format: {bankBatch.format?.toUpperCase()}
              </p>
              {onAdvanceBankBatch && bankBatch.status !== 'paid' && (
                <Button size="sm" variant="outline" className="mt-2" onClick={onAdvanceBankBatch}>
                  Mark as {bankBatch.status === 'generated' ? 'Downloaded' : bankBatch.status === 'downloaded' ? 'Submitted' : 'Paid'}
                </Button>
              )}
            </div>
          )}

          {warnings.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 mt-1">
                  {warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {(meta.email_failures?.length ?? 0) > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Email Failures</AlertTitle>
              <AlertDescription>
                {meta.email_failures!.length} payslip(s) could not be emailed.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-3">Quick Actions</h4>
            <div className="flex flex-wrap gap-2">
              {run.journal_entry_id && (
                <Button variant="outline" size="sm" onClick={() => setJournalOpen(true)}>
                  <BookOpen className="mr-2 h-4 w-4" /> View Journal
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onDownloadRegister}>
                <Download className="mr-2 h-4 w-4" /> Download Register
              </Button>
              <Button variant="outline" size="sm" onClick={onDownloadSummary}>
                <FileText className="mr-2 h-4 w-4" /> Download Summary
              </Button>
              {onDownloadBankFile && (
                <>
                  <Button variant="outline" size="sm" onClick={() => onDownloadBankFile('csv')}>
                    <Landmark className="mr-2 h-4 w-4" /> Bank File (CSV)
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onDownloadBankFile('eft')}>
                    <Landmark className="mr-2 h-4 w-4" /> Bank File (EFT)
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={onDownloadAllPayslips}>
                <Download className="mr-2 h-4 w-4" /> Download Payslips (PDF)
              </Button>
              <Button size="sm" onClick={onEmailAll} disabled={isEmailing}>
                <Mail className="mr-2 h-4 w-4" />
                {isEmailing ? 'Sending…' : 'Email All Payslips'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/payroll-reports')}>
                <FileText className="mr-2 h-4 w-4" /> Reports
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/employees')}>
                <Users className="mr-2 h-4 w-4" /> Employee History
                <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {run.journal_entry_id && (
        <JournalEntryDetail
          entryId={run.journal_entry_id}
          isOpen={journalOpen}
          setIsOpen={setJournalOpen}
        />
      )}
    </>
  );
};

function cnVariance(value: number | null | undefined) {
  if (value == null) return 'text-lg font-semibold';
  const base = 'text-lg font-semibold font-mono';
  if (value > 0) return `${base} text-amber-600`;
  if (value < 0) return `${base} text-green-600`;
  return base;
}

export default PayrollCommandCentre;
