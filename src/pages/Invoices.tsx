import { useState, useEffect } from 'react';
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
import { PlusCircle, MoreHorizontal, Search, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { showError, showSuccess } from '../utils/toast';
import { Badge } from '../components/ui/badge';
import { useNavigate, useSearchParams } from 'react-router-dom';
import InvoiceForm from '../components/InvoiceForm';
import { formatCurrency, statusBadgeVariant } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { invoicesQuery, customersQuery } from '../lib/queries';
import { invoiceTotal } from '../lib/invoiceJournal';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Customer } from './Customers';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSortableData } from '../hooks/useSortableData';
import { SortableHeader } from '../components/SortableHeader';
import { FileSignature } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';

export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'void';
  customers: { name: string } | null;
  // The invoices→journal_entries embed is a to-one FK, so PostgREST returns a
  // single object. Array-tolerant here purely as a defensive contract.
  journal_entries:
    | { journal_entry_items: { type: 'debit' | 'credit'; amount: number }[] }
    | { journal_entry_items: { type: 'debit' | 'credit'; amount: number }[] }[]
    | null;
};

const Invoices = () => {
  useDocumentTitle('Invoices');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | undefined>(undefined);
  const [duplicateFromId, setDuplicateFromId] = useState<string | undefined>(undefined);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const status = searchParams.get('status');
    const customerId = searchParams.get('customer_id');
    if (status) setStatusFilter(status);
    if (customerId) setCustomerFilter(customerId);
  }, [searchParams]);

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    ...invoicesQuery(activeCompany!.id, {
      search: searchTerm,
      status: statusFilter,
      customer_id: customerFilter,
      date_from: dateFrom || null,
      date_to: dateTo || null,
    }),
    enabled: !!activeCompany,
  });

  const { data: customers } = useQuery<Customer[]>({
    ...customersQuery(activeCompany!.id),
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
    // OPTIMISTIC UPDATE
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['invoices', activeCompany?.id] });
      const previousInvoices = queryClient.getQueryData<Invoice[]>(['invoices', activeCompany?.id, { search: searchTerm, status: statusFilter, customer_id: customerFilter, date_from: dateFrom || null, date_to: dateTo || null }]);

      if (previousInvoices) {
        queryClient.setQueryData<Invoice[]>(
          ['invoices', activeCompany?.id, { search: searchTerm, status: statusFilter, customer_id: customerFilter, date_from: dateFrom || null, date_to: dateTo || null }],
          previousInvoices.map(inv => inv.id === id ? { ...inv, status: status as Invoice['status'] } : inv)
        );
      }
      return { previousInvoices };
    },
    onError: (err, variables, context) => {
      if (context?.previousInvoices) {
        queryClient.setQueryData(['invoices', activeCompany?.id, { search: searchTerm, status: statusFilter, customer_id: customerFilter, date_from: dateFrom || null, date_to: dateTo || null }], context.previousInvoices);
      }
      showError(err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', activeCompany?.id] });
    },
    onSuccess: () => {
      showSuccess('Invoice status updated.');
    },
  });

  const handleEdit = (id: string) => {
    setSelectedInvoiceId(id);
    setDuplicateFromId(undefined);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedInvoiceId(undefined);
    setDuplicateFromId(undefined);
    setIsFormOpen(true);
  };

  const handleDuplicate = (id: string) => {
    setSelectedInvoiceId(undefined);
    setDuplicateFromId(id);
    setIsFormOpen(true);
  };

  const getTotal = (invoice: Invoice) => invoiceTotal(invoice.journal_entries);

  const { items: sortedInvoices, sort, requestSort } = useSortableData(invoices ?? [], (inv, key) => {
    switch (key) {
      case 'customer': return inv.customers?.name ?? '';
      case 'invoice_date': return new Date(inv.invoice_date).getTime();
      case 'due_date': return new Date(inv.due_date).getTime();
      case 'amount': return getTotal(inv);
      default: return (inv as unknown as Record<string, string>)[key];
    }
  });

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCustomerFilter('all');
    setDateFrom('');
    setDateTo('');
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
          
          <div className="flex flex-wrap gap-4 pt-4">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search Invoice #"
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
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input 
              type="date" 
              className="w-[150px]" 
              value={dateFrom} 
              onChange={(e) => setDateFrom(e.target.value)} 
              placeholder="From Date"
            />
            <Input 
              type="date" 
              className="w-[150px]" 
              value={dateTo} 
              onChange={(e) => setDateTo(e.target.value)} 
              placeholder="To Date"
            />
            {(searchTerm || statusFilter !== 'all' || customerFilter !== 'all' || dateFrom || dateTo) && (
              <Button variant="ghost" onClick={clearFilters} className="px-2">
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader sortKey="invoice_number" sort={sort} onSort={requestSort}>Number</SortableHeader>
                <SortableHeader sortKey="customer" sort={sort} onSort={requestSort}>Customer</SortableHeader>
                <SortableHeader sortKey="invoice_date" sort={sort} onSort={requestSort}>Date</SortableHeader>
                <SortableHeader sortKey="due_date" sort={sort} onSort={requestSort}>Due Date</SortableHeader>
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
              ) : invoices && invoices.length > 0 ? (
                sortedInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${invoice.id}`)}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.customers?.name || 'N/A'}</TableCell>
                    <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(invoice.due_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(getTotal(invoice))}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(invoice.status)} className="capitalize">{invoice.status}</Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/invoices/${invoice.id}`)}>View</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(invoice.id)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(invoice.id)}>Duplicate</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: invoice.id, status: 'sent' })}>Mark as Sent</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: invoice.id, status: 'paid' })}>Mark as Paid</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: invoice.id, status: 'void' })} className="text-red-600">Void</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    {(searchTerm || statusFilter !== 'all' || customerFilter !== 'all' || dateFrom || dateTo) ? (
                      <EmptyState
                        icon={Search}
                        title="No invoices match your filters"
                        description="Try adjusting or clearing your filters to see more results."
                        action={<Button variant="outline" onClick={clearFilters}><X className="mr-2 h-4 w-4" /> Clear filters</Button>}
                      />
                    ) : (
                      <EmptyState
                        icon={FileSignature}
                        title="No invoices yet"
                        description="Create your first invoice to start getting paid. It only takes a moment."
                        action={<Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" /> New Invoice</Button>}
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <InvoiceForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        invoiceId={selectedInvoiceId}
        duplicateFromId={duplicateFromId}
      />
    </>
  );
};

export default Invoices;