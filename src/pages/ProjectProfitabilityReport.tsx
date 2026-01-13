import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Download } from 'lucide-react';
import { formatCurrency, downloadCSV, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/ui/badge';
import { Link } from 'react-router-dom';

type ProjectStat = {
  id: string;
  name: string;
  customer: string;
  status: string;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
};

const ProjectProfitabilityReport = () => {
  const { activeCompany } = useAuth();

  const { data: projects, isLoading } = useQuery<ProjectStat[]>({
    queryKey: ['project_profitability', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          method: 'GET_PROJECT_PROFITABILITY',
          company_id: activeCompany.id,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  const totals = projects?.reduce((acc, p) => ({
    revenue: acc.revenue + p.revenue,
    expenses: acc.expenses + p.expenses,
    profit: acc.profit + p.profit
  }), { revenue: 0, expenses: 0, profit: 0 }) || { revenue: 0, expenses: 0, profit: 0 };

  const totalMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const handleDownload = () => {
    if (!projects) return;
    const data = projects.map(p => ({
      Project: p.name,
      Customer: p.customer,
      Status: p.status,
      Revenue: p.revenue.toFixed(2),
      Expenses: p.expenses.toFixed(2),
      Profit: p.profit.toFixed(2),
      'Margin %': p.margin.toFixed(2) + '%'
    }));
    data.push({ Project: 'TOTALS', Customer: '', Status: '', Revenue: totals.revenue.toFixed(2), Expenses: totals.expenses.toFixed(2), Profit: totals.profit.toFixed(2), 'Margin %': totalMargin.toFixed(2) + '%' });
    downloadCSV(data, 'project-profitability.csv');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Project Profitability</h1>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={!projects || projects.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Download CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Project Revenue</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{isLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(totals.revenue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Project Costs</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{isLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(totals.expenses)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Net Project Profit</CardTitle></CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", totals.profit >= 0 ? "text-green-600" : "text-red-600")}>
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(totals.profit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{totalMargin.toFixed(1)}% Margin</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Breakdown</CardTitle>
          <CardDescription>Profit and loss by project.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
              ) : projects && projects.length > 0 ? (
                projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <Link to={`/projects/${project.id}`} className="hover:underline text-primary">
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>{project.customer}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{project.status}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(project.revenue)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(project.expenses)}</TableCell>
                    <TableCell className={cn("text-right font-mono font-bold", project.profit >= 0 ? "text-green-600" : "text-red-600")}>
                      {formatCurrency(project.profit)}
                    </TableCell>
                    <TableCell className="text-right">{project.margin.toFixed(1)}%</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No project financial data found.</TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/50 font-bold text-lg">
                <TableCell colSpan={3}>Totals</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.revenue)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.expenses)}</TableCell>
                <TableCell className={cn("text-right", totals.profit >= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(totals.profit)}</TableCell>
                <TableCell className="text-right">{totalMargin.toFixed(1)}%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectProfitabilityReport;