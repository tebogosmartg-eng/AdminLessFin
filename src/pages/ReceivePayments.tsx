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
import { customerBalancesQuery } from '../lib/queries';

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
  const companyId = activeCompany?.id;

  const { data: customers, isLoading } = useQuery<CustomerBalance[]>({
    ...customerBalancesQuery(companyId ?? ''),
    enabled: !!companyId,
  });

  const handleReceivePayment = (customer: CustomerBalance) => {
    setSelectedPayment({
      customerId: customer.customer_id,
      customerName: customer.customer_name,
      // A customer in credit owes nothing, so there is nothing to pre-fill.
      // Passing their negative balance straight through put a negative into the
      // amount box, which the form then refused to save.
      amountDue: Math.max(Number(customer.balance) || 0, 0),
    });
    setIsFormOpen(true);
  };

  // The screen says "customers with outstanding balances", so it should show
  // those. Customers who are square, or in credit, are reported separately
  // rather than listed as though they owed money.
  const owing = (customers ?? []).filter((c) => Number(c.balance) > 0.005);
  const inCredit = (customers ?? []).filter((c) => Number(c.balance) < -0.005);

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
              ) : owing.length > 0 ? (
                owing.map((customer) => (
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

          {inCredit.length > 0 && (
            <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">In credit</p>
              <p className="mb-2 text-muted-foreground">
                These customers have paid more than they have been invoiced. The credit sits on their
                account until it is applied to an invoice.
              </p>
              <ul className="space-y-1">
                {inCredit.map((c) => (
                  <li key={c.customer_id} className="flex justify-between gap-4">
                    <span>{c.customer_name}</span>
                    <span className="font-mono">{formatCurrency(Math.abs(Number(c.balance)))} credit</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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