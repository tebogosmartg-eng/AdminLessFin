import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { Account } from './ChartOfAccounts';
import { formatCurrency, downloadCSV } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Download } from 'lucide-react';

type LedgerEntry = {
  entry_date: string;
  description: string | null;
  type: 'debit' | 'credit';
  amount: number;
  journal_entry_id: string;
};

const GeneralLedger = () => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const { activeCompany } = useAuth();

  const { data: accounts, isLoading: isLoadingAccounts } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
        body: {
          method: 'GET',
          company_id: activeCompany.id,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  const { data: ledgerEntries, isLoading: isLoadingEntries } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', selectedAccountId, activeCompany?.id],
    queryFn: async () => {
      if (!selectedAccountId || !activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('accounting', {
        body: {
          method: 'GET_LEDGER_ENTRIES',
          company_id: activeCompany.id,
          account_id: selectedAccountId,
        },
      });

      if (error) throw new Error(error.message);
      
      return data.map((item: any) => ({
        amount: item.amount,
        type: item.type,
        entry_date: item.journal_entries.entry_date,
        description: item.journal_entries.description,
        journal_entry_id: item.journal_entries.id,
      }));
    },
    enabled: !!selectedAccountId && !!activeCompany,
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

  const handleExport = () => {
    if (!entriesWithBalance || !selectedAccount) return;
    const data = entriesWithBalance.map(e => ({
      Date: new Date(e.entry_date).toLocaleDateString(),
      Description: e.description,
      Ref: e.journal_entry_id.substring(0, 8),
      Debit: e.type === 'debit' ? e.amount.toFixed(2) : '',
      Credit: e.type === 'credit' ? e.amount.toFixed(2) : '',
      Balance: e.runningBalance.toFixed(2),
    }));
    downloadCSV(data, `${selectedAccount.name.replace(/\s+/g, '_')}_ledger.csv`);
  };

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
                accounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.account_number} - {acc.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedAccountId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{selectedAccount?.account_number} - {selectedAccount?.name || 'Ledger'}</CardTitle>
              <CardDescription>Transaction details and running balance.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={entriesWithBalance.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Ref #</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingEntries ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : entriesWithBalance.length > 0 ? (
                  entriesWithBalance.map((entry, index) => (
                    <TableRow key={index}>
                      <TableCell>{new Date(entry.entry_date).toLocaleDateString()}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.journal_entry_id.substring(0, 8)}</TableCell>
                      <TableCell className="text-right font-mono">{entry.type === 'debit' ? formatCurrency(entry.amount) : ''}</TableCell>
                      <TableCell className="text-right font-mono">{entry.type === 'credit' ? formatCurrency(entry.amount) : ''}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(entry.runningBalance)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">No transactions found for this account.</TableCell>
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