import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { downloadCSV, formatCurrency, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';

type TaxCfaPayload = {
  money_source: string;
  vatPayable: number;
  vatReceivable: number;
  vatNet: number;
  outputVat: number;
  inputVat: number;
  netVatLiability: number;
};

/** VAT KPIs from Canonical Financial Aggregation only — no rate×base engine. */
const TaxReport = () => {
  const { activeCompany } = useAuth();
  const { dateFrom, dateTo, isReady, currentReportingPeriod } = useReportingPeriod();

  const fromDate = currentReportingPeriod?.from ?? (dateFrom ? parseISO(dateFrom) : new Date());
  const toDate = currentReportingPeriod?.to ?? (dateTo ? parseISO(dateTo) : new Date());

  const { data, isLoading } = useQuery<TaxCfaPayload>({
    queryKey: ['tax_report_cfa', dateFrom, dateTo, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany || !dateFrom || !dateTo) {
        return {
          money_source: 'canonical_financial_aggregation',
          vatPayable: 0,
          vatReceivable: 0,
          vatNet: 0,
          outputVat: 0,
          inputVat: 0,
          netVatLiability: 0,
        };
      }
      const { data: payload, error } = await supabase.functions.invoke('reports', {
        body: {
          method: 'GET_TAX_REPORT',
          company_id: activeCompany.id,
          start_date: dateFrom,
          end_date: dateTo,
        },
      });
      if (error) throw new Error(error.message);
      return payload as TaxCfaPayload;
    },
    enabled: !!activeCompany && isReady,
  });

  const vat = data || {
    vatPayable: 0,
    vatReceivable: 0,
    vatNet: 0,
    outputVat: 0,
    inputVat: 0,
    netVatLiability: 0,
  };

  const handleDownload = () => {
    if (!dateFrom) return;
    downloadCSV(
      [
        {
          Source: 'Canonical Financial Aggregation',
          'As of': format(toDate, 'yyyy-MM-dd'),
          'Output VAT / VAT Payable': Number(vat.outputVat ?? vat.vatPayable).toFixed(2),
          'Input VAT / VAT Receivable': Number(vat.inputVat ?? vat.vatReceivable).toFixed(2),
          'Net VAT Liability': Number(vat.netVatLiability ?? vat.vatNet).toFixed(2),
        },
      ],
      `tax-report-cfa-${dateFrom}.csv`,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sales Tax Report</h1>
        <div className="flex items-center gap-2">
          <ReportingPeriodPicker />
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={isLoading}>
            <Download className="mr-2 h-4 w-4" /> Download CSV
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        VAT balances from Canonical Financial Aggregation (GL roles on Trial Balance as of{' '}
        {format(toDate, 'PPP')}). Period {format(fromDate, 'PPP')} – {format(toDate, 'PPP')}.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Output VAT / VAT Payable (CFA)</CardDescription>
            <CardTitle className="text-2xl font-mono text-green-700">
              {isLoading ? <Skeleton className="h-8 w-28" /> : formatCurrency(Number(vat.outputVat ?? vat.vatPayable))}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Input VAT / VAT Receivable (CFA)</CardDescription>
            <CardTitle className="text-2xl font-mono text-amber-700">
              {isLoading ? <Skeleton className="h-8 w-28" /> : formatCurrency(Number(vat.inputVat ?? vat.vatReceivable))}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net VAT Liability (CFA)</CardDescription>
            <CardTitle
              className={cn(
                'text-2xl font-mono',
                Number(vat.netVatLiability ?? vat.vatNet) > 0 ? 'text-red-600' : 'text-green-600',
              )}
            >
              {isLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                formatCurrency(Number(vat.netVatLiability ?? vat.vatNet))
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Canonical VAT</CardTitle>
          <CardDescription>
            Same figures as Balance Sheet VAT role accounts via CFA — no tax-rate × base recalculation.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Money source: {data?.money_source || 'canonical_financial_aggregation'}
        </CardContent>
      </Card>
    </div>
  );
};

export default TaxReport;
