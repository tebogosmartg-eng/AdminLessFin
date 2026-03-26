import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Clock, DollarSign, FileSignature, CheckCircle, CircleDashed, Target, PlusCircle, MoreHorizontal, Calendar, Loader2 } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { format, addDays } from 'date-fns';
import MilestoneForm from '../components/MilestoneForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { showError, showSuccess } from '../utils/toast';

const ProjectDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isMilestoneFormOpen, setIsMilestoneFormOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<any>(null);

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

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: string) => {
      const { error } = await supabase.functions.invoke('projects', {
        body: {
          method: 'DELETE_MILESTONE',
          company_id: activeCompany!.id,
          milestoneId,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_detail', id] });
      showSuccess('Milestone deleted.');
    },
    onError: (e: any) => showError(e.message),
  });

  // ONE-CLICK INVOICE GENERATION
  const generateInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !data?.project) throw new Error("Missing company or project data");
      
      // 1. Get unbilled timesheets
      const { data: unbilled, error: unbilledError } = await supabase.functions.invoke('timesheets', {
        body: { method: 'GET_UNBILLED_TIME', company_id: activeCompany.id, customer_id: data.project.customer_id }
      });
      if (unbilledError) throw unbilledError;
      
      const projectUnbilled = unbilled.filter((t: any) => t.project_id === id);
      if (projectUnbilled.length === 0) throw new Error("No unbilled time to invoice.");

      // 2. Get Next Invoice Number
      const { data: invNum, error: numError } = await supabase.functions.invoke('invoices', {
        body: { method: 'GET_NEXT_INVOICE_NUMBER', company_id: activeCompany.id }
      });
      if (numError) throw numError;

      // 3. Get Default AR & Income Accounts
      const { data: accounts } = await supabase.functions.invoke('chart-of-accounts', {
        body: { method: 'GET', company_id: activeCompany.id }
      });
      const arAcc = accounts?.find((a: any) => a.name.toLowerCase().includes('receivable'));
      const incomeAcc = accounts?.find((a: any) => a.type === 'Income');
      
      if (!arAcc || !incomeAcc) throw new Error("Missing default A/R or Income account. Please check Chart of Accounts.");

      // 4. Construct Payload
      const p_items = projectUnbilled.map((t: any) => ({
        description: `${data.project.name} - ${t.notes || 'Time entry'}`,
        quantity: t.hours,
        unit_price: data.project.billable_rate || 0,
        income_account_id: incomeAcc.id,
        project_id: id
      }));

      const payload = {
        method: 'CREATE_WITH_TIMESHEETS',
        company_id: activeCompany.id,
        invoiceData: {
          invoice_number: invNum,
          invoice_date: format(new Date(), 'yyyy-MM-dd'),
          due_date: format(addDays(new Date(), 14), 'yyyy-MM-dd'), // Default Net 14
          customer_id: data.project.customer_id,
          accounts_receivable_id: arAcc.id,
          description: `Billing for project: ${data.project.name}`,
          p_items
        },
        timesheetIds: projectUnbilled.map((t: any) => t.id)
      };

      const { data: result, error: invError } = await supabase.functions.invoke('invoices', { body: payload });
      if (invError) throw invError;
      
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['project_detail', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showSuccess("Invoice generated successfully!");
      if (result?.id) navigate(`/invoices/${result.id}`);
    },
    onError: (e: any) => showError(e.message)
  });

  const project = data?.project;
  const milestones = data?.milestones || [];
  const stats = data?.stats;
  const timesheets = data?.timesheets;
  const financials = data?.financials;

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!project) {
    return <div>Project not found.</div>;
  }

  const handleEditMilestone = (m: any) => {
    setSelectedMilestone(m);
    setIsMilestoneFormOpen(true);
  };

  const handleAddMilestone = () => {
    setSelectedMilestone(null);
    setIsMilestoneFormOpen(true);
  };

  const profitMargin = financials?.totalRevenue > 0 
    ? (financials.profit / financials.totalRevenue) * 100 
    : 0;

  const budgetProgress = project.budget_amount > 0 
    ? ((financials?.totalRevenue || 0) / project.budget_amount) * 100 
    : 0;

  const completedMilestones = milestones.filter((m: any) => m.status === 'completed').length;
  const milestoneProgress = milestones.length > 0 ? (completedMilestones / milestones.length) * 100 : 0;

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
            <Button onClick={() => generateInvoiceMutation.mutate()} disabled={generateInvoiceMutation.isPending}>
              {generateInvoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}
              {generateInvoiceMutation.isPending ? 'Generating...' : `Auto-Invoice (${formatCurrency(stats.unbilledAmount)})`}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {project.budget_amount > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex justify-between">
                    Revenue vs Budget Goal
                    <Target className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-end mb-2">
                  <div className="text-2xl font-bold">{formatCurrency(financials?.totalRevenue || 0)}</div>
                  <div className="text-sm text-muted-foreground">Budget: {formatCurrency(project.budget_amount)}</div>
                </div>
                <Progress value={budgetProgress} className={cn(budgetProgress > 100 ? "bg-green-600" : "")} />
                <p className="text-xs text-muted-foreground mt-2">
                  {budgetProgress.toFixed(1)}% of revenue budget achieved.
                </p>
              </CardContent>
            </Card>
        )}
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex justify-between">
                    Milestone Completion
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex justify-between items-end mb-2">
                  <div className="text-2xl font-bold">{completedMilestones} / {milestones.length}</div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <Progress value={milestoneProgress} />
                <p className="text-xs text-muted-foreground mt-2">
                  {milestoneProgress.toFixed(1)}% of project phases completed.
                </p>
            </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
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

        <TabsContent value="milestones" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Milestones</CardTitle>
                <CardDescription>Track key deliverables and project phases.</CardDescription>
              </div>
              <Button onClick={handleAddMilestone} size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Milestone
              </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Milestone</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {milestones.length > 0 ? milestones.map((m: any) => (
                            <TableRow key={m.id}>
                                <TableCell>
                                    <div className="font-medium">{m.name}</div>
                                    <div className="text-xs text-muted-foreground line-clamp-1">{m.description}</div>
                                </TableCell>
                                <TableCell>
                                    {m.due_date ? (
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {format(new Date(m.due_date), 'PP')}
                                        </div>
                                    ) : '-'}
                                </TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(m.amount)}</TableCell>
                                <TableCell>
                                    <Badge variant={m.status === 'completed' ? 'default' : (m.status === 'in-progress' ? 'secondary' : 'outline')} className="capitalize">
                                        {m.status.replace('-', ' ')}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => handleEditMilestone(m)}>Edit</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => deleteMilestoneMutation.mutate(m.id)} className="text-red-600">Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No milestones defined for this project.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
          </Card>
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

      <MilestoneForm
        isOpen={isMilestoneFormOpen}
        setIsOpen={setIsMilestoneFormOpen}
        projectId={project.id}
        milestone={selectedMilestone}
      />
    </div>
  );
};

export default ProjectDetail;