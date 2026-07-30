import { Landmark } from 'lucide-react';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';

/**
 * Read-only register of Financial Years from Settings → Financials.
 * Does not invent years — consumes ReportingPeriodContext (same calendar).
 */
const FinancialYears = () => {
  useDocumentTitle('Financial Years');
  const {
    financialYears: years,
    activeFinancialYear,
    isLoading,
  } = useReportingPeriod();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="h-7 w-7" /> Financial Years
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register of years from Settings → Financials. Configure year-end and active year there.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/settings?tab=accounting">Open Settings → Financials</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Financial Calendar</CardTitle>
          <CardDescription>
            Active year: {activeFinancialYear
              ? `${activeFinancialYear.startDate} – ${activeFinancialYear.endDate}`
              : '—'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {years.map((y) => (
                  <TableRow key={y.id}>
                    <TableCell className="font-semibold">{y.startDate}</TableCell>
                    <TableCell>{y.endDate}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{y.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {years.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-center py-8">
                      No financial years yet. Configure them in Settings → Financials.
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

export default FinancialYears;
