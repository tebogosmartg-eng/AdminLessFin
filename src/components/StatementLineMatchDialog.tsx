import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { journalEntryItemCandidatesQuery } from '../lib/queries';
import { BankStatementLine } from '../lib/banking/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { formatCurrency } from '../lib/utils';
import { showSuccess, showPlatformError } from '../utils/toast';
import { EmptyState } from './EmptyState';
import { Search } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

type StatementLineMatchDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  line: BankStatementLine | null;
  chartOfAccountId: string;
};

const StatementLineMatchDialog = ({ isOpen, setIsOpen, line, chartOfAccountId }: StatementLineMatchDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  // ±30 days around the statement line date keeps the candidate list small and relevant.
  const dateFrom = line ? new Date(new Date(line.line_date).getTime() - 30 * 86400000).toISOString().split('T')[0] : undefined;
  const dateTo = line ? new Date(new Date(line.line_date).getTime() + 30 * 86400000).toISOString().split('T')[0] : undefined;

  const { data: candidates, isLoading } = useQuery({
    ...journalEntryItemCandidatesQuery(activeCompany!.id, chartOfAccountId, dateFrom, dateTo),
    enabled: isOpen && !!activeCompany && !!chartOfAccountId,
  });

  const sorted = (candidates ?? []).slice().sort((a, b) => {
    const aMatch = Math.abs(a.amount - Math.abs(line?.amount ?? 0)) < 0.01;
    const bMatch = Math.abs(b.amount - Math.abs(line?.amount ?? 0)) < 0.01;
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return a.entry_date < b.entry_date ? 1 : -1;
  });

  const mutation = useMutation({
    mutationFn: async (journalEntryItemId: string) => {
      if (!activeCompany || !line) throw new Error('Missing context');
      const { error } = await supabase.functions.invoke('banking', {
        body: { method: 'MATCH_STATEMENT_LINE', company_id: activeCompany.id, statementLineId: line.id, journalEntryItemId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_statement_lines', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank_outstanding_lines', activeCompany?.id] });
      showSuccess('Statement line matched.');
      setIsOpen(false);
    },
    onError: (error: unknown) => showPlatformError(error),
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Match Statement Line</DialogTitle>
          <DialogDescription>
            {line && <>{line.line_date} — {line.description || 'No description'} — <span className="font-mono">{formatCurrency(line.amount)}</span></>}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : sorted.length === 0 ? (
          <EmptyState icon={Search} title="No candidate GL entries" description="No unreconciled journal lines were found on this account within ±30 days of the statement line date." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => {
                const closeMatch = Math.abs(c.amount - Math.abs(line?.amount ?? 0)) < 0.01;
                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.entry_date}</TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {c.journal_description || '—'}
                      {closeMatch && <Badge variant="success" className="ml-2">Amount match</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(c.amount)}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => mutation.mutate(c.id)} disabled={mutation.isPending}>Match</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StatementLineMatchDialog;
