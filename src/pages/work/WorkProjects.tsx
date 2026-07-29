import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { invokeWork } from '../../lib/work/api';
import { formatCurrency, statusBadgeVariant } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { ArrowLeft, PlusCircle } from 'lucide-react';

type EwmProject = {
  id: string;
  name: string;
  status: string;
  contract_value?: number;
  operational_budget?: number;
  start_date?: string | null;
  expected_completion?: string | null;
  overall_progress?: number;
  client_id?: string | null;
};

const emptyForm = {
  name: '',
  status: 'active',
  contract_value: '',
  operational_budget: '',
  start_date: '',
  expected_completion: '',
};

export default function WorkProjects() {
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['ewm_projects', activeCompany?.id],
    queryFn: () => invokeWork<EwmProject[]>(activeCompany!.id, 'LIST_EWM_PROJECTS'),
    enabled: !!activeCompany,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'UPSERT_EWM_PROJECT', {
        project: {
          name: form.name.trim(),
          status: form.status,
          contract_value: Number(form.contract_value || 0),
          operational_budget: Number(form.operational_budget || 0),
          start_date: form.start_date || null,
          expected_completion: form.expected_completion || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ewm_projects'] });
      showSuccess('Project created.');
      setOpen(false);
      setForm(emptyForm);
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
          <h1 className="text-3xl font-bold tracking-tight">Work Projects</h1>
          <p className="text-muted-foreground">Enterprise Work Management project register.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New project
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Click a row to open the project command centre.</CardDescription>
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
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Contract value</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Expected completion</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No EWM projects yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  projects.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/work/projects/${p.id}`)}
                    >
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(p.contract_value || 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(p.operational_budget || 0))}
                      </TableCell>
                      <TableCell>{p.start_date || '—'}</TableCell>
                      <TableCell>{p.expected_completion || '—'}</TableCell>
                      <TableCell className="text-right">{Number(p.overall_progress || 0)}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create EWM project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['pipeline', 'active', 'on_hold', 'completed', 'archived'].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cv">Contract value</Label>
                <Input
                  id="cv"
                  type="number"
                  value={form.contract_value}
                  onChange={(e) => setForm((f) => ({ ...f, contract_value: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob">Operational budget</Label>
                <Input
                  id="ob"
                  type="number"
                  value={form.operational_budget}
                  onChange={(e) => setForm((f) => ({ ...f, operational_budget: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sd">Start date</Label>
                <Input
                  id="sd"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ec">Expected completion</Label>
                <Input
                  id="ec"
                  type="date"
                  value={form.expected_completion}
                  onChange={(e) => setForm((f) => ({ ...f, expected_completion: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
