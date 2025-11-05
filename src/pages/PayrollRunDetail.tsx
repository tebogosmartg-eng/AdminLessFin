import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { format } from 'date-fns';
import { PlayCircle, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { showError, showSuccess } from '../utils/toast';
import { Employee } from './Employees';
import { Account } from './ChartOfAccounts';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';

type Payslip = {
  id: string;
  basic_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  employees: { first_name: string; last_name: string };
};

const PayrollRunDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [wageAccountId, setWageAccountId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');

  const { data: run, isLoading: isLoadingRun } = useQuery({
    queryKey: ['payroll_run', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('payroll_runs').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: payslips, isLoading: isLoadingPayslips } = useQuery<Payslip[]>({
    queryKey: ['payslips', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('payslips').select('*, employees(first_name, last_name)').eq('payroll_run_id', id!);
      if (error) throw error;
      return data;
    },
  });

  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts'] });
  const expenseAccounts = accounts?.filter(a => a.type === 'Expense');
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');

  const generatePayslipsMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      const { data: employees, error: empError } = await supabase.from('employees').select('*').not('salary_amount', 'is', null);
      if (empError) throw empError;

      const newPayslips = employees.map((emp: Employee) => ({
        payroll_run_id: id!,
        employee_id: emp.id,
        user_id: user.id,
        basic_salary: emp.salary_amount!,
        total_earnings: emp.salary_amount!,
        total_deductions: 0,
        net_pay: emp.salary_amount!,
      }));

      const { data: insertedPayslips, error: payslipError } = await supabase.from('payslips').insert(newPayslips).select();
      if (payslipError) throw payslipError;

      const payslipItems = insertedPayslips.map(p => ({
        payslip_id: p.id,
        description: 'Basic Salary',
        type: 'earning',
        amount: p.basic_salary,
      }));
      
      const { error: itemsError } = await supabase.from('payslip_items').insert(payslipItems);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payslips', id] });
      showSuccess('Payslips generated successfully!');
    },
    onError: (error: any) => showError(error.message),
  });

  const finalizeRunMutation = useMutation({
    mutationFn: async () => {
      if (!user || !payslips || payslips.length === 0) throw new Error('Prerequisites not met.');
      
      const totalNetPay = payslips.reduce((sum, p) => sum + p.net_pay, 0);
      const totalWages = payslips.reduce((sum, p) => sum + p.total_earnings, 0);

      const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({
        user_id: user.id,
        entry_date: run.pay_date,
        description: `Payroll for period ${format(new Date(run.pay_period_start), 'P')} to ${format(new Date(run.pay_period_end), 'P')}`,
      }).select('id').single();
      if (entryError) throw entryError;

      const journalItems = [
        { journal_entry_id: entry.id, account_id: wageAccountId, type: 'debit', amount: totalWages },
        { journal_entry_id: entry.id, account_id: bankAccountId, type: 'credit', amount: totalNetPay },
      ];
      const { error: itemsError } = await supabase.from('journal_entry_items').insert(journalItems);
      if (itemsError) throw itemsError;

      const { error: runError } = await supabase.from('payroll_runs').update({ status: 'processed' }).eq('id', id!);
      if (runError) throw runError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll_run', id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Payroll run finalized and journal entry posted.');
    },
    onError: (error: any) => showError(error.message),
  });

  const totalNetPay = payslips?.reduce((sum, p) => sum + p.net_pay, 0) || 0;

  if (isLoadingRun) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Payroll Run</CardTitle>
              <CardDescription>
                {format(new Date(run.pay_period_start), 'PPP')} - {format(new Date(run.pay_period_end), 'PPP')}
              </CardDescription>
            </div>
            <Badge variant="outline" className="capitalize text-lg">{run.status}</Badge>
          </div>
        </CardHeader>
      </Card>

      {run.status === 'draft' && (!payslips || payslips.length === 0) && (
        <Card className="text-center p-8">
          <CardHeader>
            <CardTitle>Ready to Generate Payslips?</CardTitle>
            <CardDescription>This will create payslips for all employees with salary information for this period.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="lg" onClick={() => generatePayslipsMutation.mutate()} disabled={generatePayslipsMutation.isPending}>
              {generatePayslipsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Generate Payslips
            </Button>
          </CardContent>
        </Card>
      )}

      {payslips && payslips.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Payslips</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingPayslips ? <TableRow><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow> :
                  payslips.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{p.employees.first_name} {p.employees.last_name}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(p.total_earnings)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(p.total_deductions)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(p.net_pay)}</TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {run.status === 'draft' && payslips && payslips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Finalize Run & Post Journal Entry</CardTitle>
            <CardDescription>Select accounts and post the payroll transaction to your general ledger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Select value={wageAccountId} onValueChange={setWageAccountId}>
                <SelectTrigger><SelectValue placeholder="Select Wages/Salary Expense Account..." /></SelectTrigger>
                <SelectContent>{expenseAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Select Bank/Cash Account..." /></SelectTrigger>
                <SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Journal Entry Preview</AlertTitle>
              <AlertDescription>
                <p>Debit <strong>{accounts?.find(a => a.id === wageAccountId)?.name || 'Wages Expense'}</strong>: {formatCurrency(totalNetPay)}</p>
                <p>Credit <strong>{accounts?.find(a => a.id === bankAccountId)?.name || 'Bank Account'}</strong>: {formatCurrency(totalNetPay)}</p>
              </AlertDescription>
            </Alert>
            <Button onClick={() => finalizeRunMutation.mutate()} disabled={!wageAccountId || !bankAccountId || finalizeRunMutation.isPending}>
              {finalizeRunMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Finalize & Post
            </Button>
          </CardContent>
        </Card>
      )}

      {run.status === 'processed' && (
        <Alert variant="default" className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800 dark:text-green-300">Payroll Run Complete</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-400">
            This payroll run has been processed and the corresponding journal entry has been posted.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default PayrollRunDetail;