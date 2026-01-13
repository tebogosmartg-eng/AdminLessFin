import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Clock, DollarSign, FileSignature, CheckCircle, CircleDashed, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import InvoiceForm from '../components/InvoiceForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const ProjectDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const [isInvoiceFormOpen, setIsInvoiceFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['project_detail', id, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('projects', {
        body: {
          method: 'GET_DETAILS',
          company_id: activeCompany.id,
          projectId: id,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!activeCompany,
  });

  const project = data?.project;
  const stats = data?.stats;
  const timesheets = data?.timesheets;
  const financials = data?.financials;

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!project) {
    return <div>Project not found.</div>;
  }

  const handleCreateInvoice = () => {
    setIsInvoiceFormOpen(true);
  };

  const profitMargin = financials?.totalRevenue > 0 
    ? (financials.profit / financials.totalRevenue) * 100 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="capitalize">
              {project.status}
            </Badge>
            {project.customers && <span className="text-muted-foreground">for {project.customers.name}</span>}
          </div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{project.description}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/time-tracking')} variant="outline">
            <Clock className="mr-2 h-4 w-4" /> Log Time
          </Button>
          {stats?.unbilledAmount > 0 && (
            <Button onClick={handleCreateInvoice}>
              <FileSignature className="mr-2 h-4 w-4" /> Invoice Unbilled ({formatCurrency(stats.unbilledAmount)})
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financials">Profitability</TabsTrigger>
          <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalHours.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Logged across {stats?.timesheetCount} entries</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Estimated Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.billableAmount || 0)}</div>
                <p className="text-xs text-muted-foreground">Based on rate of {formatCurrency(project.billable_rate || 0)}/hr</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unbilled Value</CardTitle>
                <CircleDashed className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{formatCurrency(stats?.unbilledAmount || 0)}</div>
                <p className="text-xs text-muted-foreground">{stats?.unbilledHours.toFixed(2)} hours pending</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Invoiced Value</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency((stats?.billableAmount || 0) - (stats?.unbilledAmount || 0))}</div>
                <p className="text-xs text-muted-foreground">Already billed to client</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="financials" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Profitability (Actuals)</CardTitle>
              <CardDescription>Based on posted Invoices (Revenue) and Bills/Expenses (Costs) tagged to this project.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-1">
                  <span className="text-sm font-medium text-muted-foreground">Total Revenue</span>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(financials?.totalRevenue || 0)}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium text-muted-foreground">Total Costs</span>
                  <div className="text-2xl font-bold text-red-600">{formatCurrency(financials?.totalExpenses || 0)}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium text-muted-foreground">Net Profit</span>
                  <div className={cn("text-2xl font-bold", (financials?.profit || 0) >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatCurrency(financials?.profit || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Margin: {profitMargin.toFixed(1)}%</div>
                </div>
              </div>
              
              <div className="mt-8 flex h-4 w-full rounded-full overflow-hidden bg-secondary">
                <div 
                  className="bg-green-500 h-full" 
                  style={{ width: `${Math.min((financials?.totalRevenue / (financials?.totalRevenue + financials?.totalExpenses || 1)) * 100, 100)}%` }} 
                />
                <div 
                  className="bg-red-500 h-full" 
                  style={{ width: `${Math.min((financials?.totalExpenses / (financials?.totalRevenue + financials?.totalExpenses || 1)) * 100, 100)}%` }} 
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>Revenue</span>
                <span>Expenses</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timesheets">
          <Card>
            <CardHeader>
              <CardTitle>Time Entries</CardTitle>
              <CardDescription>History of work logged for this project.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets && timesheets.length > 0 ? (
                    timesheets.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.date), 'PPP')}</TableCell>
                        <TableCell className="max-w-md truncate" title={entry.notes}>{entry.notes || '-'}</TableCell>
                        <TableCell className="text-right font-mono">{entry.hours.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(entry.hours * (project.billable_rate || 0))}</TableCell>
                        <TableCell>
                          <Badge variant={entry.is_billed ? 'default' : 'outline'}>
                            {entry.is_billed ? 'Billed' : 'Unbilled'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center">No time entries found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <InvoiceForm
        isOpen={isInvoiceFormOpen}
        setIsOpen={setIsInvoiceFormOpen}
        initialCustomerId={project.customer_id}
      />
    </div>
  );
};

export default ProjectDetail;