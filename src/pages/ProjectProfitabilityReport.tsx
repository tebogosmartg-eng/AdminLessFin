import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Download } from 'lucide-react';
import { formatCurrency, downloadCSV, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';
import { Badge } from '../components/ui/badge';
import { Link } from 'react-router-dom';

type ProjectRow = {
  id: string;
  name: string;
  customer: string;
  status: string;
  revenue: number | null;
  expenses: number | null;
  profit: number | null;
  margin: number | null;
};

type ProjectProfitabilityPayload = {
  projects: ProjectRow[];
  company: { revenue: number; expenses: number; profit: number; margin: number };
  money_source: string;
};

/** Company P&L from Canonical Financial Aggregation only — no JE project sums. */
const ProjectProfitabilityReport = () => {
  const { activeCompany } = useAuth();
  const { dateFrom, dateTo, isReady } = useReportingPeriod();

  const { data, isLoading } = useQuery<ProjectProfitabilityPayload>({
    queryKey: ['project_profitability', activeCompany?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!activeCompany) {
        return { projects: [], company: { revenue: 0, expenses: 0, profit: 0, margin: 0 }, money_source: 'canonical_financial_aggregation' };
      }
      const { data: payload, error } = await supabase.functions.invoke('reports', {
        body: {
          method: 'GET_PROJECT_PROFITABILITY',
          company_id: activeCompany.id,
          start_date: dateFrom,
          end_date: dateTo,
        },
      });
      if (error) throw new Error(error.message);
      // Backward compat if edge still returned a bare array (should not).
      if (Array.isArray(payload)) {
        return {
          projects: payload,
          company: { revenue: 0, expenses: 0, profit: 0, margin: 0 },
          money_source: 'legacy',
        };
      }
      return payload as ProjectProfitabilityPayload;
    },
    enabled: !!activeCompany && isReady,
  });

  const company = data?.company || { revenue: 0, expenses: 0, profit: 0, margin: 0 };
  const projects = data?.projects || [];

  const handleDownload = () => {
    const rows = [
      {
        Project: 'COMPANY (Canonical Financial Aggregation)',
        Customer: '',
        Status: '',
        Revenue: company.revenue.toFixed(2),
        Expenses: company.expenses.toFixed(2),
        Profit: company.profit.toFixed(2),
        'Margin %': company.margin.toFixed(2) + '%',
      },
      ...projects.map((p) => ({
        Project: p.name,
        Customer: p.customer,
        Status: p.status,
        Revenue: 'n/a',
        Expenses: 'n/a',
        Profit: 'n/a',
        'Margin %': 'n/a',
      })),
    ];
    downloadCSV(rows, 'project-profitability-cfa.csv');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Project Profitability</h1>
        <div className="flex items-center gap-2">
          <ReportingPeriodPicker />
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={isLoading}>
            <Download className="mr-2 h-4 w-4" /> Download CSV
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Company totals are from the Canonical Financial Aggregation engine (same as Income Statement).
        Per-project journal allocation is not a second money engine and is not calculated here.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Company Revenue (CFA)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(company.revenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Company Expenses (CFA)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(company.expenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Company Net Profit (CFA)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', company.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(company.profit)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{company.margin.toFixed(1)}% Margin</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Directory only — monetary totals are company CFA above.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Money source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : projects.length > 0 ? (
                projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <Link to={`/projects/${project.id}`} className="text-primary hover:underline">
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>{project.customer}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">Company CFA only</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    No projects found. Company CFA totals still apply.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/50 text-lg font-bold">
                <TableCell colSpan={3}>Company (CFA)</TableCell>
                <TableCell className="text-right">{formatCurrency(company.profit)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectProfitabilityReport;
