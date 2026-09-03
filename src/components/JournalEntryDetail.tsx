import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Paperclip } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type JournalEntryDetailProps = {
  entryId: string | null;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

type EntryDetail = {
  id: string;
  entry_date: string;
  description: string | null;
  attachment_url: string | null;
  journal_number: string | null;
  vendors: RelatedName;
  customers: RelatedName;
  invoices: { id: string; invoice_number: string }[] | { id: string; invoice_number: string } | null;
  posting_requests: { module: string; source: string | null; status: string; created_by: string | null; created_at: string; committed_at: string | null }[] | null;
  journal_entry_items: {
    type: 'debit' | 'credit';
    amount: number;
    dimensions: unknown;
    project_id: string | null;
    chart_of_accounts: RelatedName;
  }[];
};

type RelatedName = { name: string } | { name: string }[] | null | undefined;

function relatedName(relation: RelatedName) {
  if (!relation) return undefined;
  return Array.isArray(relation) ? relation[0]?.name : relation.name;
}

const JournalEntryDetail = ({ entryId, isOpen, setIsOpen }: JournalEntryDetailProps) => {
  const { activeCompany } = useAuth();

  const fetchEntryDetail = async (id: string) => {
    if (!activeCompany) return null;
    const { data, error } = await supabase.functions.invoke('journal-entries', {
      body: {
        method: 'GET',
        company_id: activeCompany.id,
        select: `
          id,
          entry_date,
          description,
          attachment_url,
          journal_number,
          vendors!vendor_id ( name ),
          customers!customer_id ( name ),
          invoices!invoice_id ( id, invoice_number ),
          posting_requests!journal_entry_id ( module, source, status, created_by, created_at, committed_at ),
          journal_entry_items (
            type,
            amount,
            dimensions,
            project_id,
            chart_of_accounts!account_id (
              name
            )
          )
        `,
        filters: { id },
      },
    });

    if (error) throw new Error(error.message);
    if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
      throw new Error((data as { error: string }).error);
    }
    return data as EntryDetail;
  };

  const { data: entry, isLoading } = useQuery({
    queryKey: ['journal_entry_detail', entryId],
    queryFn: () => fetchEntryDetail(entryId!),
    enabled: !!entryId && !!activeCompany,
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-3xl flex flex-col max-h-[90vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Journal Lines {entry?.journal_number ? `· ${entry.journal_number}` : ''}</DialogTitle>
          {entry && <DialogDescription>Details for entry on {new Date(entry.entry_date).toLocaleDateString()}</DialogDescription>}
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 mt-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : entry ? (
          <div className="mt-4 space-y-4 overflow-y-auto flex-1 pr-1">
            {entry.posting_requests?.[0] && (
              <div className="rounded-md border p-3 text-sm grid grid-cols-2 gap-2 text-muted-foreground">
                <span>Module: <span className="text-foreground">{entry.posting_requests[0].module}</span></span>
                <span>Source: <span className="text-foreground">{entry.posting_requests[0].source || '—'}</span></span>
                <span>Status: <span className="text-foreground capitalize">{entry.posting_requests[0].status}</span></span>
                <span>Posted by: <span className="text-foreground font-mono text-xs">{entry.posting_requests[0].created_by?.slice(0, 8) || '—'}</span></span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold text-gray-800 dark:text-gray-200">Description:</span>
                <p className="text-gray-600 dark:text-gray-400">{entry.description || 'N/A'}</p>
              </div>
              <div>
                <span className="font-semibold text-gray-800 dark:text-gray-200">Vendor:</span>
                <p className="text-gray-600 dark:text-gray-400">{relatedName(entry.vendors) || 'N/A'}</p>
              </div>
              <div>
                <span className="font-semibold text-gray-800 dark:text-gray-200">Customer:</span>
                <p className="text-gray-600 dark:text-gray-400">{relatedName(entry.customers) || 'N/A'}</p>
              </div>
              {entry.invoices && (
                <div>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">Related Invoice:</span>
                  <p>
                    <Link
                      to={`/invoices/${(Array.isArray(entry.invoices) ? entry.invoices[0] : entry.invoices).id}`}
                      className="text-blue-500 hover:underline"
                      onClick={() => setIsOpen(false)}
                    >
                      #{(Array.isArray(entry.invoices) ? entry.invoices[0] : entry.invoices).invoice_number}
                    </Link>
                  </p>
                </div>
              )}
            </div>
            
            {entry.attachment_url && (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Attachment</h4>
                <Button asChild variant="outline" size="sm">
                  <a href={entry.attachment_url} target="_blank" rel="noopener noreferrer">
                    <Paperclip className="mr-2 h-4 w-4" />
                    View Attachment
                  </a>
                </Button>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Dimension</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.journal_entry_items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{relatedName(item.chart_of_accounts)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{entry.description || '—'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {item.type === 'debit' ? formatCurrency(item.amount) : ''}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.type === 'credit' ? formatCurrency(item.amount) : ''}
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">{item.dimensions ? JSON.stringify(item.dimensions) : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{item.project_id?.slice(0, 8) || '—'}</TableCell>
                    <TableCell className="text-xs">{entry.posting_requests?.[0]?.module || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">Journal entry not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryDetail;