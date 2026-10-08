import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, Download, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { invokeImport, type EntitySpec, type ImportRun, type OutcomeCounts } from '../api';
import { downloadErrorReport, formatMoney } from '../labels';
import { importKeys } from '../queries';
import { RowsTable } from './ReviewStep';

interface Reconciliation {
  journals: number;
  total_debit: number;
  total_credit: number;
  balanced: boolean;
  compares_file: boolean;
  take_on?: boolean;
  accounts: Array<{
    account_id: string;
    account: string;
    posted_debit: number;
    posted_credit: number;
    file_debit: number | null;
    file_credit: number | null;
    matches: boolean | null;
  }>;
}

const WHERE_TO_LOOK: Record<string, { to: string; label: string }> = {
  customers: { to: '/customers', label: 'Go to customers' },
  vendors: { to: '/vendors', label: 'Go to suppliers' },
  products: { to: '/products', label: 'Go to products & services' },
  chart_of_accounts: { to: '/chart-of-accounts', label: 'Go to chart of accounts' },
  invoices: { to: '/invoices', label: 'Go to invoices' },
  bills: { to: '/bills', label: 'Go to bills' },
  customer_payments: { to: '/invoices', label: 'Go to invoices' },
  supplier_payments: { to: '/bills', label: 'Go to bills' },
  bank_transactions: { to: '/banking/reconciliation', label: 'Reconcile these transactions' },
  journal_entries: { to: '/journal-entries', label: 'Go to journal entries' },
  opening_balances: { to: '/trial-balance', label: 'Open the trial balance' },
};

function ReconciliationPanel({ companyId, run }: { companyId: string; run: ImportRun }) {
  const query = useQuery({
    queryKey: importKeys.reconcile(companyId, run.id),
    queryFn: () => invokeImport<Reconciliation>(companyId, 'RECONCILE', { run_id: run.id }),
  });
  if (query.isLoading) return <Loader2 className="h-5 w-5 animate-spin" aria-label="Checking the ledger" />;
  if (query.error) return <p className="text-sm text-destructive">The ledger check could not run: {(query.error as Error).message}</p>;
  const r = query.data;
  if (!r || (r.journals === 0 && !r.take_on)) return null;
  const mismatches = r.accounts.filter(a => a.matches === false).length;
  const ok = r.balanced && mismatches === 0;

  return (
    <section className="space-y-3" data-testid="import-reconciliation">
      <div className={`flex items-center gap-2 font-medium ${ok ? 'text-primary' : 'text-destructive'}`}>
        {ok ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <CircleAlert className="h-5 w-5" aria-hidden />}
        {ok
          ? (r.take_on
            ? 'Check passed: every account in your file now holds exactly the balance your old system shows.'
            : `Ledger check passed: ${r.journals} journal${r.journals === 1 ? '' : 's'} posted for ${formatMoney(r.total_debit)}, debits equal credits${r.compares_file ? ', and every account matches your file' : ''}.`)
          : `Ledger check found ${mismatches ? `${mismatches} account(s) that differ from the file` : 'unbalanced postings'}. Please review.`}
      </div>
      {r.compares_file && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Your file · debit</TableHead>
                <TableHead className="text-right">Your file · credit</TableHead>
                <TableHead className="text-right">{r.take_on ? 'In the books · debit' : 'Posted · debit'}</TableHead>
                <TableHead className="text-right">{r.take_on ? 'In the books · credit' : 'Posted · credit'}</TableHead>
                <TableHead className="sr-only">Matches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.accounts.map(a => (
                <TableRow key={a.account_id}>
                  <TableCell>{a.account}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.file_debit == null ? '' : formatMoney(a.file_debit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.file_credit == null ? '' : formatMoney(a.file_credit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(a.posted_debit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(a.posted_credit)}</TableCell>
                  <TableCell className="text-sm">
                    {a.matches === true && <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Matches" />}
                    {a.matches === false && <span className="text-destructive">Differs</span>}
                    {a.matches === null && <span className="text-muted-foreground">Balancing entry</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">{r.take_on ? 'Total in the books' : 'Total posted'}</TableCell>
                <TableCell colSpan={2} />
                <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.total_debit)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.total_credit)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </section>
  );
}

interface Props {
  companyId: string;
  run: ImportRun;
  spec: EntitySpec;
  counts: OutcomeCounts | null;
  importing: boolean;
  importError: string | null;
  onResume: () => void;
}

export function ResultStep({ companyId, run, spec, counts, importing, importError, onResume }: Props) {
  const [downloading, setDownloading] = useState(false);
  const total = run.totals.rows ?? run.row_count;
  const done = counts ? counts.imported + counts.updated + counts.skipped + counts.failed : 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const finished = run.status === 'committed';
  const look = WHERE_TO_LOOK[spec.entity];

  if (!finished) {
    return (
      <div className="space-y-4" data-testid="import-progress">
        <p className="font-medium">{importing ? `Importing ${spec.label.toLowerCase()}…` : 'The import stopped before it finished.'}</p>
        <Progress value={percent} aria-label="Import progress" />
        <p className="text-sm text-muted-foreground">
          {done.toLocaleString()} of {total.toLocaleString()} rows done.
          {importing && ' You can leave this page — the import carries on from where it stopped when you come back.'}
        </p>
        {importError && (
          <Alert variant="destructive">
            <AlertTitle>The import was interrupted</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{importError}</p>
              <p>Nothing is lost or doubled: rows already imported stay imported, and continuing picks up the rest.</p>
              <Button size="sm" variant="outline" onClick={onResume}>Continue the import</Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const c = counts ?? { imported: run.totals.imported ?? 0, updated: run.totals.updated ?? 0, skipped: run.totals.skipped ?? 0, failed: run.totals.failed ?? 0, pending: 0 };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2" data-testid="import-result-summary">
        <span className="text-lg font-medium">Import finished</span>
        <span className="text-primary">{c.imported.toLocaleString()} imported</span>
        {c.updated > 0 && <span>{c.updated.toLocaleString()} updated</span>}
        {c.skipped > 0 && <span className="text-muted-foreground">{c.skipped.toLocaleString()} skipped</span>}
        {c.failed > 0 && <span className="text-destructive">{c.failed.toLocaleString()} failed</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {look && <Button asChild><Link to={look.to}>{look.label}</Link></Button>}
        {(c.failed > 0 || (run.totals.errors ?? 0) > 0) && (
          <Button
            variant="outline"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try { await downloadErrorReport(await invokeImport(companyId, 'ERROR_REPORT', { run_id: run.id })); }
              finally { setDownloading(false); }
            }}
          >
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download rows that were not imported
          </Button>
        )}
      </div>

      {spec.kind === 'transaction' && <ReconciliationPanel companyId={companyId} run={run} />}

      <RowsTable companyId={companyId} run={run} spec={spec} showOutcome />
    </div>
  );
}
