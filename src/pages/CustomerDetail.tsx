import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Download, Printer, ArrowLeft, Mail, Phone, MapPin, Send } from 'lucide-react';
import { formatCurrency, downloadCSV } from '../lib/utils';
import { format, startOfYear, endOfYear } from 'date-fns';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import SendStatementDialog from '../components/SendStatementDialog';

type Transaction = {
  id: string;
  date: string;
  description: string;
  invoice_number?: string;
  type: 'invoice' | 'payment';
  amount: number;
};

const CustomerDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const [dateFrom, setDateFrom] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfYear(new Date()), 'yyyy-MM-dd'));
  const [isEmailOpen, setIsEmailOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customer_detail', id, activeCompany?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('customers', {
        body: {
          method: 'GET_DETAILS',
          company_id: activeCompany.id,
          customerId: id,
          date_from: dateFrom,
          date_to: dateTo,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!activeCompany,
  });

  const customer = data?.customer;
  const rawStatement = data?.statement || [];
  const openingBalance = data?.opening_balance || 0;

  // Calculate running balance starting from opening balance
  const statement = useMemo(() => {
    let balance = openingBalance;
    return rawStatement.map((t: Transaction) => {
      if (t.type === 'invoice') {
        balance += t.amount;
      } else {
        balance -= t.amount;
      }
      return { ...t, balance };
    });
  }, [rawStatement, openingBalance]);

  const currentBalance = statement.length > 0 ? statement[statement.length - 1].balance : openingBalance;
  
  // Totals for this period
  const totalInvoiced = statement.filter(t => t.type === 'invoice').reduce((sum, t) => sum + t.amount, 0);
  const totalPaid = statement.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0);

  const handleDownloadCSV = () => {
    const csvData = [
      { Date: dateFrom, Description: 'Opening Balance', Reference: '', Type: '', Amount: '', Balance: openingBalance.toFixed(2) },
      ...statement.map(t => ({
        Date: new Date(t.date).toLocaleDateString(),
        Description: t.description,
        Reference: t.invoice_number || '-',
        Type: t.type === 'invoice' ? 'Invoice' : 'Payment',
        Amount: (t.type === 'payment' ? -t.amount : t.amount).toFixed(2),
        Balance: t.balance.toFixed(2),
      }))
    ];
    downloadCSV(csvData, `Statement_${customer?.name}_${dateFrom}_${dateTo}.csv`);
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!customer) {
    return <div>Customer not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4 print:hidden">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/customers"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Customer Details</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 print:shadow-none print:border-none">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-3xl">{customer.name}</CardTitle>
                <CardDescription className="mt-2 flex flex-col gap-1">
                  {customer.contact_name && <span>Attn: {customer.contact_name}</span>}
                  {customer.email && <span className="flex items-center gap-2"><Mail className="h-3 w-3" /> {customer.email}</span>}
                  {customer.phone && <span className="flex items-center gap-2"><Phone className="h-3 w-3" /> {customer.phone}</span>}
                  {customer.address && <span className="flex items-center gap-2"><MapPin className="h-3 w-3" /> {customer.address}</span>}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Outstanding Balance</div>
                <div className={`text-3xl font-bold ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(currentBalance)}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Period Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Opening Balance</span>
              <span className="font-semibold">{formatCurrency(openingBalance)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Invoiced</span>
              <span className="font-semibold">{formatCurrency(totalInvoiced)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Paid</span>
              <span className="font-semibold text-green-600">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="pt-4 border-t flex justify-center">
               <Button asChild className="w-full">
                 <Link to={`/invoices?customer_id=${customer.id}`}>View All Invoices</Link>
               </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="print:shadow-none print:border-none">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <CardTitle>Statement of Account</CardTitle>
              <CardDescription className="print:hidden">Transaction history from {format(new Date(dateFrom), 'PPP')} to {format(new Date(dateTo), 'PPP')}</CardDescription>
              <CardDescription className="hidden print:block">Statement Period: {format(new Date(dateFrom), 'PPP')} - {format(new Date(dateTo), 'PPP')}</CardDescription>
            </div>
            <div className="flex gap-2 items-center print:hidden">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
              <span>to</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
              <Button variant="outline" onClick={() => setIsEmailOpen(true)} title="Email Statement">
                <Send className="mr-2 h-4 w-4" /> Email
              </Button>
              <Button variant="outline" size="icon" onClick={handleDownloadCSV} title="Download CSV">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => window.print()} title="Print Statement">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/30">
                <TableCell colSpan={4} className="font-medium italic">Opening Balance</TableCell>
                <TableCell className="text-right font-mono font-medium">{formatCurrency(openingBalance)}</TableCell>
              </TableRow>
              {statement.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No transactions found for this period.
                  </TableCell>
                </TableRow>
              ) : (
                statement.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{format(new Date(t.date), 'MM/dd/yyyy')}</TableCell>
                    <TableCell>{t.description}</TableCell>
                    <TableCell>
                      {t.invoice_number ? (
                        <Link to={`/invoices/${t.invoice_number}`} className="underline decoration-dotted print:no-underline">
                          {t.invoice_number}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${t.type === 'payment' ? 'text-green-600' : ''}`}>
                      {t.type === 'payment' ? '-' : ''}{formatCurrency(t.amount)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(t.balance)}
                    </TableCell>
                  </TableRow>
                ))
              )}
              <TableRow className="font-bold bg-muted/50">
                <TableCell colSpan={4} className="text-right">Closing Balance</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(currentBalance)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {customer && (
        <SendStatementDialog
          isOpen={isEmailOpen}
          setIsOpen={setIsEmailOpen}
          entity={{ id: customer.id, name: customer.name, email: customer.email }}
          type="customer"
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}
    </div>
  );
};

export default CustomerDetail;