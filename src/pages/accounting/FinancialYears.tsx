import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingYearsQuery } from '../../lib/accountingQueries';
import type { FinancialYearDomainModel } from '@/governance/domains/financialCalendar/model';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';

const FinancialYears = () => {
  useDocumentTitle('Financial Years');
  const { activeCompany } = useAuth();
  const { data, isLoading } = useQuery({
    ...accountingYearsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  // Phase G3.2 — now sourced via Governance's FinancialCalendarService,
  // which returns the typed camelCase domain model instead of the old raw
  // snake_case rows.
  const years = data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Landmark className="h-7 w-7" /> Financial Years
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financial year register — close/reopen remains in Settings / Financial Close.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/settings">Year close settings</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Years</CardTitle>
          <CardDescription>Audit-visible year status and date bounds</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year Code</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {years.map((y: FinancialYearDomainModel) => (
                  <TableRow key={y.id}>
                    <TableCell className="font-semibold">{y.yearCode}</TableCell>
                    <TableCell>{y.startDate}</TableCell>
                    <TableCell>{y.endDate}</TableCell>
                    <TableCell><Badge className="capitalize" variant="outline">{y.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{y.createdAt ? new Date(y.createdAt).toLocaleString() : '—'}</TableCell>
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

export default FinancialYears;
