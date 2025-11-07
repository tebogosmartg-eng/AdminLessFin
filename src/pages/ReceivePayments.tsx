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
import ReceivePaymentForm from '../components/ReceivePaymentForm';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

type CustomerBalance = {
  customer_id: string;
  customer_name: string;
  balance: number;
};

type SelectedPayment = {
  customerId: string;
  customerName: string;
  amountDue: number;
};

const ReceivePayments = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<SelectedPayment | null>(null);
  const { activeCompany } = useAuth();

  const fetchCustomerBalances = async () => {
    if (!activeCompany) return [];
    const { data, error } = await supabase.functions.invoke('payments', {
      body: {
        method: 'GET_AR_BALANCES',
        company_id: activeCompany.id,
      },
    });
    if (error) throw new Error(error.message);
    return data;
  };

  const { data: customers, isLoading } = useQuery<CustomerBalance[]>({
    queryKey: ['customer_ar_balances', activeCompany?.id],
    queryFn: fetchCustomerBalances,
    enabled: !!activeCompany,
  });

  const handleReceivePayment = (customer: CustomerBalance) => {
    setSelectedPayment({
      customerId: customer.customer_id,
      customerName: customer.customer_name,
      amountDue: customer.balance,
    });
    setIsFormOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Receive Payments</CardTitle>
          <CardDescription>Record payments received from customers with outstanding balances.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount Due</TableHead>
                <TableHead className="w-[180px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">Loading outstanding invoices...</TableCell>
                </TableRow>
              ) : customers && customers.length > 0 ? (
                customers.map((customer) => (
                  <TableRow key={customer.customer_id}>
                    <TableCell className="font-medium">{customer.customer_name}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(customer.balance)}</TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => handleReceivePayment(customer)}>Receive Payment</Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">No outstanding customer payments. Good job!</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedPayment && (
        <ReceivePaymentForm
          isOpen={isFormOpen}
          setIsOpen={setIsFormOpen}
          customerId={selectedPayment.customerId}
          customerName={selectedPayment.customerName}
          amountDue={selectedPayment.amountDue}
        />
      )}
    </>
  );
};

export default ReceivePayments;