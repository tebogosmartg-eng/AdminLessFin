import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { format } from 'date-fns';
import { formatCurrency, downloadCSV } from '../lib/utils';
import { Download } from 'lucide-react';
import LoanPaymentForm from '../components/LoanPaymentForm';

type LoanDetailData = {
  id: string;
  principal_amount: number;
  interest_rate: number;
  term_months: number;
  start_date: string;
  status: string;
  vendors: { name: string } | null;
};

type AmortizationScheduleItem = {
  id: string;
  payment_number: number;
  payment_date: string;
  payment_amount: number;
  principal: number;
  interest: number;
  remaining_balance: number;
  status: string;
};

const LoanDetail = () => {
  const { id } = useParams();
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState<AmortizationScheduleItem | null>(null);

  const { data: loan, isLoading: isLoadingLoan } = useQuery<LoanDetailData>({
    queryKey: ['loan_detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('*, vendors(name)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: schedule, isLoading: isLoadingSchedule } = useQuery<AmortizationScheduleItem[]>({
    queryKey: ['loan_schedule', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loan_amortization_schedule')
        .select('*')
        .eq('loan_id', id!)
        .order('payment_number', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const handleDownload = () => {
    if (!schedule) return;
    const dataToExport = schedule.map(item => ({
      'Payment Number': item.payment_number,
      'Payment Date': item.payment_date,
      'Payment Amount': item.payment_amount,
      'Principal': item.principal,
      'Interest': item.interest,
      'Remaining Balance': item.remaining_balance,
      'Status': item.status,
    }));
    downloadCSV(dataToExport, `amortization-schedule-loan-${id}.csv`);
  };

  const handleRecordPayment = (item: AmortizationScheduleItem) => {
    setSelectedScheduleItem(item);
    setIsPaymentFormOpen(true);
  };

  if (isLoadingLoan) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!loan) {
    return <div>Loan not found.</div>;
  }

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Loan Details</CardTitle>
                <CardDescription>Lender: {loan.vendors?.name || 'N/A'}</CardDescription>
              </div>
              <Badge variant="outline" className="capitalize text-lg">{loan.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-muted-foreground">Principal</p><p className="font-semibold">{formatCurrency(loan.principal_amount)}</p></div>
            <div><p className="text-muted-foreground">Interest Rate</p><p className="font-semibold">{loan.interest_rate}%</p></div>
            <div><p className="text-muted-foreground">Term</p><p className="font-semibold">{loan.term_months} months</p></div>
            <div><p className="text-muted-foreground">Start Date</p><p className="font-semibold">{format(new Date(loan.start_date), 'PPP')}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Amortization Schedule</CardTitle>
              <CardDescription>The full payment schedule for the lifetime of the loan.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={!schedule || schedule.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Download CSV
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Payment</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Remaining Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[150px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingSchedule ? (
                  [...Array(5)].map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell></TableRow>)
                ) : schedule && schedule.length > 0 ? (
                  schedule.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.payment_number}</TableCell>
                      <TableCell>{format(new Date(item.payment_date), 'PPP')}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.payment_amount)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.principal)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.interest)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.remaining_balance)}</TableCell>
                      <TableCell><Badge variant={item.status === 'paid' ? 'default' : 'secondary'} className="capitalize">{item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={item.status !== 'scheduled'}
                          onClick={() => handleRecordPayment(item)}
                        >
                          Record Payment
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={8} className="text-center">No schedule found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {selectedScheduleItem && (
        <LoanPaymentForm
          isOpen={isPaymentFormOpen}
          setIsOpen={setIsPaymentFormOpen}
          scheduleItem={selectedScheduleItem}
        />
      )}
    </>
  );
};

export default LoanDetail;