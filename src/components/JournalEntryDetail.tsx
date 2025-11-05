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
  journal_entry_items: {
    type: 'debit' | 'credit';
    amount: number;
    chart_of_accounts: {
      name: string;
    }[] | null;
  }[];
};

const JournalEntryDetail = ({ entryId, isOpen, setIsOpen }: JournalEntryDetailProps) => {
  const fetchEntryDetail = async (id: string) => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select(`
        id,
        entry_date,
        description,
        attachment_url,
        journal_entry_items (
          type,
          amount,
          chart_of_accounts (
            name
          )
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) throw new Error(error.message);
    return data;
  };

  const { data: entry, isLoading } = useQuery<EntryDetail>({
    queryKey: ['journal_entry_detail', entryId],
    queryFn: () => fetchEntryDetail(entryId!),
    enabled: !!entryId,
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Journal Entry Details</DialogTitle>
          {entry && <DialogDescription>Details for entry on {new Date(entry.entry_date).toLocaleDateString()}</DialogDescription>}
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 mt-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : entry && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-800 dark:text-gray-200">Description:</span> {entry.description || 'N/A'}
            </p>
            
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
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.journal_entry_items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.chart_of_accounts?.[0]?.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {item.type === 'debit' ? `$${item.amount.toFixed(2)}` : ''}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.type === 'credit' ? `$${item.amount.toFixed(2)}` : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryDetail;