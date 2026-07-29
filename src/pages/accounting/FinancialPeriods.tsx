import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingPeriodsQuery } from '../../lib/accountingQueries';
import type { AccountingPeriodDomainModel } from '@/governance/domains/financialCalendar/model';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';

const FinancialPeriods = () => {
  useDocumentTitle('Financial Periods');
  const { activeCompany } = useAuth();
  const { data, isLoading } = useQuery({
    ...accountingPeriodsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  // Phase G3.2 — now sourced via Governance's FinancialCalendarService,
  // which returns the typed camelCase domain model instead of the old raw
  // snake_case rows.
  const periods = data || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CalendarRange className="h-7 w-7" /> Financial Periods
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Accounting period status from the period foundation — read-only control view.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Periods</CardTitle>
          <CardDescription>Created by · period status · financial year linkage</CardDescription>
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
                {periods.map((p: AccountingPeriodDomainModel) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">P{p.periodNumber}</TableCell>
                    <TableCell>{p.financialYearCode || '—'}</TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell>{p.endDate}</TableCell>
                    <TableCell><Badge className="capitalize" variant="outline">{p.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialPeriods;
