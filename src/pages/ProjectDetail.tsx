import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Clock, DollarSign, FileSignature, CheckCircle, CircleDashed } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import InvoiceForm from '../components/InvoiceForm';

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

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!project) {
    return <div>Project not found.</div>;
  }

  // To auto-populate the invoice form, we construct a "duplicateFromId" style object
  // essentially mimicking an existing invoice but populated with project data.
  // However, InvoiceForm expects an ID or duplicate ID to fetch data.
  // The better way is to pass initial data to InvoiceForm, but my InvoiceForm implementation currently fetches by ID.
  //
  // Workaround: I will modify InvoiceForm to accept `initialData`? 
  // No, simpler: Use the existing "Add Unbilled Time" flow within InvoiceForm.
  // I will open InvoiceForm with the customer pre-selected.

  const handleCreateInvoice = () => {
    setIsInvoiceFormOpen(true);
  };

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
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
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

      {/* 
        We use the standard InvoiceForm. 
        Note: The InvoiceForm doesn't currently accept a pre-selected customer ID 
        when opening in 'new' mode via props easily without fetching.
        I will modify InvoiceForm in the next step to accept initialCustomerId.
      */}
      <InvoiceForm
        isOpen={isInvoiceFormOpen}
        setIsOpen={setIsInvoiceFormOpen}
        initialCustomerId={project.customer_id}
      />
    </div>
  );
};

export default ProjectDetail;