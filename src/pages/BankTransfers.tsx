import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { bankTransfersQuery } from '../lib/queries';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { ArrowLeftRight, Plus, BookText } from 'lucide-react';
import BankTransferForm from '../components/BankTransferForm';
import BankingJournalDrilldown from '../components/BankingJournalDrilldown';

const BankTransfers = () => {
  useDocumentTitle('Bank Transfers');
  const { activeCompany } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [drilldownJournalId, setDrilldownJournalId] = useState<string | null>(null);

  const { data: transfers, isLoading } = useQuery({ ...bankTransfersQuery(activeCompany!.id), enabled: !!activeCompany });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bank Transfers</CardTitle>
          <Button onClick={() => setIsFormOpen(true)}><Plus className="mr-2 h-4 w-4" />New Transfer</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 w-full animate-pulse rounded-md bg-muted" />)}</div>
          ) : (transfers ?? []).length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No transfers yet" description="Move money between your bank, cash, and petty cash accounts in one balanced posting." action={<Button onClick={() => setIsFormOpen(true)}><Plus className="mr-2 h-4 w-4" />New Transfer</Button>} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[110px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(transfers ?? []).map((t) => (
                  <TableRow key={t.transfer_id}>
                    <TableCell>{format(new Date(t.transfer_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="font-medium">{t.from_bank_account_name}</TableCell>
                    <TableCell className="font-medium">{t.to_bank_account_name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{t.description || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(t.amount)}</TableCell>
                    <TableCell><Badge variant="success">Posted</Badge></TableCell>
                    <TableCell>{t.journal_entry_id && <Button size="sm" variant="ghost" onClick={() => setDrilldownJournalId(t.journal_entry_id)}><BookText className="mr-1.5 h-3.5 w-3.5" />Journal</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <BankTransferForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
      <BankingJournalDrilldown journalEntryId={drilldownJournalId} isOpen={!!drilldownJournalId} setIsOpen={() => setDrilldownJournalId(null)} />
    </>
  );
};

export default BankTransfers;
