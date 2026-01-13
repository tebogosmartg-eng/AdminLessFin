import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { purchaseOrdersQuery } from '../lib/queries';
import PurchaseOrderForm from '../components/PurchaseOrderForm';
import { format } from 'date-fns';
import { showSuccess, showError } from '../utils/toast';
import { useNavigate } from 'react-router-dom';

const PurchaseOrders = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: pos, isLoading } = useQuery<any[]>({
    ...purchaseOrdersQuery(activeCompany?.id!),
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('purchase-orders', {
        body: { method: 'DELETE', company_id: activeCompany!.id, poId: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      showSuccess('PO deleted.');
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
                <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
              ) : pos && pos.length > 0 ? (
                pos.map((po) => (
                  <TableRow key={po.id} className="cursor-pointer" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{po.vendors?.name}</TableCell>
                    <TableCell>{format(new Date(po.po_date), 'PPP')}</TableCell>
                    <TableCell>{po.delivery_date ? format(new Date(po.delivery_date), 'PPP') : '-'}</TableCell>
                    <TableCell><Badge variant={po.status === 'billed' ? 'default' : (po.status === 'draft' ? 'outline' : 'secondary')}>{po.status}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/purchase-orders/${po.id}`)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(po.id); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(po.id); }} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={6} className="text-center">No purchase orders found.</TableCell></TableRow>
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