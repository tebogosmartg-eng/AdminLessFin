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
import { PlayCircle, Loader2, CheckCircle, AlertCircle, MoreHorizontal } from 'lucide-react';
import { showError, showSuccess } from '../utils/toast';
import { Employee } from './Employees';
import { Account } from './ChartOfAccounts';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import PayslipDialog from '../components/PayslipDialog';
import PayslipDetailDialog from '../components/PayslipDetailDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

export type Payslip = {
  id: string;
  basic_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  employees: { first_name: string; last_name: string };
};

const PayrollRunDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [wageAccountId, setWageAccountId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [liabilityAccountId, setLiabilityAccountId] = useState('');
  const [isPayslipDialogOpen, setIsPayslipDialogOpen] = useState(false);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [isPayslipDetailOpen, setIsPayslipDetailOpen] = useState(false);
  const [selectedPayslipIdForDetail, setSelectedPayslipIdForDetail] = useState<string | null>(null);

  const { data, isLoading: isLoadingRun } = useQuery({
    queryKey: ['payroll_run_detail', id, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('payroll', {
        body: {
          method: 'GET_RUN_DETAIL',
          company_id: activeCompany.id,
          runId: id,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const run = data?.run;
  const payslips = data?.payslips;

  const { data: accounts } = useQuery<Account[]>({ 
    queryKey: ['accounts', activeCompany?.id],
    enabled: !!activeCompany,
  });
  const expenseAccounts = accounts?.filter(a => a.type === 'Expense');
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability');

  const handleEditPayslip = (payslipId: string) => {
    setSelectedPayslipId(payslipId);
    setIsPayslipDialogOpen(true);
  };

  const handleViewPayslip = (payslipId: string) => {
    setSelectedPayslipIdForDetail(payslipId);
    setIsPayslipDetailOpen(true);
  };

  const generatePayslipsMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No active company selected');
      const { error } = await supabase.functions.invoke('payroll', {
        body: {
          method: 'GENERATE_PAYSLIPS',
          company_id: activeCompany.id,
          runId: id,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll_run_detail', id, activeCompany?.id] });
      showSuccess('Payslips generated successfully!');
    },
    onError: (error: any) => showError(error.message),
  });

  const finalizeRunMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !payslips || payslips.length === 0) throw new Error('Prerequisites not met.');
      
      const { error } = await supabase.functions.invoke('payroll', {
        body: {
          method: 'FINALIZE_RUN',
          company_id: activeCompany.id,
          run: run,
          wageAccountId,
          bankAccountId,
          liabilityAccountId,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll_run_detail', id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      showSuccess('Payroll run finalized and journal entry posted.');
    },
    onError: (error: any) => showError(error.message),
  });

  const totalEarnings = payslips?.reduce((sum, p) => sum + p.total_earnings, 0) || 0;
  const totalDeductions = payslips?.reduce((sum, p) => sum + p.total_deductions, 0) || 0;
  const totalNetPay = payslips?.reduce((sum, p) => sum + p.net_pay, 0) || 0;

  if (isLoadingRun) return <Skeleton className="h-96 w-full" />;
  if (!run) return <div>Payroll run not found.</div>;

  return (
    <>
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
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{p.employees.first_name} {p.employees.last_name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(p.total_earnings)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(p.total_deductions)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(p.net_pay)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewPayslip(p.id)}>View</DropdownMenuItem>
                              {run.status === 'draft' && (
                                <DropdownMenuItem onClick={() => handleEditPayslip(p.id)}>Edit</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
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
              <div className="grid md:grid-cols-3 gap-4">
                <Select value={wageAccountId} onValueChange={setWageAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select Wages/Salary Expense Account..." /></SelectTrigger>
                  <SelectContent>{expenseAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select Bank/Cash Account..." /></SelectTrigger>
                  <SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={liabilityAccountId} onValueChange={setLiabilityAccountId} disabled={totalDeductions === 0}>
                  <SelectTrigger><SelectValue placeholder="Select Payroll Liability Account..." /></SelectTrigger>
                  <SelectContent>{liabilityAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Journal Entry Preview</AlertTitle>
                <AlertDescription>
                  <p>Debit <strong>{accounts?.find(a => a.id === wageAccountId)?.name || 'Wages Expense'}</strong>: {formatCurrency(totalEarnings)}</p>
                  <p>Credit <strong>{accounts?.find(a => a.id === bankAccountId)?.name || 'Bank Account'}</strong>: {formatCurrency(totalNetPay)}</p>
                  {totalDeductions > 0 && <p>Credit <strong>{accounts?.find(a => a.id === liabilityAccountId)?.name || 'Payroll Liabilities'}</strong>: {formatCurrency(totalDeductions)}</p>}
                </AlertDescription>
              </Alert>
              <Button onClick={() => finalizeRunMutation.mutate()} disabled={!wageAccountId || !bankAccountId || (totalDeductions > 0 && !liabilityAccountId) || finalizeRunMutation.isPending}>
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
      {selectedPayslipId && (
        <PayslipDialog
          isOpen={isPayslipDialogOpen}
          setIsOpen={setIsPayslipDialogOpen}
          payslipId={selectedPayslipId}
        />
      )}
      {selectedPayslipIdForDetail && (
        <PayslipDetailDialog
          isOpen={isPayslipDetailOpen}
          setIsOpen={setIsPayslipDetailOpen}
          payslipId={selectedPayslipIdForDetail}
        />
      )}
    </>
  );
};

export default PayrollRunDetail;