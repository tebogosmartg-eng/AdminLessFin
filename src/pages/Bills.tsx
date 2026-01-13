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
import BillForm from '../components/BillForm';
import JournalEntryDetail from '../components/JournalEntryDetail';
import JournalEntryForm from '../components/JournalEntryForm';
import BillPaymentForm from '../components/BillPaymentForm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { showError, showSuccess } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { billsQuery } from '../lib/queries';
import { Badge } from '../components/ui/badge';

type BillEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  status: string;
  vendor_id: string;
  vendors: { name: string }[] | null;
  total: number;
};

const Bills = () => {
  const [isBillFormOpen, setIsBillFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [selectedEntryIdForDetail, setSelectedEntryIdForDetail] = useState<string | null>(null);
  const [selectedEntryIdForEdit, setSelectedEntryIdForEdit] = useState<string | undefined>(undefined);
  
  // Payment State
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<BillEntry | null>(null);

  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: bills, isLoading } = useQuery<BillEntry[]>({
    ...billsQuery(activeCompany?.id!),
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

  const handleEdit = (id: string) => {
    setSelectedEntryIdForEdit(id);
    setIsEditFormOpen(true);
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Bills</CardTitle>
              <CardDescription>A record of all bills received from vendors.</CardDescription>
            </div>
            <Button onClick={() => setIsBillFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Record New Bill
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Loading bills...</TableCell>
                </TableRow>
              ) : bills && bills.length > 0 ? (
                bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell>{new Date(bill.entry_date).toLocaleDateString()}</TableCell>
                    <TableCell>{bill.vendors?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell>{bill.description}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(bill.total)}</TableCell>
                    <TableCell>
                      <Badge variant={bill.status === 'paid' ? 'default' : 'outline'}>{bill.status}</Badge>
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
                          <DropdownMenuItem onClick={() => setSelectedEntryIdForDetail(bill.id)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(bill.id)} disabled={bill.status === 'paid'}>Edit</DropdownMenuItem>
                          {bill.status !== 'paid' && (
                            <DropdownMenuItem onClick={() => handlePay(bill)}>Record Payment</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDelete(bill.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No bills recorded yet. Add one to get started.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <BillForm
        isOpen={isBillFormOpen}
        setIsOpen={setIsBillFormOpen}
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