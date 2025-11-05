import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Printer, Send, HandCoins, Ban } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { showError, showSuccess } from '../utils/toast';
import InvoicePaymentForm from '../components/InvoicePaymentForm';
import { useAuth } from '../contexts/AuthContext';
import SendInvoiceDialog from '../components/SendInvoiceDialog';
import { formatCurrency } from '../lib/utils';

type InvoiceDetailData = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'void';
  customers: {
    name: string;
    address: string | null;
    email: string | null;
  }[] | null;
  journal_entries: {
    journal_entry_items: {
      amount: number;
      type: 'debit' | 'credit';
      chart_of_accounts: {
        name: string;
      } | null;
    }[];
  }[] | null;
};

const InvoiceDetail = () => {
  const { id } = useParams();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);

  const fetchInvoiceDetail = async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        invoice_date,
        due_date,
        status,
        customers ( name, address, email ),
        journal_entries (
          journal_entry_items (
            amount,
            type,
            chart_of_accounts ( name )
          )
        )
      `)
      .eq('id', id!)
      .single();
    if (error) throw error;
    return data as InvoiceDetailData;
  };

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice_detail', id],
    queryFn: fetchInvoiceDetail,
    enabled: !!id,
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('void_invoice', { p_invoice_id: id! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice_detail', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showSuccess('Invoice voided successfully.');
    },
    onError: (error: any) => showError(error.message),
  });

  const lineItems = invoice?.journal_entries?.[0]?.journal_entry_items.filter(item => item.type === 'credit') || [];
  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!invoice) {
    return <div>Invoice not found.</div>;
  }

  return (
    <>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-background print:max-w-none print:p-8 print:mx-0 print:bg-white">
        <div className="flex justify-between items-start mb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-bold">Invoice {invoice.invoice_number}</h1>
            <Badge className="mt-2 capitalize">{invoice.status}</Badge>
          </div>
          <div className="flex gap-2">
            {invoice.status === 'draft' && (
              <Button onClick={() => setIsSendDialogOpen(true)}>
                <Send className="mr-2 h-4 w-4" /> Send Invoice
              </Button>
            )}
            {invoice.status === 'sent' && (
              <>
                <Button onClick={() => setIsPaymentFormOpen(true)}>
                  <HandCoins className="mr-2 h-4 w-4" /> Receive Payment
                </Button>
                <Button variant="destructive" onClick={() => voidMutation.mutate()} disabled={voidMutation.isPending}>
                  <Ban className="mr-2 h-4 w-4" /> Void
                </Button>
              </>
            )}
            <Button onClick={() => window.print()} variant="outline"><Printer className="mr-2 h-4 w-4" /> Print</Button>
          </div>
        </div>
        <Card className="print:shadow-none print:border-none">
          <CardHeader className="grid grid-cols-2 gap-4">
            <div>
              <CardTitle>{profile?.company_name || 'Your Company'}</CardTitle>
              <p className="text-sm text-muted-foreground">{profile?.company_address || 'Your Company Address'}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tracking-tight">INVOICE</p>
              <p className="text-sm text-muted-foreground"># {invoice.invoice_number}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <h3 className="font-semibold mb-1">Bill To:</h3>
                <p>{invoice.customers?.[0]?.name}</p>
                <p>{invoice.customers?.[0]?.address}</p>
                <p>{invoice.customers?.[0]?.email}</p>
              </div>
              <div className="text-right">
                <p><span className="font-semibold">Invoice Date:</span> {new Date(invoice.invoice_date).toLocaleDateString()}</p>
                <p><span className="font-semibold">Due Date:</span> {new Date(invoice.due_date).toLocaleDateString()}</p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.chart_of_accounts?.name || 'Service/Product'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="text-lg font-bold bg-gray-50 dark:bg-gray-800">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalAmount)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      </div>
      <SendInvoiceDialog
        isOpen={isSendDialogOpen}
        setIsOpen={setIsSendDialogOpen}
        invoice={{
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_email: invoice.customers?.[0]?.email || null,
        }}
      />
      <InvoicePaymentForm 
        isOpen={isPaymentFormOpen}
        setIsOpen={setIsPaymentFormOpen}
        invoice={{
          id: invoice.id,
          totalAmount: totalAmount,
          customerName: invoice.customers?.[0]?.name || 'Customer'
        }}
      />
    </>
  );
};

export default InvoiceDetail;