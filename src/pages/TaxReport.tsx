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
import { cn, downloadCSV, formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

type TaxReportItem = {
  name: string;
  rate: number;
  netSales: number;
  taxCollected: number;
};

const TaxReport = () => {
  const { activeCompany } = useAuth();
  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const fromDate = date?.from ?? new Date();
  const toDate = date?.to ?? new Date();

  const { data: taxData, isLoading } = useQuery<TaxReportItem[]>({
    queryKey: ['tax_report', fromDate, toDate, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          method: 'GET_TAX_REPORT',
          company_id: activeCompany.id,
          start_date: format(fromDate, 'yyyy-MM-dd'),
          end_date: format(toDate, 'yyyy-MM-dd'),
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany && !!fromDate && !!toDate,
  });

  const totalNetSales = taxData?.reduce((sum, item) => sum + item.netSales, 0) || 0;
  const totalTaxCollected = taxData?.reduce((sum, item) => sum + item.taxCollected, 0) || 0;

  const handleDownload = () => {
    if (!taxData) return;
    const data = taxData.map(item => ({
      'Tax Name': item.name,
      'Rate (%)': item.rate.toString(), // Converted to string to match the total row type
      'Net Sales': item.netSales.toFixed(2),
      'Tax Collected': item.taxCollected.toFixed(2),
    }));
    data.push({ 'Tax Name': 'Total', 'Rate (%)': '', 'Net Sales': totalNetSales.toFixed(2), 'Tax Collected': totalTaxCollected.toFixed(2) });
    downloadCSV(data, `tax-report-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sales Tax Report</h1>
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
            <CardTitle>Tax Liability</CardTitle>
            <CardDescription>Sales tax collected for the period from {format(fromDate, "PPP")} to {format(toDate, "PPP")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={!taxData || taxData.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Download CSV
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : taxData && taxData.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tax Name</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Net Sales (Taxable)</TableHead>
                  <TableHead className="text-right">Tax Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxData.map(item => (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">{item.rate}%</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.netSales)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.taxCollected)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="text-lg font-bold bg-gray-100 dark:bg-gray-800">
                  <TableCell colSpan={2}>Totals</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalNetSales)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalTaxCollected)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No tax data found for the selected period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TaxReport;