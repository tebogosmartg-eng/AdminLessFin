import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { formatCurrency, cn } from '../lib/utils';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';
import { format } from 'date-fns';

const ComparativeBalanceSheet = () => {
  const { activeCompany } = useAuth();
  const { dateFrom, dateTo, isReady } = useReportingPeriod();

  const { data: report, isLoading } = useQuery({
    queryKey: ['comparative_bs', activeCompany?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!activeCompany || !dateTo) return null;
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          method: 'GET_COMPARATIVE_BS',
          company_id: activeCompany.id,
          start_date: dateFrom,
          end_date: dateTo,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany && isReady && !!dateFrom && !!dateTo,
  });

  const assetAccounts = report?.accounts.filter((a: { type: string }) => a.type === 'Asset') || [];
  const liabilityAccounts = report?.accounts.filter((a: { type: string }) => a.type === 'Liability') || [];
  const equityAccounts = report?.accounts.filter((a: { type: string }) => a.type === 'Equity') || [];

  const niCurrent = Number(report?.netIncome?.current || 0);
  const niPrior = Number(report?.netIncome?.prior || 0);
  const sectionTotals = report?.totals;

  const renderSection = (
    title: string,
    accounts: { name: string; current: number; prior: number }[],
    sectionKey: 'assets' | 'liabilities' | 'equity',
  ) => {
    const currentTotal = Number(sectionTotals?.[sectionKey]?.current ?? 0);
    const priorTotal = Number(sectionTotals?.[sectionKey]?.prior ?? 0);

    return (
      <>
        <TableRow className="bg-muted/50 font-semibold">
          <TableCell colSpan={4}>{title}</TableCell>
        </TableRow>
        {accounts.map((acc) => (
          <TableRow key={acc.name}>
            <TableCell className="pl-8">{acc.name}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(acc.current)}</TableCell>
            <TableCell className="text-right font-mono text-muted-foreground">
              {formatCurrency(acc.prior)}
            </TableCell>
            <TableCell
              className={cn(
                'text-right font-mono text-xs',
                acc.current > acc.prior
                  ? 'text-green-600'
                  : acc.current < acc.prior
                    ? 'text-red-600'
                    : 'text-muted-foreground',
              )}
            >
              {acc.current !== acc.prior ? (acc.current > acc.prior ? '↑' : '↓') : '-'}{' '}
              {formatCurrency(Math.abs(acc.current - acc.prior))}
            </TableCell>
          </TableRow>
        ))}
        {title === 'Equity' && (
          <TableRow>
            <TableCell className="pl-8 italic">Current Year Earnings</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(niCurrent)}</TableCell>
            <TableCell className="text-right font-mono text-muted-foreground">
              {formatCurrency(niPrior)}
            </TableCell>
            <TableCell />
          </TableRow>
        )}
        <TableRow className="border-t font-bold">
          <TableCell>Total {title}</TableCell>
          <TableCell className="text-right font-mono">{formatCurrency(currentTotal)}</TableCell>
          <TableCell className="text-right font-mono text-muted-foreground">
            {formatCurrency(priorTotal)}
          </TableCell>
          <TableCell />
        </TableRow>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Comparative Balance Sheet</h1>
        <ReportingPeriodPicker />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Year-over-Year Comparison</CardTitle>
          <CardDescription>
            Comparing{' '}
            {report?.dates.current ? format(new Date(report.dates.current), 'PP') : ''} vs{' '}
            {report?.dates.prior ? format(new Date(report.dates.prior), 'PP') : ''}. Equity includes
            Current Year Earnings from get_period_activity (same as Reports / Financial Statements).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Prior Year</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderSection('Assets', assetAccounts, 'assets')}
                <TableRow className="h-4">
                  <TableCell colSpan={4} />
                </TableRow>
                {renderSection('Liabilities', liabilityAccounts, 'liabilities')}
                <TableRow className="h-4">
                  <TableCell colSpan={4} />
                </TableRow>
                {renderSection('Equity', equityAccounts, 'equity')}
              </TableBody>
              <TableFooter>
                <TableRow className="text-lg font-bold">
                  <TableCell>Total Liabilities & Equity</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(Number(sectionTotals?.liabilitiesAndEquity?.current ?? 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatCurrency(Number(sectionTotals?.liabilitiesAndEquity?.prior ?? 0))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ComparativeBalanceSheet;
