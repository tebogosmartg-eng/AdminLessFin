import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { invokeWork } from '../../lib/work/api';
import { formatCurrency, statusBadgeVariant } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { AlertTriangle, ArrowLeft, PlusCircle } from 'lucide-react';

type ResourceType = {
  id: string;
  label: string;
  payroll_eligible?: boolean;
  integration_target?: string;
};

type WorkResource = {
  id: string;
  name: string;
  resource_type_id: string;
  default_cost_rate?: number;
  default_billable_rate?: number;
  status?: string;
  ewm_resource_types?: {
    label?: string;
    payroll_eligible?: boolean;
    integration_target?: string;
  };
};

const emptyForm = {
  name: '',
  resource_type_id: '',
  default_cost_rate: '',
  default_billable_rate: '',
};

export default function WorkResources() {
  const { activeCompany } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: types = [] } = useQuery({
    queryKey: ['ewm_resource_types'],
    queryFn: () => invokeWork<ResourceType[]>(activeCompany!.id, 'LIST_RESOURCE_TYPES'),
    enabled: !!activeCompany,
  });

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['ewm_work_resources', activeCompany?.id],
    queryFn: () => invokeWork<WorkResource[]>(activeCompany!.id, 'LIST_WORK_RESOURCES'),
    enabled: !!activeCompany,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      invokeWork(activeCompany!.id, 'UPSERT_WORK_RESOURCE', {
        resource: {
          name: form.name.trim(),
          resource_type_id: form.resource_type_id,
          default_cost_rate: Number(form.default_cost_rate || 0),
          default_billable_rate: Number(form.default_billable_rate || 0),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ewm_work_resources'] });
      showSuccess('Work resource created.');
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
          <h1 className="text-3xl font-bold tracking-tight">Work Resources</h1>
          <p className="text-muted-foreground">People, plant, materials, and other operational resources.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New resource
        </Button>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Payroll boundary</AlertTitle>
        <AlertDescription>
          Subcontractors and consultants never generate payroll. Their costs remain operational /
          accounts-payable facts only.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
          <CardDescription>
            Types catalogue: {types.length} · Work resources: {resources.length}
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
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payroll eligible</TableHead>
                  <TableHead>Integration target</TableHead>
                  <TableHead className="text-right">Cost rate</TableHead>
                  <TableHead className="text-right">Billable rate</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No work resources yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  resources.map((r) => {
                    const type = r.ewm_resource_types;
                    const payrollEligible = type?.payroll_eligible;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{type?.label || r.resource_type_id}</TableCell>
                        <TableCell>
                          <Badge variant={payrollEligible ? 'success' : 'destructive'}>
                            {payrollEligible ? 'Yes' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell>{type?.integration_target || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(r.default_cost_rate || 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(Number(r.default_billable_rate || 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(r.status)}>{r.status || 'active'}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create work resource</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Resource type</Label>
              <Select
                value={form.resource_type_id}
                onValueChange={(v) => setForm((f) => ({ ...f, resource_type_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                      {!t.payroll_eligible ? ' (no payroll)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Default cost rate</Label>
                <Input
                  type="number"
                  value={form.default_cost_rate}
                  onChange={(e) => setForm((f) => ({ ...f, default_cost_rate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Default billable rate</Label>
                <Input
                  type="number"
                  value={form.default_billable_rate}
                  onChange={(e) => setForm((f) => ({ ...f, default_billable_rate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.name.trim() || !form.resource_type_id || createMutation.isPending}
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
