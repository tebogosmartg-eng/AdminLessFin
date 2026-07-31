import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import { supabase } from '../../integrations/supabase/client';
import {
  accountsQuery,
  bankAccountsQuery,
  fixedAssetsQuery,
} from '../../lib/queries';
import { buildStatementTotals } from '../../lib/accounting/dashboardReconciliation';
import {
  buildSubLedgerReconciliation,
  buildIdentityChecks,
  summariseReconciliation,
  sumSubLedgerRows,
  sumAssetRegisterNetBookValue,
} from '../../lib/accounting/subLedgerReconciliation';
import { formatCurrency } from '../../lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

/**
 * Sub-ledger ↔ General Ledger reconciliation controls.
 *
 * Reads only. Every GL figure comes from Canonical Financial Aggregation via
 * the existing accounting endpoints; every sub-ledger figure comes from the
 * domain that already owns it. This component compares them and shows the
 * difference — it never recomputes, adjusts or posts anything, so removing it
 * changes no displayed financial amount anywhere else in the app.
 *
 * Period and company come from the canonical reporting authority
 * (ReportingPeriodContext + active company), never from a local date.
 */
const SubLedgerReconciliationPanel = () => {
  const { activeCompany } = useAuth();
  const { dateFrom, dateTo, isReady } = useReportingPeriod();
  const companyId = activeCompany?.id;
  const enabled = !!companyId && isReady;

  // GL side — canonical balances as of the reporting period end.
  const { data: glAccounts, isLoading: glLoading } = useQuery({
    ...accountsQuery(companyId ?? '', dateTo ?? undefined),
    enabled,
  });

  // GL side — period activity + cash flow, so CFA can produce the same totals
  // the Dashboard and Financial Statements consume.
  const { data: canonical, isLoading: canonicalLoading } = useQuery({
    queryKey: ['reconciliation_canonical', companyId, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('dashboard-data', {
        body: { company_id: companyId, date_from: dateFrom, date_to: dateTo },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled,
  });

  const { data: assets, isLoading: assetsLoading } = useQuery({
    ...fixedAssetsQuery(companyId ?? ''),
    enabled,
  });

  const { data: bankAccounts, isLoading: bankLoading } = useQuery({
    ...bankAccountsQuery(companyId ?? ''),
    enabled,
  });

  const isLoading = glLoading || canonicalLoading || assetsLoading || bankLoading;

  const { lines, identities, summary } = useMemo(() => {
    // GL side: prefer the canonical payload the Dashboard itself uses so the
    // control compares against the very same numbers the user sees there.
    const cfa =
      canonical?.statementTotals ??
      (glAccounts ? buildStatementTotals({ balancesAsOf: glAccounts as never }) : null);

    // Sub-ledger side: each figure is the owning domain's own total. The
    // summing lives in the reconciliation authority, not in this component, so
    // no money math is performed on a consumer surface.
    const assetsNbv = sumAssetRegisterNetBookValue(assets as never);
    const bankBalance = sumSubLedgerRows(bankAccounts as never, ['current_balance', 'balance']);
    const arBalance = sumSubLedgerRows(canonical?.arBalances, ['balance', 'total']);
    const apBalance = sumSubLedgerRows(canonical?.apBalances, ['balance', 'total']);

    const built = buildSubLedgerReconciliation(
      {
        cash: cfa?.cash,
        receivables: cfa?.receivables,
        payables: cfa?.payables,
        vatNet: cfa?.vatNet,
        netCashFlow: cfa?.netCashFlow,
        // Fixed-asset, inventory and payroll CONTROL-account balances are not
        // exposed by CFA today, and deriving them here would mean re-classifying
        // GL accounts — a second accounting engine, which ADR-0003 forbids.
        // Left undefined so these controls report "not available" rather than a
        // false variance against an unrelated total.
        fixedAssetsControl: undefined,
        inventoryControl: undefined,
        payrollControl: undefined,
      },
      {
        assetsNetBookValue: assetsNbv,
        bankBalance,
        arBalance,
        apBalance,
        vatBalance: cfa?.vatNet,
        cashFlowMovement: cfa?.netCashFlow,
      },
    );

    return {
      lines: built,
      identities: buildIdentityChecks(cfa),
      summary: summariseReconciliation(built),
    };
  }, [canonical, glAccounts, assets, bankAccounts]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sub-ledger ↔ General Ledger controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Sub-ledger ↔ General Ledger controls</CardTitle>
              <CardDescription>
                Compares each sub-ledger against its General Ledger control account. Differences are
                exposed, never adjusted — which figure is correct is an accounting judgement.
              </CardDescription>
            </div>
            <Badge variant={summary.variance > 0 ? 'destructive' : summary.balanced > 0 ? 'success' : 'secondary'}>
              {summary.balanced} balanced · {summary.variance} variance · {summary.unavailable} not available
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Control</TableHead>
                <TableHead className="text-right">Sub-ledger</TableHead>
                <TableHead className="text-right">General Ledger</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-medium">{line.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {line.subLedgerSource} vs {line.glSource}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {line.subLedgerAmount === null ? '—' : formatCurrency(line.subLedgerAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {line.glAmount === null ? '—' : formatCurrency(line.glAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {line.variance === null ? '—' : formatCurrency(line.variance)}
                  </TableCell>
                  <TableCell>
                    {line.status === 'balanced' && (
                      <span className="inline-flex items-center gap-1 text-success text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Balanced
                      </span>
                    )}
                    {line.status === 'variance' && (
                      <span className="inline-flex items-center gap-1 text-destructive text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" /> Variance
                      </span>
                    )}
                    {line.status === 'unavailable' && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                        <HelpCircle className="h-3.5 w-3.5" /> Not available
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canonical ledger identities</CardTitle>
          <CardDescription>
            Reported by Canonical Financial Aggregation. Shown here, not recalculated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {identities.map((check) => (
            <div key={check.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium">{check.label}</div>
                <div className="text-xs text-muted-foreground">{check.detail}</div>
              </div>
              {check.holds === true && <Badge variant="success">Holds</Badge>}
              {check.holds === false && <Badge variant="destructive">Does not hold</Badge>}
              {check.holds === null && <Badge variant="secondary">Not available</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default SubLedgerReconciliationPanel;
