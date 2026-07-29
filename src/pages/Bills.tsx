import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { PlusCircle, MoreHorizontal, Search, X, Paperclip, Receipt } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSortableData } from '../hooks/useSortableData';
import { SortableHeader } from '../components/SortableHeader';
import { Skeleton } from '../components/ui/skeleton';
import BillForm from '../components/BillForm';
import JournalEntryDetail from '../components/JournalEntryDetail';
import JournalEntryForm from '../components/JournalEntryForm';
import BillPaymentForm from '../components/BillPaymentForm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { showError, showSuccess } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, statusBadgeVariant } from '../lib/utils';
import { billsQuery, vendorsQuery } from '../lib/queries';
import { Badge } from '../components/ui/badge';
import AccountingSetupBanner from '../components/accounting/AccountingSetupBanner';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Vendor } from './Vendors';

type BillEntry = {
  id: string;
  journal_entry_id?: string | null;
  entry_date: string;
  due_date?: string;
  description: string | null;
  status: string;
  vendor_id: string;
  vendors: { name: string }[] | null;
  total: number;
  bill_number: string | null;
  attachment_url: string | null;
};

const Bills = () => {
  useDocumentTitle('Bills');
  const [searchParams] = useSearchParams();
  const [isBillFormOpen, setIsBillFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [selectedEntryIdForDetail, setSelectedEntryIdForDetail] = useState<string | null>(null);
  const [selectedEntryIdForEdit, setSelectedEntryIdForEdit] = useState<string | undefined>(undefined);
  const [duplicateFromId, setDuplicateFromId] = useState<string | undefined>(undefined);
  
  // Payment State
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<BillEntry | null>(null);

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const vendorId = searchParams.get('vendor_id');
    const status = searchParams.get('status');
    const overdue = searchParams.get('overdue');
    if (vendorId) setVendorFilter(vendorId);
    if (status) setStatusFilter(status);
    if (overdue === 'true') {
      setOverdueOnly(true);
      setStatusFilter('open');
    }
  }, [searchParams]);

  const { data: bills, isLoading } = useQuery<BillEntry[]>({
    ...billsQuery(activeCompany!.id, {
      search: searchTerm,
      status: statusFilter,
      vendor_id: vendorFilter,
      date_from: dateFrom || null,
      date_to: dateTo || null,
    }),
    enabled: !!activeCompany,
  });

  const { items: sortedBills, sort, requestSort } = useSortableData(bills ?? [], (b, key) => {
    switch (key) {
      case 'entry_date': return new Date(b.entry_date).getTime();
      case 'due_date': return b.due_date ? new Date(b.due_date).getTime() : 0;
      case 'vendor': return b.vendors?.[0]?.name ?? '';
      case 'total': return b.total ?? 0;
      default: return (b as unknown as Record<string, string>)[key];
    }
  });

  const displayedBills = useMemo(() => {
    if (!overdueOnly) return sortedBills;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return sortedBills.filter(
      (bill) => bill.due_date && new Date(bill.due_date) < today && bill.status === 'open'
    );
  }, [sortedBills, overdueOnly]);

  const { data: vendors } = useQuery<Vendor[]>({
    ...vendorsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('bills', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          billId: id,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills', activeCompany?.id] });
      showSuccess('Bill deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting bill: ${error.message}`);
    },
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('bills', {
        body: {
          method: 'VOID',
          company_id: activeCompany.id,
          billId: id,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills', activeCompany?.id] });
      showSuccess('Bill voided.');
    },
    onError: (error) => showError(`Error voiding bill: ${error.message}`),
  });

  const handleEdit = (id: string) => {
    // Note: Full editing of bills created via JE is limited. We typically only allow editing non-financials
    // or deleting/re-creating. For now, we open the JE edit form which allows full control but is technical.
    setSelectedEntryIdForEdit(id);
    setIsEditFormOpen(true);
  };

  const handleDuplicate = (id: string) => {
    setDuplicateFromId(id);
    setIsBillFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this bill? This action cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  const handlePay = (bill: BillEntry) => {
    setSelectedBillForPayment(bill);
    setIsPaymentFormOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setVendorFilter('all');
    setDateFrom('');
    setDateTo('');
  };


  return (
    <>
      <AccountingSetupBanner actionLabel="Recording a supplier bill" />
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Bills</CardTitle>
              <CardDescription>A record of all bills received from vendors.</CardDescription>
            </div>
            <Button onClick={() => { setDuplicateFromId(undefined); setIsBillFormOpen(true); }}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Record New Bill
            </Button>
          </div>

          <div className="flex flex-wrap gap-4 pt-4">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search Bill #"
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
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {vendors?.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
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
            {(searchTerm || statusFilter !== 'all' || vendorFilter !== 'all' || dateFrom || dateTo) && (
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
                <SortableHeader sortKey="entry_date" sort={sort} onSort={requestSort}>Date</SortableHeader>
                <SortableHeader sortKey="vendor" sort={sort} onSort={requestSort}>Vendor</SortableHeader>
                <SortableHeader sortKey="bill_number" sort={sort} onSort={requestSort}>Bill #</SortableHeader>
                <SortableHeader sortKey="description" sort={sort} onSort={requestSort}>Description</SortableHeader>
                <SortableHeader sortKey="total" sort={sort} onSort={requestSort} align="right">Amount</SortableHeader>
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
              ) : displayedBills.length > 0 ? (
                displayedBills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell>{new Date(bill.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>{bill.vendors?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell>{bill.bill_number || '-'}</TableCell>
                    <TableCell className="max-w-[200px]">
                        <div className="flex items-center gap-2 truncate">
                            {bill.description}
                            {bill.attachment_url && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                        </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(bill.total)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(bill.status)} className="capitalize">{bill.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => bill.journal_entry_id && setSelectedEntryIdForDetail(bill.journal_entry_id)}
                            disabled={!bill.journal_entry_id}
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(bill.id)}>Duplicate</DropdownMenuItem>
                          {bill.attachment_url && (
                             <DropdownMenuItem asChild>
                                 <a href={bill.attachment_url} target="_blank" rel="noopener noreferrer">View Attachment</a>
                             </DropdownMenuItem>
                          )}
                          {bill.status !== 'paid' && bill.status !== 'void' && (
                            <>
                                <DropdownMenuItem onClick={() => handlePay(bill)}>Record Payment</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => voidMutation.mutate(bill.id)} className="text-red-600">Void</DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => handleDelete(bill.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    {(searchTerm || statusFilter !== 'all' || vendorFilter !== 'all' || dateFrom || dateTo) ? (
                      <EmptyState
                        icon={Search}
                        title="No bills match your filters"
                        description="Try adjusting or clearing your filters to see more results."
                        action={<Button variant="outline" onClick={clearFilters}><X className="mr-2 h-4 w-4" /> Clear filters</Button>}
                      />
                    ) : (
                      <EmptyState
                        icon={Receipt}
                        title="No bills yet"
                        description="Record a bill to track what you owe your vendors and stay on top of due dates."
                        action={<Button onClick={() => { setDuplicateFromId(undefined); setIsBillFormOpen(true); }}><PlusCircle className="mr-2 h-4 w-4" /> Record New Bill</Button>}
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <BillForm
        isOpen={isBillFormOpen}
        setIsOpen={setIsBillFormOpen}
        duplicateFromId={duplicateFromId}
      />
      <JournalEntryForm
        isOpen={isEditFormOpen}
        setIsOpen={setIsEditFormOpen}
        entryId={selectedEntryIdForEdit}
      />
      <JournalEntryDetail 
        entryId={selectedEntryIdForDetail} 
        isOpen={!!selectedEntryIdForDetail} 
        setIsOpen={() => setSelectedEntryIdForDetail(null)} 
      />
      {selectedBillForPayment && (
        <BillPaymentForm
          isOpen={isPaymentFormOpen}
          setIsOpen={setIsPaymentFormOpen}
          vendorId={selectedBillForPayment.vendor_id}
          vendorName={selectedBillForPayment.vendors?.[0]?.name || 'Vendor'}
          amountDue={selectedBillForPayment.total}
          billId={selectedBillForPayment.id}
        />
      )}
    </>
  );
};

export default Bills;