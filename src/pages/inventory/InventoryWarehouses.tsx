import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Warehouse } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { inventoryLocationsQuery, inventoryWarehousesQuery } from '../../lib/queries';
import { invokeInventory } from '../../lib/inventory/client';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { showError, showSuccess } from '../../utils/toast';

const InventoryWarehouses = () => {
  useDocumentTitle('Warehouses');
  const { activeCompany } = useAuth();
  const companyId = activeCompany!.id;
  const queryClient = useQueryClient();

  const [selectedWh, setSelectedWh] = useState<string | null>(null);
  const [whDialog, setWhDialog] = useState(false);
  const [locDialog, setLocDialog] = useState(false);
  const [whForm, setWhForm] = useState({ code: '', name: '', is_default: false });
  const [locForm, setLocForm] = useState({ code: '', name: '' });

  const { data: warehouses, isLoading } = useQuery({
    ...inventoryWarehousesQuery(companyId),
    enabled: !!activeCompany,
  });

  const activeWh = selectedWh || (warehouses?.[0] ? String(warehouses[0].id) : '');

  const { data: locations, isLoading: locLoading } = useQuery({
    ...inventoryLocationsQuery(companyId, activeWh),
    enabled: !!activeCompany && !!activeWh,
  });

  const upsertWarehouse = useMutation({
    mutationFn: async () => {
      await invokeInventory(companyId, {
        method: 'UPSERT_WAREHOUSE',
        warehouse: {
          code: whForm.code,
          name: whForm.name,
          is_default: whForm.is_default,
          status: 'active',
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_warehouses', companyId] });
      showSuccess('Warehouse saved.');
      setWhDialog(false);
      setWhForm({ code: '', name: '', is_default: false });
    },
    onError: (e: Error) => showError(e.message),
  });

  const upsertLocation = useMutation({
    mutationFn: async () => {
      if (!activeWh) throw new Error('Select a warehouse');
      await invokeInventory(companyId, {
        method: 'UPSERT_LOCATION',
        location: {
          warehouse_id: activeWh,
          code: locForm.code,
          name: locForm.name,
          status: 'active',
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_locations', companyId, activeWh] });
      showSuccess('Location saved.');
      setLocDialog(false);
      setLocForm({ code: '', name: '' });
    },
    onError: (e: Error) => showError(e.message),
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Warehouse className="h-8 w-8 text-primary" />
            Warehouses &amp; Locations
          </h1>
          <p className="text-muted-foreground mt-1">Manage sites and bin locations.</p>
        </div>
        <Button onClick={() => setWhDialog(true)}>Add warehouse</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base">Warehouses</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Default</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(warehouses || []).map((w) => (
                  <TableRow
                    key={String(w.id)}
                    className={`cursor-pointer ${activeWh === String(w.id) ? 'bg-muted/60' : ''}`}
                    onClick={() => setSelectedWh(String(w.id))}
                  >
                    <TableCell className="font-mono">{String(w.code)}</TableCell>
                    <TableCell>{String(w.name)}</TableCell>
                    <TableCell>{w.is_default ? 'Yes' : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Locations / bins</CardTitle>
            <Button size="sm" variant="outline" disabled={!activeWh} onClick={() => setLocDialog(true)}>
              Add location
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {locLoading ? (
              <Skeleton className="h-40 m-4" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(locations || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-6 text-muted-foreground">
                        No locations for this warehouse.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (locations || []).map((l) => (
                      <TableRow key={String(l.id)}>
                        <TableCell className="font-mono">{String(l.code)}</TableCell>
                        <TableCell>{String(l.name)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={whDialog} onOpenChange={setWhDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New warehouse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input value={whForm.code} onChange={(e) => setWhForm({ ...whForm, code: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={whForm.is_default}
                onChange={(e) => setWhForm({ ...whForm, is_default: e.target.checked })}
              />
              Default warehouse
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => upsertWarehouse.mutate()} disabled={upsertWarehouse.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={locDialog} onOpenChange={setLocDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New location</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input value={locForm.code} onChange={(e) => setLocForm({ ...locForm, code: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => upsertLocation.mutate()} disabled={upsertLocation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryWarehouses;
