import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Printer, Send, Check, X, FileSignature } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { showError, showSuccess } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';

const QuoteDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote_detail', id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('quotes', {
        body: { method: 'GET_ONE', company_id: activeCompany.id, quoteId: id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!activeCompany,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('quotes', {
        body: { method: 'PUT', company_id: activeCompany.id, quoteId: id, quoteData: { status } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote_detail', id] });
      queryClient.invalidateQueries({ queryKey: ['quotes', activeCompany?.id] });
      showSuccess('Quote status updated.');
    },
    onError: (error: any) => showError(error.message),
  });

  const lineItems = quote?.quote_items || [];
  const totalAmount = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!quote) {
    return <div>Quote not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-background print:max-w-none print:p-8 print:mx-0 print:bg-white">
      <div className="flex justify-between items-start mb-6 print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Quote {quote.quote_number}</h1>
          <Badge className="mt-2 capitalize">{quote.status}</Badge>
        </div>
        <div className="flex gap-2">
          {quote.status === 'draft' && (
            <Button onClick={() => updateStatusMutation.mutate('sent')}><Send className="mr-2 h-4 w-4" /> Mark as Sent</Button>
          )}
          {quote.status === 'sent' && (
            <>
              <Button onClick={() => updateStatusMutation.mutate('accepted')}><Check className="mr-2 h-4 w-4" /> Mark as Accepted</Button>
              <Button variant="destructive" onClick={() => updateStatusMutation.mutate('declined')}><X className="mr-2 h-4 w-4" /> Mark as Declined</Button>
            </>
          )}
          {quote.status === 'accepted' && (
            <Button disabled><FileSignature className="mr-2 h-4 w-4" /> Convert to Invoice</Button>
          )}
          <Button onClick={() => window.print()} variant="outline"><Printer className="mr-2 h-4 w-4" /> Print</Button>
        </div>
      </div>
      <Card className="print:shadow-none print:border-none">
        <CardHeader className="grid grid-cols-2 gap-4">
          <div>
            <img src="/logo.png" alt="SmaAcc Logo" className="h-12 w-auto mb-2" />
            <CardTitle className="text-base">{activeCompany?.name || 'Your Company'}</CardTitle>
            <p className="text-sm text-muted-foreground">{activeCompany?.address || 'Your Company Address'}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tracking-tight">QUOTE</p>
            <p className="text-sm text-muted-foreground"># {quote.quote_number}</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div>
              <h3 className="font-semibold mb-1">To:</h3>
              <p>{quote.customers?.name}</p>
              <p>{quote.customers?.address}</p>
              <p>{quote.customers?.email}</p>
            </div>
            <div className="text-right">
              <p><span className="font-semibold">Quote Date:</span> {new Date(quote.quote_date).toLocaleDateString()}</p>
              <p><span className="font-semibold">Expiry Date:</span> {quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.quantity * item.unit_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="text-lg font-bold bg-muted/50">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalAmount)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuoteDetail;