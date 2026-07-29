import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { invokeWork } from '../../lib/work/api';
import { formatCurrency, statusBadgeVariant } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import BillableTimesheetsPanel from '../../components/work/BillableTimesheetsPanel';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { Skeleton } from '../../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ArrowLeft, PlusCircle, Timer } from 'lucide-react';

type TimeEntry = {
  id: string;
  ewm_project_id: string;
  entry_date: string;
  hours: number;
  notes?: string | null;
  status: string;
  billable?: boolean;
  operational_rate?: number;
  billable_rate?: number;
  labour_cost?: number;
  billable_value?: number;
  employee_id?: string | null;
};

type EwmProject = { id: string; name: string };

const emptyForm = {
  ewm_project_id: '',
  entry_date: new Date().toISOString().slice(0, 10),
  hours: '',
  notes: '',
  operational_rate: '',
  billable_rate: '',
  billable: true,
  employee_id: '',
};

function timeBadgeVariant(status: string) {
  if (status === 'locked') return 'success' as const;
  return statusBadgeVariant(status);
}

export default function WorkTime() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'billing' ? 'billing' : 'allocation';
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['ewm_time_entries', activeCompany?.id],
    queryFn: () => invokeWork<TimeEntry[]>(activeCompany!.id, 'LIST_TIME_ENTRIES'),
    enabled: !!activeCompany,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['ewm_projects', activeCompany?.id],
    queryFn: () => invokeWork<EwmProject[]>(activeCompany!.id, 'LIST_EWM_PROJECTS'),
    enabled: !!activeCompany,
  });

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name || id;

  const createMutation = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'UPSERT_TIME_ENTRY', {
        entry: {
          ewm_project_id: form.ewm_project_id,
          entry_date: form.entry_date,
          hours: Number(form.hours || 0),
          notes: form.notes || null,
          operational_rate: Number(form.operational_rate || 0),
          billable_rate: Number(form.billable_rate || 0),
          billable: form.billable,
          employee_id: form.employee_id.trim() || null,
          status: 'draft',
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ewm_time_entries'] });
      showSuccess('Draft time entry created.');
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => showError(e.message),
  });

  const workflow = useMutation({
    mutationFn: ({ method, time_entry_id }: { method: string; time_entry_id: string }) =>
      invokeWork(activeCompany!.id, method, { time_entry_id }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ewm_time_entries'] });
      showSuccess(`${vars.method.replace(/_/g, ' ').toLowerCase()} succeeded.`);
    },
    onError: (e: Error) => showError(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link to="/work">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Executive dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Time</h1>
          <p className="text-muted-foreground">
            Approved allocation of work to projects, tasks and cost centres — not attendance punching.
          </p>
        </div>
        {view === 'allocation' && (
          <Button onClick={() => setOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New draft entry
          </Button>
        )}
      </div>

      <Alert>
        <Timer className="h-4 w-4" />
        <AlertTitle>Time vs Clocking</AlertTitle>
        <AlertDescription>
          <strong>Time</strong> is the approved operational allocation of effort.
          <strong> Clocking</strong> records presence evidence and may create draft time entries for approval.
          Use <Link className="underline" to="/work/clocking">Clocking</Link> for clock in/out.
        </AlertDescription>
      </Alert>

      <Tabs
        value={view}
        onValueChange={(v) => {
          if (v === 'billing') setSearchParams({ view: 'billing' });
          else setSearchParams({});
        }}
      >
        <TabsList>
          <TabsTrigger value="allocation">Work allocation</TabsTrigger>
          <TabsTrigger value="billing">Billable timesheets</TabsTrigger>
        </TabsList>

        <TabsContent value="allocation" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Operational time entries</CardTitle>
              <CardDescription>
                Draft → submit → approve → lock. Locked hours feed payroll input facts when eligible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Labour cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No time entries yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      entries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.entry_date}</TableCell>
                          <TableCell className="font-medium">{projectName(e.ewm_project_id)}</TableCell>
                          <TableCell className="text-right">{Number(e.hours || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(Number(e.labour_cost || 0))}
                          </TableCell>
                          <TableCell>
                            <Badge variant={timeBadgeVariant(e.status)}>{e.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            {e.status === 'draft' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  workflow.mutate({ method: 'SUBMIT_TIME_ENTRY', time_entry_id: e.id })
                                }
                              >
                                Submit
                              </Button>
                            )}
                            {e.status === 'submitted' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  workflow.mutate({ method: 'APPROVE_TIME_ENTRY', time_entry_id: e.id })
                                }
                              >
                                Approve
                              </Button>
                            )}
                            {e.status === 'approved' && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  workflow.mutate({ method: 'LOCK_TIME_ENTRY', time_entry_id: e.id })
                                }
                              >
                                Lock
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillableTimesheetsPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create draft time entry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={form.ewm_project_id}
                onValueChange={(v) => setForm((f) => ({ ...f, ewm_project_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Entry date</Label>
                <Input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  value={form.hours}
                  onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Operational rate</Label>
                <Input
                  type="number"
                  value={form.operational_rate}
                  onChange={(e) => setForm((f) => ({ ...f, operational_rate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Billable rate</Label>
                <Input
                  type="number"
                  value={form.billable_rate}
                  onChange={(e) => setForm((f) => ({ ...f, billable_rate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Employee ID (optional)</Label>
              <Input
                value={form.employee_id}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
                placeholder="UUID"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="billable"
                checked={form.billable}
                onCheckedChange={(v) => setForm((f) => ({ ...f, billable: v === true }))}
              />
              <Label htmlFor="billable">Billable</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.ewm_project_id || !form.hours || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Saving…' : 'Create draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
