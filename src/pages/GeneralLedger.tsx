import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { Account } from './ChartOfAccounts';

type LedgerEntry = {
  entry_date: string;
  description: string | null;
  type: 'debit' | 'credit';
  amount: number;
};

const GeneralLedger = () => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const { data: accounts, isLoading: isLoadingAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').order('name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: ledgerEntries, isLoading: isLoadingEntries } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data, error } = await supabase
        .from('journal_entry_items')
        .select(`
          amount,
          type,
          journal_entries (
            entry_date,
            description
          )
        `)
        .eq('account_id', selectedAccountId)
        .order('entry_date', { foreignTable: 'journal_entries', ascending: true });

      if (error) throw new Error(error.message);
      
      return data.map(item => ({
        amount: item.amount,
        type: item.type,
        entry_date: (item.journal_entries as any).entry_date,
        description: (item.journal_entries as any).description,
      }));
    },
    enabled: !!selectedAccountId,
  });

  const selectedAccount = accounts?.find(acc => acc.id === selectedAccountId);

  const calculateRunningBalance = () => {
    if (!ledgerEntries || !selectedAccount) return [];
    
    let runningBalance = 0;
    const isDebitNormal = ['Asset', 'Expense'].includes(selectedAccount.type);

    return ledgerEntries.map(entry => {
      if (isDebitNormal) {
        runningBalance += entry.type === 'debit' ? entry.amount : -entry.amount;
      } else {
        runningBalance += entry.type === 'credit' ? entry.amount : -entry.amount;
      }
      return { ...entry, runningBalance };
    });
  };

  const entriesWithBalance = calculateRunningBalance();

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">General Ledger</h1>
      <Card>
        <CardHeader>
          <CardTitle>Select an Account</CardTitle>
          <CardDescription>Choose an account to view its detailed transaction history.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select onValueChange={setSelectedAccountId} value={selectedAccountId || ''}>
            <SelectTrigger className="w-full md:w-1/3">
              <SelectValue placeholder="Select an account..." />
            </SelectTrigger>
            <SelectContent>
              {isLoadingAccounts ? (
                <SelectItem value="loading" disabled>Loading accounts...</SelectItem>
              ) : (
                accounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedAccountId && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedAccount?.name || 'Ledger'}</CardTitle>
            <CardDescription>Transaction details and running balance.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingEntries ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : entriesWithBalance.length > 0 ? (
                  entriesWithBalance.map((entry, index) => (
                    <TableRow key={index}>
                      <TableCell>{new Date(entry.entry_date).toLocaleDateString()}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell className="text-right font-mono">{entry.type === 'debit' ? formatCurrency(entry.amount) : ''}</TableCell>
                      <TableCell className="text-right font-mono">{entry.type === 'credit' ? formatCurrency(entry.amount) : ''}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(entry.runningBalance)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">No transactions found for this account.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GeneralLedger;