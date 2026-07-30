import { CalendarRange } from 'lucide-react';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';

/**
 * Read-only period register — same calendar as Settings → Financials via ReportingPeriodContext.
 */
const FinancialPeriods = () => {
  useDocumentTitle('Financial Periods');
  const { accountingPeriods: periods, isLoading, yearCode } = useReportingPeriod();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CalendarRange className="h-7 w-7" /> Financial Periods
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Accounting periods for the company Financial Calendar
          {yearCode ? ' · Current Financial Year' : ''}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Periods</CardTitle>
          <CardDescription>Period status linked to Settings → Financials years</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Financial Year</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Modified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">Period {p.periodNumber}</TableCell>
                    <TableCell>{p.financialYearCode || '—'}</TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell>{p.endDate}</TableCell>
                    <TableCell><Badge className="capitalize" variant="outline">{p.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}</TableCell>
                  </TableRow>
                ))}
                {periods.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground text-center py-8">
                      No periods yet. Configure the Financial Year in Settings → Financials.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialPeriods;
