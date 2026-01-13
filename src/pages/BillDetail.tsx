import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Printer, HandCoins, Trash2, ArrowLeft, Paperclip, FileText } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { showError, showSuccess } from '../utils/toast';
import BillPaymentForm from '../components/BillPaymentForm';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';

const BillDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);

  const { data: bill, isLoading } = useQuery({
    queryKey: ['bill_detail', id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('bills', {
        body: { method: 'GET_ONE', company_id: activeCompany.id, billId: id },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!id && !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('bills', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          billId: id,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills', activeCompany?.id] });
      showSuccess('Bill deleted.');
      window.history.back();
    },
    onError: (error: any) => showError(error.message),
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!bill) {
    return <div>Bill not found.</div>;
  }

  // Filter items (Debit items are the expense lines)
  const lineItems = bill.journal_entries?.journal_entry_items?.filter((item: any) => item.type === 'debit' && !item.chart_of_accounts?.name.toLowerCase().includes('tax receivable')) || [];
  const taxItems = bill.journal_entries?.journal_entry_items?.filter((item: any) => item.type === 'debit' && item.chart_of_accounts?.name.toLowerCase().includes('tax receivable')) || [];
  const totalAmount = bill.journal_entries?.journal_entry_items?.filter((item: any) => item.type === 'credit')?.reduce((sum: number, item: any) => sum + item.amount, 0) || 0;
  
  const subtotal = lineItems.reduce((sum: number, item: any) => sum + item.amount, 0);
  const totalTax = taxItems.reduce((sum: number, item: any) => sum + item.amount, 0);

  const attachmentUrl = bill.journal_entries?.attachment_url;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 sm:p-6 bg-background">
      <div className="flex items-center gap-4 mb-4 print:hidden">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/bills"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                Bill {bill.bill_number}
                <Badge className="capitalize ml-2" variant={bill.status === 'paid' ? 'default' : 'secondary'}>{bill.status}</Badge>
            </h1>
        </div>
        <div className="flex gap-2">
            {bill.status !== 'paid' && (
              <Button onClick={() => setIsPaymentFormOpen(true)}>
                <HandCoins className="mr-2 h-4 w-4" /> Record Payment
              </Button>
            )}
            <Button onClick={() => window.print()} variant="outline"><Printer className="mr-2 h-4 w-4" /> Print</Button>
            <Button variant="destructive" size="icon" onClick={() => deleteMutation.mutate()}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="print:shadow-none">
            <CardHeader>
                <CardTitle className="text-lg">Vendor Details</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-1">
                    <p className="font-semibold text-lg">{bill.vendors?.name}</p>
                    <p className="text-muted-foreground">{bill.vendors?.address}</p>
                    <p className="text-muted-foreground">{bill.vendors?.email}</p>
                    <p className="text-muted-foreground">{bill.vendors?.phone}</p>
                </div>
            </CardContent>
        </Card>
        <Card className="print:shadow-none">
            <CardHeader>
                <CardTitle className="text-lg">Bill Details</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-muted-foreground">Bill Date</p>
                        <p className="font-medium">{format(new Date(bill.bill_date), 'PPP')}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Due Date</p>
                        <p className="font-medium">{format(new Date(bill.due_date), 'PPP')}</p>
                    </div>
                    {bill.journal_entries?.description && (
                        <div className="col-span-2">
                            <p className="text-sm text-muted-foreground">Memo</p>
                            <p className="font-medium">{bill.journal_entries.description}</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
      </div>

      <Card className="print:shadow-none">
        <CardContent className="p-0">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableRow className="bg-muted/50">
                            <TableHead className="pl-6">Account / Description</TableHead>
                            <TableHead className="text-right pr-6">Amount</TableHead>
                        </TableRow>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {lineItems.map((item: any) => (
                        <TableRow key={item.id}>
                            <TableCell className="pl-6">
                                <div className="font-medium">{item.chart_of_accounts?.name}</div>
                            </TableCell>
                            <TableCell className="text-right pr-6 font-mono">
                                {formatCurrency(item.amount)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow>
                        <TableCell className="text-right font-medium">Subtotal</TableCell>
                        <TableCell className="text-right font-mono pr-6">{formatCurrency(subtotal)}</TableCell>
                    </TableRow>
                    {totalTax > 0 && (
                        <TableRow>
                            <TableCell className="text-right font-medium">Tax</TableCell>
                            <TableCell className="text-right font-mono pr-6">{formatCurrency(totalTax)}</TableCell>
                        </TableRow>
                    )}
                    <TableRow className="bg-muted/50 font-bold text-lg">
                        <TableCell className="text-right">Total</TableCell>
                        <TableCell className="text-right font-mono pr-6">{formatCurrency(totalAmount)}</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </CardContent>
      </Card>

      {attachmentUrl && (
        <Card className="print:hidden">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Paperclip className="h-5 w-5" /> Attachment</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-4 p-4 border rounded-md bg-muted/20">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <div className="flex-1">
                        <p className="font-medium">Bill Document</p>
                        <a href={attachmentUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                            View / Download
                        </a>
                    </div>
                </div>
            </CardContent>
        </Card>
      )}

      {bill.status !== 'paid' && (
        <BillPaymentForm 
            isOpen={isPaymentFormOpen} 
            setIsOpen={setIsPaymentFormOpen} 
            vendorId={bill.vendor_id}
            vendorName={bill.vendors?.name || 'Vendor'}
            amountDue={totalAmount}
            billId={bill.id}
        />
      )}
    </div>
  );
};

export default BillDetail;