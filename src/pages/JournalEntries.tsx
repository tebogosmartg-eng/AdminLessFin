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
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, Paperclip, Calendar as CalendarIcon, Download } from 'lucide-react';
import JournalEntryForm from '../components/JournalEntryForm';
import JournalEntryDetail from '../components/JournalEntryDetail';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { showError, showSuccess } from '../utils/toast';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { format, getYear } from 'date-fns';
import { cn, formatCurrency, downloadCSV } from '../lib/utils';
import { Account } from './ChartOfAccounts';
import { Vendor } from './Vendors';
import { Customer } from './Customers';
import { useAuth } from '../contexts/AuthContext';

type JournalEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  attachment_url: string | null;
  vendors: { name: string }[] | null;
  customers: { name: string }[] | null;
  journal_entry_items: {
    type: 'debit' | 'credit';
    amount: number;
  }[];
};

const JournalEntries = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEntryIdForDetail, setSelectedEntryIdForDetail] = useState<string | null>(null);
  const [selectedEntryIdForEdit, setSelectedEntryIdForEdit] = useState<string | undefined>(undefined);
  const [date, setDate] = useState<DateRange | undefined>({ from: undefined, to: undefined });
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    enabled: !!activeCompany,
  });

  const { data: vendors } = useQuery<Vendor[]>({
    queryKey: ['vendors', activeCompany?.id],
    enabled: !!activeCompany,
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['customers', activeCompany?.id],
    enabled: !!activeCompany,
  });

  const fetchJournalEntries = async () => {
    if (!activeCompany) return [];
    
    const { data, error } = await supabase.functions.invoke('journal-entries', {
      body: {
        method: 'GET',
        company_id: activeCompany.id,
        select: `
          id,
          entry_date,
          description,
          attachment_url,
          vendors ( name ),
          customers ( name ),
          journal_entry_items (
            type,
            amount
          )
        `,
        filters: {
          date_from: date?.from ? format(date.from, 'yyyy-MM-dd') : null,
          date_to: date?.to ? format(date.to, 'yyyy-MM-dd') : null,
          account_id: filterAccount,
          vendor_id: filterVendor,
          customer_id: filterCustomer,
        },
      },
    });

    if (error) throw new Error(error.message);
    return data;
  };

  const { data: entries, isLoading } = useQuery<JournalEntry[]>({
    queryKey: ['journal_entries', date, filterAccount, filterVendor, filterCustomer, activeCompany?.id],
    queryFn: fetchJournalEntries,
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('journal-entries', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
          entryId: id,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Journal entry deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting entry: ${error.message}`);
    },
  });

  const handleAddNew = () => {
    setSelectedEntryIdForEdit(undefined);
    setIsFormOpen(true);
  };

  const handleEdit = (id: string) => {
    setSelectedEntryIdForEdit(id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this journal entry? This action cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  const calculateTotal = (items: JournalEntry['journal_entry_items']) => {
    return items
      .filter(item => item.type === 'debit')
      .reduce((sum, item) => sum + item.amount, 0);
  };

  const handleExport = () => {
    if (!entries) return;
    const data = entries.map(e => ({
      Date: new Date(e.entry_date).toLocaleDateString(),
      Description: e.description,
      Vendor: e.vendors?.[0]?.name || '',
      Customer: e.customers?.[0]?.name || '',
      Amount: calculateTotal(e.journal_entry_items).toFixed(2),
    }));
    downloadCSV(data, `journal-entries-${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <CardTitle>Journal Entries</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExport} disabled={!entries || entries.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
              <Button onClick={handleAddNew}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Journal Entry
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-4 border-t -mx-6 px-6">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  className={cn("w-[260px] justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date?.from ? (
                    date.to ? (
                      <>
                        {format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(date.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Filter by date...</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={date?.from}
                  selected={date}
                  onSelect={setDate}
                  numberOfMonths={2}
                  captionLayout="dropdown-buttons"
                  fromYear={getYear(new Date()) - 10}
                  toYear={getYear(new Date()) + 5}
                />
              </PopoverContent>
            </Popover>
            <Select value={filterAccount} onValueChange={setFilterAccount}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterVendor} onValueChange={setFilterVendor}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCustomer} onValueChange={setFilterCustomer}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Loading entries...</TableCell>
                </TableRow>
              ) : entries && entries.length > 0 ? (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{new Date(entry.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {entry.description}
                      {entry.attachment_url && <Paperclip className="inline-block h-4 w-4 ml-2 text-gray-400" />}
                    </TableCell>
                    <TableCell>{entry.vendors?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell>{entry.customers?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(calculateTotal(entry.journal_entry_items))}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedEntryIdForDetail(entry.id)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(entry.id)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(entry.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No journal entries found for the selected period.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <JournalEntryForm 
        isOpen={isFormOpen} 
        setIsOpen={setIsFormOpen} 
        entryId={selectedEntryIdForEdit}
      />
      <JournalEntryDetail 
        entryId={selectedEntryIdForDetail} 
        isOpen={!!selectedEntryIdForDetail} 
        setIsOpen={() => setSelectedEntryIdForDetail(null)} 
      />
    </>
  );
};

export default JournalEntries;