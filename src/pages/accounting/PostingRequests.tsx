import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Eye, ExternalLink, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { postingRequestsQuery } from '../../lib/accountingQueries';
import { type AccountingFilters } from '../../lib/accountingWorkspace';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import AccountingFiltersBar from '../../components/accounting/AccountingFiltersBar';
import AccountingSearch from '../../components/accounting/AccountingSearch';
import TraceabilityDrawer from '../../components/accounting/TraceabilityDrawer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { showError } from '../../utils/toast';

const PAGE_SIZE = 50;

const PostingRequests = () => {
  useDocumentTitle('Posting Requests');
  const { activeCompany } = useAuth();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AccountingFilters>({
    status: 'all',
    module: 'all',
    financial_year_id: 'all',
    accounting_period_id: 'all',
  });
  const [trace, setTrace] = useState<{ posting_request_id?: string; journal_entry_id?: string } | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    ...postingRequestsQuery(activeCompany!.id, page, PAGE_SIZE, filters),
    enabled: !!activeCompany,
    placeholderData: (prev) => prev,
  });

  const rows = (data as any)?.rows || [];
  const total = (data as any)?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ClipboardList className="h-7 w-7" /> Posting Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise posting monitor — consumes Posting Engine outputs only.
          </p>
        </div>
        <div className="flex gap-2">
          <AccountingSearch onSelectTrace={(r) => setTrace(r)} />
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>{total.toLocaleString()} posting requests</CardDescription>
          <AccountingFiltersBar
            value={filters}
            onChange={(next) => { setFilters(next); setPage(1); }}
            showAccount={false}
            showSearch
          />
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-80 w-full" /> : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posting Request</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Posting Date</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Validation</TableHead>
                      <TableHead>Warnings</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Journal #</TableHead>
                      <TableHead>FY</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r: any) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setTrace({ posting_request_id: r.id, journal_entry_id: r.journal_entry_id })}>
                        <TableCell className="font-mono text-xs">{r.id.slice(0, 8)}…</TableCell>
                        <TableCell><Badge className="capitalize" variant={r.status === 'committed' ? 'outline' : r.status === 'pending' ? 'secondary' : 'destructive'}>{r.status}</Badge></TableCell>
                        <TableCell>{r.module}</TableCell>
                        <TableCell>
                          <div className="text-sm">{r.document_type || '—'}</div>
                          <div className="text-xs text-muted-foreground font-mono">{r.document_id?.slice(0, 8) || ''}</div>
                        </TableCell>
                        <TableCell className="text-xs">{r.posting_date ? new Date(r.posting_date).toLocaleString() : '—'}</TableCell>
                        <TableCell className="text-xs">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{r.created_by?.slice(0, 8) || '—'}</TableCell>
                        <TableCell className="capitalize">{r.validation_status}</TableCell>
                        <TableCell>{r.warning_count}</TableCell>
                        <TableCell>{r.error_count}</TableCell>
                        <TableCell className="font-semibold">{r.journal_number || '—'}</TableCell>
                        <TableCell>{r.financial_year || '—'}</TableCell>
                        <TableCell>{r.accounting_period ?? '—'}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setTrace({ posting_request_id: r.id, journal_entry_id: r.journal_entry_id })} title="Preview">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {r.journal_entry_id && (
                              <Button size="sm" variant="ghost" asChild title="View Journal">
                                <Link to="/journal-entries"><ClipboardList className="h-4 w-4" /></Link>
                              </Button>
                            )}
                            {r.document_route && (
                              <Button size="sm" variant="ghost" asChild title="View Source">
                                <Link to={r.document_route}><ExternalLink className="h-4 w-4" /></Link>
                              </Button>
                            )}
                            {r.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                title="Retry is owned by the source module — open source document"
                                onClick={() => {
                                  if (r.document_route) window.location.assign(r.document_route);
                                  else showError('Retry from the originating module document. Posting Engine is not invoked from this monitor.');
                                }}
                              >
                                Retry
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between mt-3">
                <div className="text-xs text-muted-foreground">Page {page} of {totalPages}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <TraceabilityDrawer
        open={!!trace}
        onOpenChange={(o) => !o && setTrace(null)}
        postingRequestId={trace?.posting_request_id}
        journalEntryId={trace?.journal_entry_id}
      />
    </div>
  );
};

export default PostingRequests;
