import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { downloadSupplierStatementPdf } from '../lib/statements/supplierStatementPdf';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Download, FileText, Printer, ArrowLeft, Mail, Phone, MapPin, Send } from 'lucide-react';
import { formatCurrency, downloadCSV } from '../lib/utils';
import { format } from 'date-fns';
import SendStatementDialog from '../components/SendStatementDialog';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';

type Transaction = {
  id: string;
  date: string;
  description: string;
  bill_number?: string;
  type: 'bill' | 'payment';
  amount: number;
};

const VendorDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const { dateFrom, dateTo, isReady } = useReportingPeriod();
  const [isEmailOpen, setIsEmailOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor_detail', id, activeCompany?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!activeCompany || !dateFrom || !dateTo) return null;
      const { data, error } = await supabase.functions.invoke('vendors', {
        body: {
          method: 'GET_DETAILS',
          company_id: activeCompany.id,
          vendorId: id,
          date_from: dateFrom,
          date_to: dateTo,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!activeCompany && isReady,
  });

  const vendor = data?.vendor;
  const rawStatement = data?.statement || [];
  const openingBalance = data?.opening_balance || 0;

  // Calculate running balance
  const statement = useMemo(() => {
    let balance = openingBalance;
    return rawStatement.map((t: Transaction) => {
      if (t.type === 'bill') {
        balance += t.amount;
      } else {
        balance -= t.amount;
      }
      return { ...t, balance };
    });
  }, [rawStatement, openingBalance]);

  const currentBalance = statement.length > 0 ? statement[statement.length - 1].balance : openingBalance;
  const totalBilled = statement.filter(t => t.type === 'bill').reduce((sum, t) => sum + t.amount, 0);
  const totalPaid = statement.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0);

  const ageing = data?.ageing ?? null;

  const handleDownloadPDF = () => {
    downloadSupplierStatementPdf({
      companyName: activeCompany?.name ?? 'Statement',
      companyAddress: (activeCompany as { address?: string } | null)?.address ?? null,
      vendorName: vendor?.name ?? 'Supplier',
      vendorAddress: vendor?.address ?? null,
      dateFrom,
      dateTo,
      openingBalance,
      closingBalance: currentBalance,
      totalBilled,
      totalPaid,
      lines: statement,
      ageing,
    });
  };

  const handleDownloadCSV = () => {
    const csvData = [
      { Date: dateFrom, Description: 'Opening Balance', Reference: '', Type: '', Amount: '', Balance: openingBalance.toFixed(2) },
      ...statement.map(t => ({
        Date: new Date(t.date).toLocaleDateString(),
        Description: t.description,
        Reference: t.bill_number || '-',
        Type: t.type === 'bill' ? 'Bill' : 'Payment',
        Amount: (t.type === 'payment' ? -t.amount : t.amount).toFixed(2),
        Balance: t.balance.toFixed(2),
      }))
    ];
    downloadCSV(csvData, `Statement_${vendor?.name}_${dateFrom}_${dateTo}.csv`);
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!vendor) {
    return <div>Vendor not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4 print:hidden">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/vendors"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">Vendor Details</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 print:shadow-none print:border-none">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-3xl">{vendor.name}</CardTitle>
                <CardDescription className="mt-2 flex flex-col gap-1">
                  {vendor.contact_name && <span>Attn: {vendor.contact_name}</span>}
                  {vendor.email && <span className="flex items-center gap-2"><Mail className="h-3 w-3" /> {vendor.email}</span>}
                  {vendor.phone && <span className="flex items-center gap-2"><Phone className="h-3 w-3" /> {vendor.phone}</span>}
                  {vendor.address && <span className="flex items-center gap-2"><MapPin className="h-3 w-3" /> {vendor.address}</span>}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Balance Due</div>
                <div className={`text-3xl font-bold ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(currentBalance)}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {ageing && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Age Analysis</CardTitle>
              <CardDescription>
                Outstanding bills by days past their due date, as at{' '}
                {ageing.as_of ? format(new Date(ageing.as_of), 'PPP') : '—'}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                {([
                  ['Current', ageing.current],
                  ['1-30 days', ageing.days_1_30],
                  ['31-60 days', ageing.days_31_60],
                  ['61-90 days', ageing.days_61_90],
                  ['90+ days', ageing.days_120_plus],
                ] as Array<[string, number]>).map(([label, value]) => (
                  <div key={label} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-semibold">{formatCurrency(value ?? 0)}</div>
                  </div>
                ))}
                <div className="rounded-md border p-3 bg-muted/40">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="font-semibold">{formatCurrency(ageing.total ?? 0)}</div>
                </div>
              </div>
              {Math.abs(Number(ageing.unallocated ?? 0)) >= 0.01 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  The age analysis covers open bills ({formatCurrency(ageing.total ?? 0)}). The supplier
                  control account balance is {formatCurrency(ageing.ap_control_balance ?? 0)}; the
                  difference of {formatCurrency(ageing.unallocated ?? 0)} is payments on account, credit
                  notes, or journals not allocated to a specific bill.
                </p>
              )}
            </CardContent>
          </Card>
        )}

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
              <span className="text-sm text-muted-foreground">Total Billed</span>
              <span className="font-semibold">{formatCurrency(totalBilled)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Paid</span>
              <span className="font-semibold text-green-600">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="pt-4 border-t flex justify-center">
               <Button asChild className="w-full">
                 <Link to={`/bills?vendor_id=${vendor.id}`}>View All Bills</Link>
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
              <CardDescription className="print:hidden">Transaction history from {dateFrom ? format(new Date(dateFrom), 'PPP') : '—'} to {dateTo ? format(new Date(dateTo), 'PPP') : '—'}</CardDescription>
              <CardDescription className="hidden print:block">Statement Period: {dateFrom ? format(new Date(dateFrom), 'PPP') : '—'} - {dateTo ? format(new Date(dateTo), 'PPP') : '—'}</CardDescription>
            </div>
            <div className="flex gap-2 items-center print:hidden">
              <ReportingPeriodPicker showLabel={false} />
              <Button variant="outline" onClick={() => setIsEmailOpen(true)} title="Email Statement">
                <Send className="mr-2 h-4 w-4" /> Email
              </Button>
              <Button variant="outline" onClick={handleDownloadPDF} title="Download statement as PDF">
                <FileText className="mr-2 h-4 w-4" /> PDF
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
                    <TableCell>{format(new Date(t.date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>{t.description}</TableCell>
                    <TableCell>
                      {t.bill_number || '-'}
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

      {vendor && (
        <SendStatementDialog
          isOpen={isEmailOpen}
          setIsOpen={setIsEmailOpen}
          entity={{ id: vendor.id, name: vendor.name, email: vendor.email }}
          type="vendor"
          dateFrom={dateFrom ?? ''}
          dateTo={dateTo ?? ''}
        />
      )}
    </div>
  );
};

export default VendorDetail;