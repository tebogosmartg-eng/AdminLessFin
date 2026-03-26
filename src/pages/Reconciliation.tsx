import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Account } from './ChartOfAccounts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Checkbox } from '../components/ui/checkbox';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { showError, showSuccess } from '../utils/toast';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

type Transaction = {
  id: string;
  entry_date: string;
  description: string | null;
  type: 'debit' | 'credit';
  amount: number;
};

const Reconciliation = () => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [statementEndDate, setStatementEndDate] = useState('');
  const [statementEndBalance, setStatementEndBalance] = useState('');
  const [clearedItemIds, setClearedItemIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const isSetupComplete = !!selectedAccountId && !!statementEndDate && !!statementEndBalance;

  const { data: bankAccounts } = useQuery<Account[]>({
    queryKey: ['bank_accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('accounting', {
        body: {
          method: 'GET_BANK_ACCOUNTS',
          company_id: activeCompany.id,
        },
      });
      if (error) throw new Error(error.message);
      return data.filter((acc: Account) => 
        acc.name.toLowerCase().includes('bank') || 
        acc.name.toLowerCase().includes('checking') || 
        acc.name.toLowerCase().includes('cash')
      );
    },
    enabled: !!activeCompany,
  });

  const { data: transactions, isLoading: isLoadingTransactions } = useQuery<Transaction[]>({
    queryKey: ['reconciliation_transactions', selectedAccountId, statementEndDate, activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('accounting', {
        body: {
          method: 'GET_RECONCILIATION_TRANSACTIONS',
          company_id: activeCompany!.id,
          account_id: selectedAccountId!,
          statement_end_date: statementEndDate,
        },
      });

      if (error) throw new Error(error.message);
      
      return data.map((item: any) => ({
        id: item.id,
        amount: item.amount,
        type: item.type,
        entry_date: item.journal_entries.entry_date,
        description: item.journal_entries.description,
      }));
    },
    enabled: isSetupComplete && !!activeCompany,
  });

  const { data: bookBalanceData, isLoading: isLoadingBookBalance } = useQuery({
    queryKey: ['book_balance_as_of', selectedAccountId, statementEndDate, activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('accounting', {
        body: {
          method: 'GET_BOOK_BALANCE',
          company_id: activeCompany!.id,
          account_id: selectedAccountId!,
          statement_end_date: statementEndDate,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: isSetupComplete && !!activeCompany,
  });

  const finishReconciliationMutation = useMutation({
    mutationFn: async (clearedIds: string[]) => {
      const { error } = await supabase.functions.invoke('accounting', {
        body: {
          method: 'FINISH_RECONCILIATION',
          company_id: activeCompany!.id,
          cleared_ids: clearedIds,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Reconciliation complete!');
      queryClient.invalidateQueries({ queryKey: ['reconciliation_transactions', selectedAccountId, statementEndDate] });
      queryClient.invalidateQueries({ queryKey: ['book_balance_as_of', selectedAccountId, statementEndDate] });
      setSelectedAccountId(null);
      setStatementEndDate('');
      setStatementEndBalance('');
      setClearedItemIds(new Set());
    },
    onError: (error: any) => {
      showError(`Error finishing reconciliation: ${error.message}`);
    },
  });

  const handleClearItem = (itemId: string, isCleared: boolean) => {
    setClearedItemIds(prev => {
      const newSet = new Set(prev);
      if (isCleared) newSet.add(itemId);
      else newSet.delete(itemId);
      return newSet;
    });
  };

  const { payments, deposits, difference } = useMemo(() => {
    if (!transactions || !bookBalanceData) return { payments: [], deposits: [], difference: null };

    const isDebitNormal = bankAccounts?.find(acc => acc.id === selectedAccountId)?.type === 'Asset';
    const payments = transactions.filter(t => (isDebitNormal ? t.type === 'credit' : t.type === 'debit'));
    const deposits = transactions.filter(t => (isDebitNormal ? t.type === 'debit' : t.type === 'credit'));

    const bookBalance = bookBalanceData.balance;
    const statementBalance = parseFloat(statementEndBalance) || 0;

    const unclearedPayments = payments.filter(p => !clearedItemIds.has(p.id)).reduce((sum, p) => sum + p.amount, 0);
    const unclearedDeposits = deposits.filter(d => !clearedItemIds.has(d.id)).reduce((sum, d) => sum + d.amount, 0);

    const reconciledBookBalance = bookBalance - unclearedDeposits + unclearedPayments;
    const difference = statementBalance - reconciledBookBalance;

    return { payments, deposits, difference };
  }, [transactions, clearedItemIds, bookBalanceData, statementEndBalance, selectedAccountId, bankAccounts]);

  const clearedPaymentsTotal = useMemo(() => transactions?.filter(t => clearedItemIds.has(t.id) && (bankAccounts?.find(acc => acc.id === selectedAccountId)?.type === 'Asset' ? t.type === 'credit' : t.type === 'debit')).reduce((sum, t) => sum + t.amount, 0) || 0, [transactions, clearedItemIds, selectedAccountId, bankAccounts]);
  const clearedDepositsTotal = useMemo(() => transactions?.filter(t => clearedItemIds.has(t.id) && (bankAccounts?.find(acc => acc.id === selectedAccountId)?.type === 'Asset' ? t.type === 'debit' : t.type === 'credit')).reduce((sum, t) => sum + t.amount, 0) || 0, [transactions, clearedItemIds, selectedAccountId, bankAccounts]);

  const renderTransactionsTable = (title: string, items: Transaction[]) => (
    <div>
      <h3 className="text-lg font-semibold mb-2">{title} - {items.length} transactions</h3>
      <div className="border rounded-md max-h-96 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-gray-50 dark:bg-gray-800">
            <TableRow>
              <TableHead className="w-10"><Checkbox onCheckedChange={(checked) => {
                const allIds = items.map(i => i.id);
                if (checked) setClearedItemIds(prev => new Set([...prev, ...allIds]));
                else setClearedItemIds(prev => new Set([...prev].filter(id => !allIds.includes(id))));
              }} /></TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell><Checkbox checked={clearedItemIds.has(item.id)} onCheckedChange={(checked) => handleClearItem(item.id, !!checked)} /></TableCell>
                <TableCell>{format(new Date(item.entry_date), 'PP')}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Bank Reconciliation</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>Select an account and enter your bank statement details to begin.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4 items-end">
          <Select onValueChange={v => { setSelectedAccountId(v); setClearedItemIds(new Set()); }} value={selectedAccountId || ''}>
            <SelectTrigger><SelectValue placeholder="Select a bank or cash account..." /></SelectTrigger>
            <SelectContent>{bankAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={statementEndDate} onChange={e => setStatementEndDate(e.target.value)} />
          <Input type="number" placeholder="Statement End Balance" value={statementEndBalance} onChange={e => setStatementEndBalance(e.target.value)} />
        </CardContent>
      </Card>

      {isSetupComplete && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Reconciliation Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Statement Ending Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(parseFloat(statementEndBalance) || 0)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cleared Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(clearedDepositsTotal - clearedPaymentsTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Difference</p>
                <p className={cn("text-2xl font-bold", difference !== null && Math.abs(difference) > 0.001 ? 'text-red-600' : 'text-green-600')}>
                  {isLoadingTransactions || isLoadingBookBalance ? <Skeleton className="h-8 w-32 mx-auto" /> : formatCurrency(difference ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>

          {isLoadingTransactions ? <Skeleton className="h-64 w-full" /> : (
            <div className="grid md:grid-cols-2 gap-6">
              {renderTransactionsTable('Deposits and Credits', deposits)}
              {renderTransactionsTable('Payments and Debits', payments)}
            </div>
          )}

          {difference !== null && Math.abs(difference) < 0.001 && (
            <div className="text-center pt-4">
              <Button size="lg" onClick={() => finishReconciliationMutation.mutate(Array.from(clearedItemIds))} disabled={finishReconciliationMutation.isPending}>
                {finishReconciliationMutation.isPending ? 'Finishing...' : 'Finish Reconciliation'}
              </Button>
              <p className="text-sm text-muted-foreground mt-2">Once finished, these transactions will be marked as cleared.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Reconciliation;