import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, ShoppingBag, Search } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Skeleton } from '../components/ui/skeleton';
import { statusBadgeVariant } from '../lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuth } from '../contexts/AuthContext';
import { purchaseOrdersQuery } from '../lib/queries';
import PurchaseOrderForm from '../components/PurchaseOrderForm';
import { format } from 'date-fns';
import { showSuccess, showError } from '../utils/toast';
import { useNavigate } from 'react-router-dom';

const PurchaseOrders = () => {
  useDocumentTitle('Purchase Orders');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: pos, isLoading } = useQuery<any[]>({
    ...purchaseOrdersQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('purchase-orders', {
        body: { method: 'CANCEL', company_id: activeCompany!.id, poId: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      showSuccess('Purchase order cancelled.');
    },
    onError: (e: any) => showError(e.message),
  });

  const handleEdit = (id: string) => {
    setSelectedId(id);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedId(undefined);
    setIsFormOpen(true);
  };

  const filteredPos = useMemo(() => {
    return (pos ?? []).filter((po) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        String(po.po_number ?? '').toLowerCase().includes(q) ||
        String(po.vendors?.name ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [pos, searchTerm, statusFilter]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>Manage orders to your vendors.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Purchase Order
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 pt-4">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search PO # or vendor..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="billed">Billed</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Delivery Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : pos && pos.length > 0 ? (
                filteredPos.length > 0 ? (
                filteredPos.map((po) => (
                  <TableRow key={po.id} className="cursor-pointer" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.vendors?.name}</TableCell>
                    <TableCell>{format(new Date(po.po_date), 'PPP')}</TableCell>
                    <TableCell>{po.delivery_date ? format(new Date(po.delivery_date), 'PPP') : '-'}</TableCell>
                    <TableCell><Badge variant={statusBadgeVariant(po.status)} className="capitalize">{po.status}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/purchase-orders/${po.id}`)}>View Details</DropdownMenuItem>
                          {(po.status === 'draft' || po.status === 'sent') && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(po.id); }}>Edit</DropdownMenuItem>
                          )}
                          {(po.status === 'draft' || po.status === 'sent') && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!window.confirm(`Cancel purchase order ${po.po_number}? It will remain on record and cannot be deleted.`)) return;
                                cancelMutation.mutate(po.id);
                              }}
                              className="text-red-600"
                            >
                              Cancel
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
                ) : (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={ShoppingBag}
                      title="No purchase orders match your filters"
                      description="Try adjusting your search or status filter."
                    />
                  </TableCell>
                </TableRow>
                )
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={ShoppingBag}
                      title="No purchase orders yet"
                      description="Create a purchase order to formalise what you're buying and convert it to a bill on delivery."
                      action={<Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" /> New Purchase Order</Button>}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <PurchaseOrderForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} poId={selectedId} />
    </>
  );
};

export default PurchaseOrders;