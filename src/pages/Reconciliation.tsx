import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Account } from './ChartOfAccounts';
import Papa from 'papaparse';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const Reconciliation = () => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [statementEndDate, setStatementEndDate] = useState('');
  const [statementEndBalance, setStatementEndBalance] = useState('');
  const [bankTransactions, setBankTransactions] = useState<any[]>([]);

  const { data: bankAccounts } = useQuery<Account[]>({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .in('type', ['Asset'])
        .order('name');
      if (error) throw new Error(error.message);
      // A simple filter for accounts that are likely bank/cash accounts
      return data.filter(acc => 
        acc.name.toLowerCase().includes('bank') || 
        acc.name.toLowerCase().includes('checking') || 
        acc.name.toLowerCase().includes('cash')
      );
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setBankTransactions(results.data as any[]);
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Bank Reconciliation</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
          <CardDescription>Select an account and enter your bank statement details to begin.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label htmlFor="account-select" className="text-sm font-medium">Account to Reconcile</label>
            <Select onValueChange={setSelectedAccountId} value={selectedAccountId || ''}>
              <SelectTrigger id="account-select">
                <SelectValue placeholder="Select a bank or cash account..." />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="end-date" className="text-sm font-medium">Statement End Date</label>
            <Input id="end-date" type="date" value={statementEndDate} onChange={e => setStatementEndDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="end-balance" className="text-sm font-medium">Statement End Balance</label>
            <Input id="end-balance" type="number" placeholder="0.00" value={statementEndBalance} onChange={e => setStatementEndBalance(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {selectedAccountId && statementEndDate && statementEndBalance && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Bank Statement</CardTitle>
            <CardDescription>Upload a CSV file from your bank. We'll do our best to parse it.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input type="file" accept=".csv" onChange={handleFileUpload} />
          </CardContent>
        </Card>
      )}

      {bankTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Imported Bank Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.keys(bankTransactions[0]).map(key => <TableHead key={key}>{key}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankTransactions.map((row, index) => (
                  <TableRow key={index}>
                    {Object.values(row).map((value: any, i) => <TableCell key={i}>{value}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Reconciliation;