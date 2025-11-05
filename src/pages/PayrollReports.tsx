import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Calendar as CalendarIcon, Download } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn, downloadCSV } from '../lib/utils';
import { formatCurrency } from '../lib/utils';

type PayrollSummaryItem = {
  item_description: string;
  item_type: 'earning' | 'deduction';
  total_amount: number;
};

const PayrollReports = () => {
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const fromDate = date?.from ?? new Date();
  const toDate = date?.to ?? new Date();

  const { data: summaryData, isLoading } = useQuery<PayrollSummaryItem[]>({
    queryKey: ['payrollSummary', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_payroll_summary_report', {
        p_start_date: format(fromDate, 'yyyy-MM-dd'),
        p_end_date: format(toDate, 'yyyy-MM-dd'),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!fromDate && !!toDate,
  });

  const earnings = summaryData?.filter(item => item.item_type === 'earning') || [];
  const deductions = summaryData?.filter(item => item.item_type === 'deduction') || [];
  const totalEarnings = earnings.reduce((sum, item) => sum + item.total_amount, 0);
  const totalDeductions = deductions.reduce((sum, item) => sum + item.total_amount, 0);
  const netPay = totalEarnings - totalDeductions;

  const handleDownload = () => {
    const data: { Section: string, Item: string, Amount: string }[] = [];
    data.push({ Section: 'Earnings', Item: '', Amount: '' });
    earnings.forEach(item => data.push({ Section: '', Item: item.item_description, Amount: item.total_amount.toFixed(2) }));
    data.push({ Section: 'Total Earnings', Item: '', Amount: totalEarnings.toFixed(2) });
    data.push({ Section: '', Item: '', Amount: '' });
    data.push({ Section: 'Deductions', Item: '', Amount: '' });
    deductions.forEach(item => data.push({ Section: '', Item: item.item_description, Amount: item.total_amount.toFixed(2) }));
    data.push({ Section: 'Total Deductions', Item: '', Amount: totalDeductions.toFixed(2) });
    data.push({ Section: '', Item: '', Amount: '' });
    data.push({ Section: 'Net Pay', Item: '', Amount: netPay.toFixed(2) });
    downloadCSV(data, `payroll-summary-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Payroll Summary Report</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="date"
              variant={"outline"}
              className={cn("w-[300px] justify-start text-left font-normal", !date && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (<>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</>) : (format(date.from, "LLL dd, y"))
              ) : (<span>Pick a date</span>)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
          </PopoverContent>
        </Popover>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Summary</CardTitle>
            <CardDescription>For the period from {format(fromDate, "PPP")} to {format(toDate, "PPP")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={!summaryData || summaryData.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Download CSV
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : summaryData && summaryData.length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800"><TableCell>Earnings</TableCell><TableCell></TableCell></TableRow>
                {earnings.map(item => (<TableRow key={item.item_description}><TableCell className="pl-8">{item.item_description}</TableCell><TableCell className="text-right font-mono">{formatCurrency(item.total_amount)}</TableCell></TableRow>))}
                <TableRow className="font-semibold"><TableCell>Total Earnings</TableCell><TableCell className="text-right font-mono">{formatCurrency(totalEarnings)}</TableCell></TableRow>
                
                <TableRow className="font-semibold bg-gray-50 dark:bg-gray-800"><TableCell>Deductions</TableCell><TableCell></TableCell></TableRow>
                {deductions.map(item => (<TableRow key={item.item_description}><TableCell className="pl-8">{item.item_description}</TableCell><TableCell className="text-right font-mono">{formatCurrency(item.total_amount)}</TableCell></TableRow>))}
                <TableRow className="font-semibold"><TableCell>Total Deductions</TableCell><TableCell className="text-right font-mono">{formatCurrency(totalDeductions)}</TableCell></TableRow>
              </TableBody>
              <TableFooter>
                <TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-700">
                  <TableCell>Net Pay</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(netPay)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No processed payroll data found for the selected period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PayrollReports;