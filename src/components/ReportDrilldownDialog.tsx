import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

interface ReportDrilldownDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  accountId: string | null;
  accountName: string;
  dateFrom?: Date;
  dateTo?: Date;
}

type LedgerEntry = {
  amount: number;
  type: 'debit' | 'credit';
  journal_entries: {
    id: string;
    entry_date: string;
    description: string | null;
  };
};

const ReportDrilldownDialog = ({ isOpen, setIsOpen, accountId, accountName, dateFrom, dateTo }: ReportDrilldownDialogProps) => {
  const { activeCompany } = useAuth();

  const { data: entries, isLoading } = useQuery({
    queryKey: ['drilldown_ledger', accountId, dateFrom, dateTo, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany || !accountId) return [];
      const { data, error } = await supabase.functions.invoke('accounting', {
        body: {
          method: 'GET_LEDGER_ENTRIES',
          company_id: activeCompany.id,
          account_id: accountId,
          start_date: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined,
          end_date: dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined,
        },
      });

      if (error) throw new Error(error.message);
      return data as LedgerEntry[];
    },
    enabled: isOpen && !!accountId && !!activeCompany,
  });

  const totalDebits = entries?.reduce((sum, e) => sum + (e.type === 'debit' ? e.amount : 0), 0) || 0;
  const totalCredits = entries?.reduce((sum, e) => sum + (e.type === 'credit' ? e.amount : 0), 0) || 0;
  const netChange = totalDebits - totalCredits;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{accountName}</DialogTitle>
          <DialogDescription>
            Transaction details {dateFrom && dateTo ? `from ${format(dateFrom, 'PP')} to ${format(dateTo, 'PP')}` : 'All time'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto min-h-0 border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : entries && entries.length > 0 ? (
                entries.map((entry, idx) => (
                  <TableRow key={`${entry.journal_entries.id}-${idx}`}>
                    <TableCell>{format(new Date(entry.journal_entries.entry_date), 'PP')}</TableCell>
                    <TableCell>{entry.journal_entries.description}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {entry.type === 'debit' ? formatCurrency(entry.amount) : ''}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {entry.type === 'credit' ? formatCurrency(entry.amount) : ''}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No transactions found in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex justify-end gap-6 text-sm font-medium pt-2 border-t mt-2">
            <div>Total Debits: <span className="font-mono">{formatCurrency(totalDebits)}</span></div>
            <div>Total Credits: <span className="font-mono">{formatCurrency(totalCredits)}</span></div>
            <div className={netChange >= 0 ? 'text-green-600' : 'text-red-600'}>Net Change: <span className="font-mono">{formatCurrency(netChange)}</span></div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDrilldownDialog;