import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleX, Download, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { invokeImport, type EntitySpec, type ImportRun, type StagedRow } from '../api';
import { ACTION_LABELS, OUTCOME_LABELS, downloadErrorReport } from '../labels';
import { importKeys } from '../queries';

const PAGE = 50;

type Filter = 'all' | 'error' | 'warning';

interface Props {
  companyId: string;
  run: ImportRun;
  spec: EntitySpec;
  /** After import, rows show their outcome instead of the plan. */
  showOutcome?: boolean;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function RowsTable({ companyId, run, spec, showOutcome = false }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: importKeys.rows(companyId, run.id, `${filter}:${showOutcome}:${run.status}`, page),
    queryFn: () => invokeImport<{ rows: StagedRow[]; total: number }>(companyId, 'GET_ROWS', {
      run_id: run.id,
      status_filter: filter === 'all' ? undefined : filter,
      offset: page * PAGE,
      limit: PAGE,
    }),
  });

  const keyFields = spec.fields.filter(f => run.mapping[f.key]).slice(0, 4);
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const errors = run.totals.errors ?? 0;
  const warnings = run.totals.warnings ?? 0;

  return (
    <div className="space-y-3">
      <Tabs value={filter} onValueChange={v => { setFilter(v as Filter); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="all">All rows</TabsTrigger>
          <TabsTrigger value="error" disabled={errors === 0}>Errors ({errors})</TabsTrigger>
          <TabsTrigger value="warning" disabled={warnings === 0}>Warnings ({warnings})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="import-review-rows">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Row</TableHead>
              {keyFields.map(f => <TableHead key={f.key}>{f.label}</TableHead>)}
              <TableHead className="w-28">{showOutcome ? 'Result' : 'Will'}</TableHead>
              <TableHead className="min-w-[16rem]">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow><TableCell colSpan={keyFields.length + 3} className="py-8 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Loading rows" />
              </TableCell></TableRow>
            )}
            {query.error && (
              <TableRow><TableCell colSpan={keyFields.length + 3} className="text-destructive">
                The rows could not be loaded: {(query.error as Error).message}
              </TableCell></TableRow>
            )}
            {query.data?.rows.map(row => {
              const failure = row.outcome === 'failed' && typeof row.outcome_detail?.error === 'string' ? row.outcome_detail.error : null;
              const reason = typeof row.outcome_detail?.reason === 'string' ? row.outcome_detail.reason : null;
              return (
                <TableRow key={row.id} className={row.validation_status === 'error' || failure ? 'bg-destructive/5' : undefined}>
                  <TableCell className="tabular-nums text-muted-foreground">{row.row_number}</TableCell>
                  {keyFields.map(f => (
                    <TableCell key={f.key} className="max-w-[14rem] truncate" title={cellText(row.raw[run.mapping[f.key]])}>
                      {cellText(row.raw[run.mapping[f.key]])}
                    </TableCell>
                  ))}
                  <TableCell>
                    {showOutcome ? (
                      <Badge variant={row.outcome === 'failed' ? 'destructive' : row.outcome === 'skipped' ? 'outline' : 'default'}>
                        {OUTCOME_LABELS[row.outcome]}
                      </Badge>
                    ) : row.validation_status === 'error' ? (
                      <Badge variant="destructive">Can't import</Badge>
                    ) : (
                      <Badge variant={row.planned_action === 'skip' ? 'outline' : 'secondary'}>
                        {row.planned_action ? ACTION_LABELS[row.planned_action] : '—'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <ul className="space-y-1">
                      {row.issues.map((issue, i) => (
                        <li key={i} className={`flex gap-1.5 ${issue.severity === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
                          {issue.severity === 'error'
                            ? <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Error" />
                            : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Warning" />}
                          <span>{issue.message}</span>
                        </li>
                      ))}
                      {failure && <li className="text-destructive">Not imported: {failure}</li>}
                      {showOutcome && reason && row.outcome === 'skipped' && <li className="text-muted-foreground">{reason}</li>}
                    </ul>
                  </TableCell>
                </TableRow>
              );
            })}
            {query.data && query.data.rows.length === 0 && (
              <TableRow><TableCell colSpan={keyFields.length + 3} className="py-6 text-center text-muted-foreground">No rows to show.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

interface ReviewProps {
  companyId: string;
  run: ImportRun;
  spec: EntitySpec;
  skipInvalid: boolean;
  onSkipInvalidChange: (v: boolean) => void;
}

export function ReviewStep({ companyId, run, spec, skipInvalid, onSkipInvalidChange }: ReviewProps) {
  const [downloading, setDownloading] = useState(false);
  const t = run.totals;
  const runIssues = t.run_issues ?? [];
  const runErrors = runIssues.filter(i => i.severity === 'error');
  const runWarnings = runIssues.filter(i => i.severity === 'warning');
  const errors = t.errors ?? 0;
  const warnings = t.warnings ?? 0;
  const ready = (t.valid ?? 0);

  const downloadReport = async () => {
    setDownloading(true);
    try {
      await downloadErrorReport(await invokeImport(companyId, 'ERROR_REPORT', { run_id: run.id }));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="import-review-summary">
        <span className="text-lg font-medium">{(t.rows ?? 0).toLocaleString()} rows checked</span>
        <span className="text-primary">{ready.toLocaleString()} ready</span>
        {warnings > 0 && <span className="text-amber-700 dark:text-amber-400">{warnings.toLocaleString()} with warnings</span>}
        {errors > 0 && <span className="text-destructive">{errors.toLocaleString()} can't be imported</span>}
        {(errors > 0 || warnings > 0) && (
          <Button variant="outline" size="sm" onClick={() => void downloadReport()} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download problem rows
          </Button>
        )}
      </div>

      {runErrors.length > 0 && (
        <Alert variant="destructive">
          <CircleX className="h-4 w-4" />
          <AlertTitle>This file can't be imported yet</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">{runErrors.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}
      {runWarnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Please note</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">{runWarnings.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
          </AlertDescription>
        </Alert>
      )}

      {errors > 0 && ready > 0 && runErrors.length === 0 && (
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox id="import-skip-invalid" checked={skipInvalid} onCheckedChange={v => onSkipInvalidChange(v === true)} />
          <Label htmlFor="import-skip-invalid" className="font-normal leading-snug">
            Import the {ready.toLocaleString()} good rows and leave out the {errors.toLocaleString()} with errors.
            {spec.groupBy && ' A document with any bad line is left out whole.'}
            <span className="block text-muted-foreground">Or fix them in your file and upload it again.</span>
          </Label>
        </div>
      )}

      <RowsTable companyId={companyId} run={run} spec={spec} />
    </div>
  );
}
