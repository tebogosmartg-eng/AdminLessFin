import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
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
import JournalEntryDetail from '../components/JournalEntryDetail';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';

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
  } | null;
  journal_entries: {
    journal_entry_items: {
      id: string;
      amount: number;
      type: 'debit' | 'credit';
      chart_of_accounts: {
        name: string;
      } | null;
      journal_entry_item_tax_rates: {
        tax_rates: {
          rate: number;
        } | null;
      }[];
    }[];
  }[] | null;
};

const InvoiceDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const fetchInvoiceDetail = async () => {
    if (!activeCompany) return null;
    const { data, error } = await supabase.functions.invoke('invoices', {
      body: {
        method: 'GET_ONE',
        company_id: activeCompany.id,
        invoiceId: id,
      },
    });
    if (error) throw new Error(error.message);
    return data as InvoiceDetailData;
  };

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice_detail', id],
    queryFn: fetchInvoiceDetail,
    enabled: !!id && !!activeCompany,
  });

  const { data: relatedEntries, isLoading: isLoadingRelatedEntries } = useQuery({
    queryKey: ['related_journal_entries', id, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany || !id) return [];
      const { data, error } = await supabase.functions.invoke('journal-entries', {
        body: {
          method: 'GET_RELATED_TO_INVOICE',
          company_id: activeCompany.id,
          invoiceId: id,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!activeCompany,
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('invoices', {
        body: {
          method: 'VOID',
          company_id: activeCompany.id,
          invoiceId: id,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice_detail', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showSuccess('Invoice voided successfully.');
    },
    onError: (error: any) => showError(error.message),
  });

  const lineItems = invoice?.journal_entries?.[0]?.journal_entry_items.filter(item => item.type === 'credit' && !item.chart_of_accounts?.name.toLowerCase().includes('tax')) || [];
  const taxItems = invoice?.journal_entries?.[0]?.journal_entry_items.filter(item => item.type === 'credit' && item.chart_of_accounts?.name.toLowerCase().includes('tax')) || [];
  const totalAmount = invoice?.journal_entries?.[0]?.journal_entry_items.filter(item => item.type === 'debit').reduce((sum, item) => sum + item.amount, 0) || 0;
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalTax = taxItems.reduce((sum, item) => sum + item.amount, 0);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!invoice) {
    return <div>Invoice not found.</div>;
  }

  return (
    <>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-background print:max-w-none print:p-8 print:mx-0 print:bg-white">
        {invoice.status === 'void' && (
          <Alert variant="destructive" className="mb-6 print:hidden">
            <Ban className="h-4 w-4" />
            <AlertTitle>Voided</AlertTitle>
            <AlertDescription>
              This invoice has been voided. All associated financial transactions have been reversed.
            </AlertDescription>
          </Alert>
        )}
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
        <Card className={`print:shadow-none print:border-none ${invoice.status === 'void' ? 'opacity-50' : ''}`}>
          <CardHeader className="grid grid-cols-2 gap-4">
            <div>
              <img src="/logo.png" alt="SmaAcc Logo" className="h-12 w-auto mb-2" />
              <CardTitle className="text-base">{activeCompany?.name || 'Your Company'}</CardTitle>
              <p className="text-sm text-muted-foreground">{activeCompany?.address || 'Your Company Address'}</p>
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
                <p>{invoice.customers?.name}</p>
                <p>{invoice.customers?.address}</p>
                <p>{invoice.customers?.email}</p>
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
                <TableRow>
                  <TableCell className="text-right">Subtotal</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(subtotal)}</TableCell>
                </TableRow>
                {totalTax > 0 && (
                  <TableRow>
                    <TableCell className="text-right">Tax</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(totalTax)}</TableCell>
                  </TableRow>
                )}
                <TableRow className="text-lg font-bold bg-gray-50 dark:bg-gray-800">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalAmount)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <Card className="mt-6 print:hidden">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>All journal entries related to this invoice.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRelatedEntries ? (
              <Skeleton className="h-24 w-full" />
            ) : relatedEntries && relatedEntries.length > 0 ? (
              <ul className="space-y-2">
                {relatedEntries.map((entry: any) => (
                  <li key={entry.id} className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(entry.entry_date).toLocaleDateString()}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedEntryId(entry.id)}>
                      View Details
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No related transactions found.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <SendInvoiceDialog
        isOpen={isSendDialogOpen}
        setIsOpen={setIsSendDialogOpen}
        invoice={{
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_email: invoice.customers?.email || null,
        }}
      />
      <InvoicePaymentForm 
        isOpen={isPaymentFormOpen}
        setIsOpen={setIsPaymentFormOpen}
        invoice={{
          id: invoice.id,
          totalAmount: totalAmount,
          customerName: invoice.customers?.name || 'Customer'
        }}
      />
      <JournalEntryDetail
        isOpen={!!selectedEntryId}
        setIsOpen={() => setSelectedEntryId(null)}
        entryId={selectedEntryId}
      />
    </>
  );
};

export default InvoiceDetail;