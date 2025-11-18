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
import QuoteForm from '../components/QuoteForm';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { quotesQuery } from '../lib/queries';

export type Quote = {
  id: string;
  quote_number: string;
  quote_date: string;
  expiry_date: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  customers: { name: string } | null;
  quote_items: {
    quantity: number;
    unit_price: number;
  }[];
};

const Quotes = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: quotes, isLoading } = useQuery<Quote[]>({
    ...quotesQuery(activeCompany?.id!),
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('quotes', {
        body: { method: 'DELETE', company_id: activeCompany.id, quoteId: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', activeCompany?.id] });
      showSuccess('Quote deleted successfully.');
    },
    onError: (error: any) => showError(error.message),
  });

  const handleEdit = (id: string) => {
    setSelectedQuoteId(id);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedQuoteId(undefined);
    setIsFormOpen(true);
  };

  const getTotal = (quote: Quote) => {
    return quote.quote_items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'accepted': return 'default';
      case 'sent': return 'secondary';
      case 'draft': return 'outline';
      case 'declined': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Quotes</CardTitle>
              <CardDescription>Create and manage quotes for your customers.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Quote
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
                <TableHead>Expiry Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center">Loading quotes...</TableCell></TableRow>
              ) : quotes && quotes.length > 0 ? (
                quotes.map((quote) => (
                  <TableRow key={quote.id} className="cursor-pointer" onClick={() => navigate(`/quotes/${quote.id}`)}>
                    <TableCell className="font-medium">{quote.quote_number}</TableCell>
                    <TableCell>{quote.customers?.name || 'N/A'}</TableCell>
                    <TableCell>{new Date(quote.quote_date).toLocaleDateString()}</TableCell>
                    <TableCell>{quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(getTotal(quote))}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(quote.status)} className="capitalize">{quote.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/quotes/${quote.id}`)}>View</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(quote.id); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(quote.id); }} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={7} className="text-center">No quotes found. Create one to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <QuoteForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        quoteId={selectedQuoteId}
      />
    </>
  );
};

export default Quotes;