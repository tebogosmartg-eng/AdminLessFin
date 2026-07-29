import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { invokeWork } from '../../lib/work/api';
import { formatCurrency, statusBadgeVariant } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import ProjectEconomicsStrip, { type ProjectEconomics } from '../../components/work/ProjectEconomicsStrip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Skeleton } from '../../components/ui/skeleton';
import { ArrowLeft, PlusCircle } from 'lucide-react';

type ProjectDetail = {
  project: {
    id: string;
    name: string;
    status: string;
    client_id?: string | null;
    project_manager_id?: string | null;
    contract_value?: number;
    start_date?: string | null;
    expected_completion?: string | null;
    overall_progress?: number;
    operational_budget?: number;
  };
  tasks: Array<{
    id: string;
    name: string;
    estimate_hours?: number;
    remaining_hours?: number;
    status: string;
    priority: string;
  }>;
  phases: Array<{ id: string; name: string; sequence_no?: number; start_date?: string; end_date?: string; status: string }>;
  milestones: Array<{ id: string; name: string; due_date?: string; status: string }>;
  costRollups: Array<{ id: string; cost_category: string; period_month: string; amount: number }>;
  consumptions: Array<{
    id: string;
    work_resource_id: string;
    cost_category: string;
    quantity: number;
    unit_cost: number;
    amount: number;
    consumption_date: string;
    status: string;
    ewm_work_resources?: { name?: string };
  }>;
  economics: ProjectEconomics;
};

type TimeEntry = {
  id: string;
  entry_date: string;
  hours: number;
  status: string;
  billable?: boolean;
  notes?: string | null;
  labour_cost?: number;
  billable_value?: number;
  timesheet_id?: string | null;
};

type WorkResource = {
  id: string;
  name: string;
  default_cost_rate?: number;
};

const COST_CATEGORIES = [
  'labour',
  'temporary_labour',
  'subcontractor',
  'equipment',
  'vehicle',
  'plant',
  'tools',
  'rental_equipment',
  'material',
  'accommodation',
  'travel',
  'fuel',
  'other',
];

const emptyTask = {
  name: '',
  estimate_hours: '',
  remaining_hours: '',
  status: 'todo',
  priority: 'medium',
};

const emptyConsumption = {
  work_resource_id: '',
  quantity: '1',
  unit_cost: '',
  cost_category: 'material',
  consumption_date: new Date().toISOString().slice(0, 10),
};

function timeBadgeVariant(status: string) {
  if (status === 'locked') return 'success' as const;
  return statusBadgeVariant(status);
}

export default function WorkProjectCommandCentre() {
  const { id } = useParams<{ id: string }>();
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [consForm, setConsForm] = useState(emptyConsumption);

  const projectKey = ['ewm_project', activeCompany?.id, id];

  const { data, isLoading } = useQuery({
    queryKey: projectKey,
    queryFn: () =>
      invokeWork<ProjectDetail>(activeCompany!.id, 'GET_EWM_PROJECT', { ewm_project_id: id }),
    enabled: !!activeCompany && !!id,
  });

  const { data: resources = [] } = useQuery({
    queryKey: ['ewm_work_resources', activeCompany?.id],
    queryFn: () => invokeWork<WorkResource[]>(activeCompany!.id, 'LIST_WORK_RESOURCES'),
    enabled: !!activeCompany,
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['ewm_time_entries', activeCompany?.id, id],
    queryFn: () =>
      invokeWork<TimeEntry[]>(activeCompany!.id, 'LIST_TIME_ENTRIES', { ewm_project_id: id }),
    enabled: !!activeCompany && !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: projectKey });
    qc.invalidateQueries({ queryKey: ['ewm_time_entries', activeCompany?.id, id] });
  };

  const taskMutation = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'UPSERT_TASK', {
        task: {
          ewm_project_id: id,
          name: taskForm.name.trim(),
          estimate_hours: Number(taskForm.estimate_hours || 0),
          remaining_hours: Number(taskForm.remaining_hours || 0),
          status: taskForm.status,
          priority: taskForm.priority,
        },
      }),
    onSuccess: () => {
      showSuccess('Task saved.');
      setTaskForm(emptyTask);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const consumptionMutation = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'UPSERT_RESOURCE_CONSUMPTION', {
        consumption: {
          ewm_project_id: id,
          work_resource_id: consForm.work_resource_id,
          quantity: Number(consForm.quantity || 1),
          unit_cost: Number(consForm.unit_cost || 0),
          cost_category: consForm.cost_category,
          consumption_date: consForm.consumption_date,
        },
      }),
    onSuccess: () => {
      showSuccess('Consumption recorded.');
      setConsForm(emptyConsumption);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const approveConsumption = useMutation({
    mutationFn: (consumption_id: string) =>
      invokeWork(activeCompany!.id, 'APPROVE_RESOURCE_CONSUMPTION', { consumption_id }),
    onSuccess: () => {
      showSuccess('Consumption approved.');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const lockConsumption = useMutation({
    mutationFn: (consumption_id: string) =>
      invokeWork(activeCompany!.id, 'LOCK_RESOURCE_CONSUMPTION', { consumption_id }),
    onSuccess: () => {
      showSuccess('Consumption locked.');
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  const timeAction = useMutation({
    mutationFn: ({ method, time_entry_id }: { method: string; time_entry_id: string }) =>
      invokeWork(activeCompany!.id, method, { time_entry_id }),
    onSuccess: (_d, vars) => {
      showSuccess(`${vars.method.replace(/_/g, ' ').toLowerCase()} succeeded.`);
      invalidate();
    },
    onError: (e: Error) => showError(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  const p = data.project;

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link to="/work/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All projects
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
              <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              Client: {p.client_id || '—'} · PM: {p.project_manager_id || 'Not assigned'} · Progress:{' '}
              {Number(p.overall_progress || 0)}%
            </p>
            <p className="text-sm text-muted-foreground">
              Contract {formatCurrency(Number(p.contract_value || 0))} · {p.start_date || '—'} →{' '}
              {p.expected_completion || '—'}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/work">Executive dashboard</Link>
          </Button>
        </div>
      </div>

      <ProjectEconomicsStrip economics={data.economics} />

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tasks</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{data.tasks.length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Milestones</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{data.milestones.length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Consumptions</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{data.consumptions.length}</CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Operational snapshot</CardTitle>
              <CardDescription>Economics derived from locked labour and resource burn vs contract.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-2">
              <div>Forecast profit: {formatCurrency(Number(data.economics?.forecastProfit || 0))}</div>
              <div>Forecast margin: {Number(data.economics?.forecastMargin || 0).toFixed(1)}%</div>
              <div>Budget remaining: {formatCurrency(Number(data.economics?.budgetRemaining || 0))}</div>
              <div>Operational burn: {formatCurrency(Number(data.economics?.operationalBurn || 0))}</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add task</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2 space-y-2">
                <Label>Name</Label>
                <Input
                  value={taskForm.name}
                  onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Estimate hours</Label>
                <Input
                  type="number"
                  value={taskForm.estimate_hours}
                  onChange={(e) => setTaskForm((f) => ({ ...f, estimate_hours: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Remaining hours</Label>
                <Input
                  type="number"
                  value={taskForm.remaining_hours}
                  onChange={(e) => setTaskForm((f) => ({ ...f, remaining_hours: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={taskForm.status}
                  onValueChange={(v) => setTaskForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['todo', 'in_progress', 'blocked', 'done', 'cancelled'].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(v) => setTaskForm((f) => ({ ...f, priority: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['low', 'medium', 'high', 'critical'].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-6">
                <Button
                  disabled={!taskForm.name.trim() || taskMutation.isPending}
                  onClick={() => taskMutation.mutate()}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Save task
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Estimate</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No tasks yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge>
                        </TableCell>
                        <TableCell>{t.priority}</TableCell>
                        <TableCell className="text-right">{Number(t.estimate_hours || 0)}</TableCell>
                        <TableCell className="text-right">{Number(t.remaining_hours || 0)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cost rollups by category</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.costRollups || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No cost rollups yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.costRollups.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.cost_category}</TableCell>
                        <TableCell>{r.period_month}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(r.amount || 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resource consumptions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.consumptions || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No consumptions.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.consumptions.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.ewm_work_resources?.name || c.work_resource_id}</TableCell>
                        <TableCell>{c.cost_category}</TableCell>
                        <TableCell>{c.consumption_date}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(c.amount || 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={timeBadgeVariant(c.status)}>{c.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add resource consumption</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2 space-y-2">
                <Label>Work resource</Label>
                <Select
                  value={consForm.work_resource_id}
                  onValueChange={(v) => {
                    const res = resources.find((r) => r.id === v);
                    setConsForm((f) => ({
                      ...f,
                      work_resource_id: v,
                      unit_cost: f.unit_cost || String(res?.default_cost_rate ?? ''),
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={consForm.quantity}
                  onChange={(e) => setConsForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit cost</Label>
                <Input
                  type="number"
                  value={consForm.unit_cost}
                  onChange={(e) => setConsForm((f) => ({ ...f, unit_cost: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Cost category</Label>
                <Select
                  value={consForm.cost_category}
                  onValueChange={(v) => setConsForm((f) => ({ ...f, cost_category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Consumption date</Label>
                <Input
                  type="date"
                  value={consForm.consumption_date}
                  onChange={(e) => setConsForm((f) => ({ ...f, consumption_date: e.target.value }))}
                />
              </div>
              <div className="md:col-span-5">
                <Button
                  disabled={!consForm.work_resource_id || consumptionMutation.isPending}
                  onClick={() => consumptionMutation.mutate()}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add consumption
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consumptions</CardTitle>
              <CardDescription>Approve then lock to post operational cost facts.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.consumptions || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No consumptions.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.consumptions.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.ewm_work_resources?.name || c.work_resource_id}</TableCell>
                        <TableCell>{Number(c.quantity)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(c.amount || 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={timeBadgeVariant(c.status)}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {(c.status === 'draft' || c.status === 'submitted') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveConsumption.mutate(c.id)}
                            >
                              Approve
                            </Button>
                          )}
                          {c.status === 'approved' && (
                            <Button size="sm" onClick={() => lockConsumption.mutate(c.id)}>
                              Lock
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.milestones || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No milestones.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.milestones.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>{m.name}</TableCell>
                          <TableCell>{m.due_date || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(m.status)}>{m.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Phases</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Window</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.phases || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No phases.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.phases.map((ph) => (
                        <TableRow key={ph.id}>
                          <TableCell>{ph.sequence_no ?? '—'}</TableCell>
                          <TableCell>{ph.name}</TableCell>
                          <TableCell>
                            {ph.start_date || '—'} → {ph.end_date || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(ph.status)}>{ph.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Time entries</CardTitle>
              <CardDescription>
                Submit → approve → lock. Billable locked entries can project to legacy timesheets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No time entries for this project.
                      </TableCell>
                    </TableRow>
                  ) : (
                    timeEntries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{e.entry_date}</TableCell>
                        <TableCell className="text-right">{Number(e.hours || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={timeBadgeVariant(e.status)}>{e.status}</Badge>
                        </TableCell>
                        <TableCell>{e.billable === false ? 'No' : 'Yes'}</TableCell>
                        <TableCell className="text-right space-x-1">
                          {e.status === 'draft' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                timeAction.mutate({ method: 'SUBMIT_TIME_ENTRY', time_entry_id: e.id })
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
                                timeAction.mutate({ method: 'APPROVE_TIME_ENTRY', time_entry_id: e.id })
                              }
                            >
                              Approve
                            </Button>
                          )}
                          {e.status === 'approved' && (
                            <Button
                              size="sm"
                              onClick={() =>
                                timeAction.mutate({ method: 'LOCK_TIME_ENTRY', time_entry_id: e.id })
                              }
                            >
                              Lock
                            </Button>
                          )}
                          {e.billable !== false &&
                            (e.status === 'locked' || e.status === 'approved') &&
                            !e.timesheet_id && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  timeAction.mutate({
                                    method: 'PROJECT_TO_TIMESHEET',
                                    time_entry_id: e.id,
                                  })
                                }
                              >
                                To timesheet
                              </Button>
                            )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
