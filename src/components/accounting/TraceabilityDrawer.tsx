import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { accountingApi } from '../../lib/accountingWorkspace';
import { formatCurrency } from '../../lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Separator } from '../ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { ExternalLink, FileText, GitBranch, BookOpen, ClipboardList } from 'lucide-react';

type PostingTimeline = {
  created?: string | null;
  validated?: string | null;
  posted?: string | null;
  duration_label?: string | null;
  journal_created?: string | null;
  ledger_updated?: string | null;
  posted_by?: string | null;
  warnings?: unknown[] | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journalEntryId?: string | null;
  postingRequestId?: string | null;
  accountId?: string | null;
  documentId?: string | null;
};

export default function TraceabilityDrawer({
  open,
  onOpenChange,
  journalEntryId,
  postingRequestId,
  accountId,
  documentId,
}: Props) {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['traceability', activeCompany?.id, journalEntryId, postingRequestId, accountId, documentId],
    queryFn: () => accountingApi.traceability(activeCompany!.id, {
      journal_entry_id: journalEntryId || undefined,
      posting_request_id: postingRequestId || undefined,
      account_id: accountId || undefined,
      document_id: documentId || undefined,
    }),
    enabled: open && !!activeCompany && !!(journalEntryId || postingRequestId || documentId),
  });

  const { data: timeline } = useQuery({
    queryKey: ['posting-timeline', activeCompany?.id, (data as any)?.posting_request?.id],
    queryFn: () =>
      accountingApi.postingTimeline(
        activeCompany!.id,
        (data as any).posting_request.id,
      ) as Promise<PostingTimeline>,
    enabled: open && !!activeCompany && !!(data as any)?.posting_request?.id,
  });

  const chain = data as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" /> Accounting Traceability
          </DialogTitle>
          <DialogDescription>
            Business Document → Posting Request → Journal → Lines → Ledger → Trial Balance
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : !chain ? (
          <p className="text-sm text-muted-foreground py-6">No posting chain found for this selection.</p>
        ) : (
          <div className="space-y-5">
            <section className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" /> Business Document</div>
              {chain.business_document ? (
                <div className="text-sm grid grid-cols-2 gap-2 text-muted-foreground">
                  <span>Type: <span className="text-foreground">{chain.business_document.document_type || '—'}</span></span>
                  <span>ID: <span className="text-foreground font-mono text-xs">{chain.business_document.document_id || '—'}</span></span>
                  <span>Reference: <span className="text-foreground">{chain.business_document.reference || '—'}</span></span>
                  <span>Module: <span className="text-foreground">{chain.original_module || '—'}</span></span>
                  {chain.business_document.route && (
                    <Button asChild variant="link" className="h-auto p-0 justify-start col-span-2">
                      <Link to={chain.business_document.route}><ExternalLink className="h-3 w-3 mr-1" /> Open source document</Link>
                    </Button>
                  )}
                </div>
              ) : <p className="text-sm text-muted-foreground">Manual / no linked business document.</p>}
            </section>

            <section className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium"><ClipboardList className="h-4 w-4" /> Posting Request</div>
                {chain.posting_request && <Badge className="capitalize">{chain.posting_request.status}</Badge>}
              </div>
              {chain.posting_request ? (
                <div className="text-sm grid grid-cols-2 gap-2 text-muted-foreground">
                  <span>ID: <span className="text-foreground font-mono text-xs">{chain.posting_request.id}</span></span>
                  <span>Source: <span className="text-foreground">{chain.posting_request.source || '—'}</span></span>
                  <span>Created: <span className="text-foreground">{chain.posting_request.created_at ? new Date(chain.posting_request.created_at).toLocaleString() : '—'}</span></span>
                  <span>Committed: <span className="text-foreground">{chain.posting_request.committed_at ? new Date(chain.posting_request.committed_at).toLocaleString() : '—'}</span></span>
                  <span>Created by: <span className="text-foreground font-mono text-xs">{chain.posting_request.created_by || '—'}</span></span>
                  <span>Engine: <span className="text-foreground">{chain.posting_request.posting_engine_version}</span></span>
                </div>
              ) : <p className="text-sm text-muted-foreground">No posting request linked (legacy journal).</p>}
            </section>

            {timeline && (
              <section className="rounded-lg border p-3 space-y-2">
                <div className="font-medium">Posting Timeline</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div><div className="text-muted-foreground text-xs">Created</div>{timeline.created ? new Date(timeline.created).toLocaleString() : '—'}</div>
                  <div><div className="text-muted-foreground text-xs">Validated</div>{timeline.validated ? new Date(timeline.validated).toLocaleString() : '—'}</div>
                  <div><div className="text-muted-foreground text-xs">Posted</div>{timeline.posted ? new Date(timeline.posted).toLocaleString() : '—'}</div>
                  <div><div className="text-muted-foreground text-xs">Duration</div>{timeline.duration_label || '—'}</div>
                  <div><div className="text-muted-foreground text-xs">Journal Created</div>{timeline.journal_created ? new Date(timeline.journal_created).toLocaleString() : '—'}</div>
                  <div><div className="text-muted-foreground text-xs">Ledger Updated</div>{timeline.ledger_updated ? new Date(timeline.ledger_updated).toLocaleString() : '—'}</div>
                  <div><div className="text-muted-foreground text-xs">Posted By</div><span className="font-mono text-xs">{timeline.posted_by || '—'}</span></div>
                  <div><div className="text-muted-foreground text-xs">Warnings</div>{(timeline.warnings || []).length}</div>
                </div>
              </section>
            )}

            <section className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 font-medium"><BookOpen className="h-4 w-4" /> Journal Entry</div>
              {chain.journal_entry ? (
                <div className="text-sm grid grid-cols-2 gap-2 text-muted-foreground">
                  <span>Number: <span className="text-foreground font-semibold">{chain.journal_entry.journal_number || '—'}</span></span>
                  <span>Date: <span className="text-foreground">{chain.journal_entry.entry_date}</span></span>
                  <span>FY: <span className="text-foreground">{chain.journal_entry.financial_year || '—'}</span></span>
                  <span>Period: <span className="text-foreground">{chain.journal_entry.accounting_period ?? '—'}</span></span>
                  <span className="col-span-2">Description: <span className="text-foreground">{chain.journal_entry.description || '—'}</span></span>
                  {chain.journal_entry.attachment_url && (
                    <a className="text-primary underline col-span-2" href={chain.journal_entry.attachment_url} target="_blank" rel="noreferrer">Attachment</a>
                  )}
                </div>
              ) : <p className="text-sm text-muted-foreground">Journal not yet created.</p>}
            </section>

            <section>
              <div className="font-medium mb-2">Journal Lines</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(chain.journal_lines || []).map((line: any) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">
                        {line.chart_of_accounts?.account_number} — {line.chart_of_accounts?.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {line.dimensions ? JSON.stringify(line.dimensions) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">{line.type === 'debit' ? formatCurrency(line.amount) : ''}</TableCell>
                      <TableCell className="text-right font-mono">{line.type === 'credit' ? formatCurrency(line.amount) : ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex gap-2 mt-3">
                {chain.journal_entry?.id && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/general-ledger`}>Open General Ledger</Link>
                  </Button>
                )}
                {accountId && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/trial-balance`}>Open Trial Balance</Link>
                  </Button>
                )}
              </div>
            </section>

            <Separator />

            <section>
              <div className="font-medium mb-2">Audit Trail</div>
              {(chain.audit_trail || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit rows for this chain.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  {(chain.audit_trail || []).map((a: any) => (
                    <div key={a.id} className="flex justify-between gap-2 border-b py-1">
                      <span>{a.table_name} · {a.operation}</span>
                      <span className="text-muted-foreground">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
