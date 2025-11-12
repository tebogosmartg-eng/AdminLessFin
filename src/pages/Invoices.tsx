import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { showError, showSuccess } from '../utils/toast';
import { Badge } from '../components/ui/badge';
import { useNavigate } from 'react-router-dom';
import InvoiceForm from '../components/InvoiceForm';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { invoicesQuery } from '../lib/queries';

export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'void';
  customers: { name: string } | null;
  journal_entries: {
    journal_entry_items: {
      type: 'debit' | 'credit';
      amount: number;
    }[];
  } | null;
};

const Invoices = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    ...invoicesQuery(activeCompany?.id!),
    enabled: !!activeCompany,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('invoices', {
        body: {
          method: 'PUT',
          company_id: activeCompany.id,
          invoiceId: id,
          invoiceData: { status },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', activeCompany?.id] });
      showSuccess('Invoice status updated.');
    },
    onError: (error: any) => showError(error.message),
  });

  const handleEdit = (id: string) => {
    setSelectedInvoiceId(id);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedInvoiceId(undefined);
    setIsFormOpen(true);
  };

  const getTotal = (invoice: Invoice) => {
    return invoice.journal_entries?.[0]?.journal_entry_items
      .filter(item => item.type === 'debit')
      .reduce((sum, item) => sum + item.amount, 0) || 0;
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'paid': return 'default';
      case 'sent': return 'secondary';
      case 'draft': return 'outline';
      case 'void': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Create and manage invoices for your customers.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Invoice
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center">Loading invoices...</TableCell></TableRow>
              ) : invoices && invoices.length > 0 ? (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.customers?.name || 'N/A'}</TableCell>
                    <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(invoice.due_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(getTotal(invoice))}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(invoice.status)} className="capitalize">{invoice.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/invoices/${invoice.id}`)}>View</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(invoice.id)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: invoice.id, status: 'sent' })}>Mark as Sent</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: invoice.id, status: 'paid' })}>Mark as Paid</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: invoice.id, status: 'void' })} className="text-red-600">Void</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={7} className="text-center">No invoices found. Create one to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <InvoiceForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        invoiceId={selectedInvoiceId}
      />
    </>
  );
};

export default Invoices;