import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { journalWithPostingRequestQuery } from '../lib/queries';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { Badge } from './ui/badge';
import { formatCurrency } from '../lib/utils';

type BankingJournalDrilldownProps = {
  journalEntryId: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const statusVariant = (status: string) => (status === 'committed' ? 'success' : status === 'reversed' ? 'destructive' : 'secondary') as 'success' | 'destructive' | 'secondary';

const BankingJournalDrilldown = ({ journalEntryId, isOpen, setIsOpen }: BankingJournalDrilldownProps) => {
  const { activeCompany } = useAuth();
  const { data: entry, isLoading } = useQuery({
    ...journalWithPostingRequestQuery(activeCompany!.id, journalEntryId),
    enabled: isOpen && !!journalEntryId && !!activeCompany,
  });
  const postingRequest = entry?.posting_requests?.[0] ?? null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Journal {entry?.journal_number ? `#${entry.journal_number}` : ''}</DialogTitle>
          {entry && <DialogDescription>{entry.entry_date} — {entry.description || 'No description'}</DialogDescription>}
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-24 w-full" /></div>
        ) : entry ? (
          <div className="space-y-4">
            {postingRequest && (
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Posting Request</span>
                  <Badge variant={statusVariant(postingRequest.status)} className="capitalize">{postingRequest.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  <span>Module: <span className="text-foreground">{postingRequest.module}</span></span>
                  <span>Document: <span className="text-foreground">{postingRequest.document_type || '—'}</span></span>
                  <span>Source: <span className="text-foreground">{postingRequest.source || 'banking'}</span></span>
                  <span>Committed: <span className="text-foreground">{postingRequest.committed_at ? new Date(postingRequest.committed_at).toLocaleString() : '—'}</span></span>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.journal_entry_items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{item.chart_of_accounts?.name ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono">{item.type === 'debit' ? formatCurrency(item.amount) : ''}</TableCell>
                    <TableCell className="text-right font-mono">{item.type === 'credit' ? formatCurrency(item.amount) : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">Journal not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BankingJournalDrilldown;
