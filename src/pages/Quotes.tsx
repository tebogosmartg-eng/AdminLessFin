import { useState, useMemo } from 'react';
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
import { PlusCircle, MoreHorizontal, Quote as QuoteIcon, Search } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSortableData } from '../hooks/useSortableData';
import { SortableHeader } from '../components/SortableHeader';
import { Skeleton } from '../components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { showError, showSuccess } from '../utils/toast';
import { Badge } from '../components/ui/badge';
import { useNavigate } from 'react-router-dom';
import QuoteForm from '../components/QuoteForm';
import { formatCurrency, statusBadgeVariant } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { quotesQuery } from '../lib/queries';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export type Quote = {
  id: string;
  quote_number: string;
  quote_date: string;
  expiry_date: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  customers: { name: string } | null;
  quote_items?: {
    quantity: number;
    unit_price: number;
  }[] | null;
};

const Quotes = () => {
  useDocumentTitle('Quotes');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | undefined>(undefined);
  const [duplicateFromId, setDuplicateFromId] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: quotes, isLoading } = useQuery<Quote[]>({
    ...quotesQuery(activeCompany!.id),
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
    setDuplicateFromId(undefined);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedQuoteId(undefined);
    setDuplicateFromId(undefined);
    setIsFormOpen(true);
  };

  const handleDuplicate = (id: string) => {
    setSelectedQuoteId(undefined);
    setDuplicateFromId(id);
    setIsFormOpen(true);
  };

  const getTotal = (quote: Quote) => {
    return (quote.quote_items ?? []).reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const { items: sortedQuotes, sort, requestSort } = useSortableData(quotes ?? [], (q, key) => {
    switch (key) {
      case 'customer': return q.customers?.name ?? '';
      case 'quote_date': return new Date(q.quote_date).getTime();
      case 'expiry_date': return q.expiry_date ? new Date(q.expiry_date).getTime() : null;
      case 'amount': return getTotal(q);
      default: return (q as unknown as Record<string, string>)[key];
    }
  });

  const filteredQuotes = useMemo(() => {
    return sortedQuotes.filter((quote) => {
      const matchesSearch =
        !searchTerm ||
        quote.quote_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sortedQuotes, searchTerm, statusFilter]);


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
          <div className="flex flex-wrap gap-4 pt-4">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search quotes..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader sortKey="quote_number" sort={sort} onSort={requestSort}>Number</SortableHeader>
                <SortableHeader sortKey="customer" sort={sort} onSort={requestSort}>Customer</SortableHeader>
                <SortableHeader sortKey="quote_date" sort={sort} onSort={requestSort}>Date</SortableHeader>
                <SortableHeader sortKey="expiry_date" sort={sort} onSort={requestSort}>Expiry Date</SortableHeader>
                <SortableHeader sortKey="amount" sort={sort} onSort={requestSort} align="right">Amount</SortableHeader>
                <SortableHeader sortKey="status" sort={sort} onSort={requestSort}>Status</SortableHeader>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : quotes && quotes.length > 0 ? (
                filteredQuotes.length > 0 ? (
                filteredQuotes.map((quote) => (
                  <TableRow key={quote.id} className="cursor-pointer" onClick={() => navigate(`/quotes/${quote.id}`)}>
                    <TableCell className="font-medium">{quote.quote_number}</TableCell>
                    <TableCell>{quote.customers?.name || 'N/A'}</TableCell>
                    <TableCell>{new Date(quote.quote_date).toLocaleDateString()}</TableCell>
                    <TableCell>{quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(getTotal(quote))}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(quote.status)} className="capitalize">{quote.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/quotes/${quote.id}`)}>View</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(quote.id); }}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(quote.id); }}>Duplicate</DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(quote.id); }} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
                ) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={QuoteIcon}
                      title="No quotes match your filters"
                      description="Try adjusting your search or status filter."
                    />
                  </TableCell>
                </TableRow>
                )
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={QuoteIcon}
                      title="No quotes yet"
                      description="Send a professional quote to win new work. Accepted quotes convert to invoices in one click."
                      action={<Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" /> New Quote</Button>}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <QuoteForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        quoteId={selectedQuoteId}
        duplicateFromId={duplicateFromId}
      />
    </>
  );
};

export default Quotes;