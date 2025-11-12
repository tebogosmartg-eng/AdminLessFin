import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import BillPaymentForm from '../components/BillPaymentForm';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { vendorBalancesQuery } from '../lib/queries';

type VendorBalance = {
  vendor_id: string;
  vendor_name: string;
  balance: number;
};

type SelectedPayment = {
  vendorId: string;
  vendorName: string;
  amountDue: number;
};

const PayBills = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<SelectedPayment | null>(null);
  const { activeCompany } = useAuth();

  const { data: vendors, isLoading } = useQuery<VendorBalance[]>({
    ...vendorBalancesQuery(activeCompany?.id!),
    enabled: !!activeCompany,
  });

  const handleRecordPayment = (vendor: VendorBalance) => {
    setSelectedPayment({
      vendorId: vendor.vendor_id,
      vendorName: vendor.vendor_name,
      amountDue: vendor.balance,
    });
    setIsFormOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pay Bills</CardTitle>
          <CardDescription>Record payments for outstanding bills from vendors.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount Due</TableHead>
                <TableHead className="w-[150px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">Loading outstanding bills...</TableCell>
                </TableRow>
              ) : vendors && vendors.length > 0 ? (
                vendors.map((vendor) => (
                  <TableRow key={vendor.vendor_id}>
                    <TableCell className="font-medium">{vendor.vendor_name}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(vendor.balance)}</TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => handleRecordPayment(vendor)}>Record Payment</Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">No outstanding bills to pay. Good job!</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedPayment && (
        <BillPaymentForm
          isOpen={isFormOpen}
          setIsOpen={setIsFormOpen}
          vendorId={selectedPayment.vendorId}
          vendorName={selectedPayment.vendorName}
          amountDue={selectedPayment.amountDue}
        />
      )}
    </>
  );
};

export default PayBills;