import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Printer, FileCheck } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { showError, showSuccess } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import BillForm from '../components/BillForm';

const PurchaseOrderDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [isBillFormOpen, setIsBillFormOpen] = useState(false);

  const { data: po, isLoading } = useQuery({
    queryKey: ['po_detail', id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('purchase-orders', {
        body: { method: 'GET_ONE', company_id: activeCompany.id, poId: id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!activeCompany,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('purchase-orders', {
        body: { method: 'PUT', company_id: activeCompany.id, poId: id, poData: { status } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po_detail', id] });
      showSuccess('PO status updated.');
    },
    onError: (error: any) => showError(error.message),
  });

  const totalAmount = po?.purchase_order_items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_cost), 0) || 0;

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!po) {
    return <div>Purchase Order not found.</div>;
  }

  return (
    <>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-background print:max-w-none print:p-8 print:mx-0 print:bg-white">
        <div className="flex justify-between items-start mb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-bold">Purchase Order {po.po_number}</h1>
            <Badge className="mt-2 capitalize">{po.status}</Badge>
          </div>
          <div className="flex gap-2">
            {po.status !== 'billed' && po.status !== 'closed' && (
              <Button onClick={() => setIsBillFormOpen(true)}>
                <FileCheck className="mr-2 h-4 w-4" /> Convert to Bill
              </Button>
            )}
            {po.status === 'draft' && (
              <Button variant="outline" onClick={() => updateStatusMutation.mutate('sent')}>Mark Sent</Button>
            )}
            <Button onClick={() => window.print()} variant="outline"><Printer className="mr-2 h-4 w-4" /> Print</Button>
          </div>
        </div>
        
        <Card className="print:shadow-none print:border-none">
          <CardHeader className="grid grid-cols-2 gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight mb-1">{activeCompany?.name}</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{activeCompany?.address}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tracking-tight text-muted-foreground">PURCHASE ORDER</p>
              <p className="font-mono text-lg">{po.po_number}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <h3 className="font-semibold mb-1">Vendor:</h3>
                <p>{po.vendors?.name}</p>
                <p className="whitespace-pre-wrap">{po.vendors?.address}</p>
                <p>{po.vendors?.email}</p>
              </div>
              <div className="text-right">
                <p><span className="font-semibold">Date:</span> {format(new Date(po.po_date), 'PPP')}</p>
                {po.delivery_date && <p><span className="font-semibold">Delivery Due:</span> {format(new Date(po.delivery_date), 'PPP')}</p>}
              </div>
            </div>
            
            {po.notes && (
              <div className="mb-6 bg-muted/30 p-3 rounded-md">
                <h4 className="font-semibold text-sm mb-1">Notes:</h4>
                <p className="text-sm">{po.notes}</p>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.purchase_order_items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.unit_cost)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.quantity * item.unit_cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="text-lg font-bold bg-muted/50">
                  <TableCell colSpan={3} className="text-right">Total</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalAmount)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* 
        We use the existing BillForm. 
        Currently BillForm doesn't accept initial data props. 
        I need to update BillForm to accept `initialData` to pre-populate from PO.
      */}
      <BillForm
        isOpen={isBillFormOpen}
        setIsOpen={setIsBillFormOpen}
        initialData={{
          vendor_id: po.vendor_id,
          description: `From PO ${po.po_number}`,
          items: po.purchase_order_items.map((i: any) => ({
            product_id: i.product_id || '',
            description: i.description,
            quantity: i.quantity,
            unit_cost: i.unit_cost,
            expense_account_id: '' // User must select or we could guess based on product
          }))
        }}
        onSuccess={() => {
           updateStatusMutation.mutate('billed');
        }}
      />
    </>
  );
};

export default PurchaseOrderDetail;