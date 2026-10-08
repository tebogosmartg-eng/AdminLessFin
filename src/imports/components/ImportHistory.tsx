import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import type { ImportRun } from '../api';
import { ENTITY_LABELS, RUN_STATUS_LABELS } from '../labels';

interface Props {
  runs: ImportRun[] | undefined;
  loading: boolean;
  error: Error | null;
  onOpen: (run: ImportRun) => void;
}

function resultText(run: ImportRun): string {
  const t = run.totals ?? {};
  if (run.status === 'committed') {
    const parts = [
      t.imported ? `${t.imported} imported` : null,
      t.updated ? `${t.updated} updated` : null,
      t.skipped ? `${t.skipped} skipped` : null,
      t.failed ? `${t.failed} failed` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Nothing to import';
  }
  if (run.status === 'validated') {
    return `${t.rows ?? run.row_count} rows checked${t.errors ? `, ${t.errors} with errors` : ''}`;
  }
  return `${run.row_count} rows`;
}

function statusVariant(status: ImportRun['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'committed') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'cancelled') return 'outline';
  return 'secondary';
}

export function ImportHistory({ runs, loading, error, onOpen }: Props) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="text-sm text-destructive">Import history could not be loaded: {error.message}</p>;
  if (!runs || runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No imports yet. Everything you import will be listed here.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="import-history">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>File</TableHead>
            <TableHead>By</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="sr-only">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map(run => (
            <TableRow key={run.id}>
              <TableCell className="whitespace-nowrap">
                {new Date(run.created_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
              </TableCell>
              <TableCell className="whitespace-nowrap">{ENTITY_LABELS[run.entity_type] ?? run.entity_type}</TableCell>
              <TableCell className="max-w-[16rem] truncate" title={run.file_name ?? ''}>{run.file_name ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap">{run.created_by_name ?? '—'}</TableCell>
              <TableCell>{resultText(run)}</TableCell>
              <TableCell><Badge variant={statusVariant(run.status)}>{RUN_STATUS_LABELS[run.status]}</Badge></TableCell>
              <TableCell className="text-right">
                {run.status !== 'cancelled' && (
                  <Button variant="ghost" size="sm" onClick={() => onOpen(run)}>
                    {run.status === 'validated' ? 'Continue' : 'View'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
