import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Download, FileText, ShieldCheck, TriangleAlert } from 'lucide-react';
import { formatCurrency, downloadCSV } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showError } from '../utils/toast';
import { creditorsAgeAnalysisQuery } from '../lib/queries';
import { downloadCreditorsAgeAnalysisPdf } from '../lib/statements/creditorsAgeAnalysisPdf';

type Buckets = {
  current: number; days_1_30: number; days_31_60: number; days_61_90: number; days_120_plus: number;
};
type SupplierRow = {
  vendor_id: string; vendor_name: string; buckets: Buckets; total: number;
  ap_control_balance: number; unallocated: number; oldest_days_overdue: number; open_bill_count: number;
};
type AgeAnalysis = {
  as_of: string;
  suppliers: SupplierRow[];
  totals: Buckets & { total: number; ap_control_balance: number; unallocated: number };
  reconciliation: {
    age_analysis_total: number; unallocated_to_suppliers: number;
    unattributed_to_any_supplier: number; general_ledger_ap_balance: number;
    variance: number; reconciles: boolean;
  };
};

const BUCKETS: Array<{ key: keyof Buckets; label: string }> = [
  { key: 'current', label: 'Current' },
  { key: 'days_1_30', label: '1-30 days' },
  { key: 'days_31_60', label: '31-60 days' },
  { key: 'days_61_90', label: '61-90 days' },
  { key: 'days_120_plus', label: '90+ days' },
];

const today = () => new Date().toISOString().slice(0, 10);

const CreditorsAgeAnalysis = () => {
  useDocumentTitle('Creditors Age Analysis');
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const [asOf, setAsOf] = useState(today());

  const { data, isLoading, isError, error } = useQuery<AgeAnalysis>({
    ...creditorsAgeAnalysisQuery(activeCompany?.id ?? '', asOf),
    enabled: !!activeCompany && !!asOf,
  });

  const rows = useMemo(() => data?.suppliers ?? [], [data]);
  const t = data?.totals;
  const rec = data?.reconciliation;

  const handleCsv = () => {
    if (!data) return;
    const body = rows.map((r) => ({
      Supplier: r.vendor_name,
      Current: r.buckets.current,
      '1-30 days': r.buckets.days_1_30,
      '31-60 days': r.buckets.days_31_60,
      '61-90 days': r.buckets.days_61_90,
      '90+ days': r.buckets.days_120_plus,
      'Aged total': r.total,
      'Control balance': r.ap_control_balance,
      Difference: r.unallocated,
      'Open bills': r.open_bill_count,
      'Oldest days overdue': r.oldest_days_overdue,
    }));
    // The reconciliation travels with the data, so a spreadsheet handed to an
    // auditor cannot be mistaken for a statement of the creditors balance.
    body.push(
      {} as never,
      { Supplier: 'Open bills aged above', 'Aged total': rec!.age_analysis_total } as never,
      { Supplier: 'Not an open bill (payments on account, credit notes, journals)', 'Aged total': rec!.unallocated_to_suppliers } as never,
      { Supplier: 'No supplier recorded on the control account', 'Aged total': rec!.unattributed_to_any_supplier } as never,
      { Supplier: 'Creditors control account per the general ledger', 'Aged total': rec!.general_ledger_ap_balance } as never,
      { Supplier: 'Variance', 'Aged total': rec!.variance } as never,
    );
    downloadCSV(body, `creditors-age-analysis-${asOf}.csv`);
  };

  const handlePdf = () => {
    if (!data || !t || !rec) return;
    try {
      downloadCreditorsAgeAnalysisPdf({
        companyName: identity?.name || activeCompany?.name || 'Company',
        companyAddress: identity?.address ?? null,
        asOf: data.as_of,
        suppliers: rows,
        totals: t,
        reconciliation: rec,
      });
    } catch (e) {
      showError(e instanceof Error ? e.message : 'The PDF could not be generated.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Creditors Age Analysis</CardTitle>
            <CardDescription>
              Every supplier's outstanding bills by age, as at a date, reconciled to the
              creditors control account in the general ledger.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="as-of" className="text-xs">As at</Label>
              <Input
                id="as-of"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="w-[170px]"
              />
            </div>
            <Button variant="outline" onClick={handleCsv} disabled={!data}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button onClick={handlePdf} disabled={!data}>
              <FileText className="mr-2 h-4 w-4" /> PDF for auditors
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isError && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>The age analysis could not be prepared</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Unknown error.'}</AlertDescription>
          </Alert>
        )}

        {isLoading && <Skeleton className="h-64 w-full" />}

        {data && (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    {BUCKETS.map((b) => (
                      <TableHead key={b.key} className="text-right">{b.label}</TableHead>
                    ))}
                    <TableHead className="text-right">Aged total</TableHead>
                    <TableHead className="text-right">Control balance</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                        No supplier has a balance or an open bill as at {data.as_of}.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.vendor_id}>
                      <TableCell>
                        <Link to={`/vendors/${r.vendor_id}`} className="underline underline-offset-2">
                          {r.vendor_name}
                        </Link>
                        {r.open_bill_count > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {r.open_bill_count} open {r.open_bill_count === 1 ? 'bill' : 'bills'}
                          </span>
                        )}
                      </TableCell>
                      {BUCKETS.map((b) => (
                        <TableCell key={b.key} className="text-right font-mono">
                          {formatCurrency(r.buckets[b.key])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono font-semibold">{formatCurrency(r.total)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(r.ap_control_balance)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(r.unallocated)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {t && (
                  <TableFooter>
                    <TableRow className="font-bold">
                      <TableCell>Total</TableCell>
                      {BUCKETS.map((b) => (
                        <TableCell key={b.key} className="text-right font-mono">{formatCurrency(t[b.key])}</TableCell>
                      ))}
                      <TableCell className="text-right font-mono">{formatCurrency(t.total)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(t.ap_control_balance)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(t.unallocated)}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            {rec && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                  {rec.reconciles
                    ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    : <TriangleAlert className="h-4 w-4 text-destructive" />}
                  <h3 className="font-semibold">Reconciliation to the general ledger</h3>
                </div>
                {/* An age analysis ages OPEN BILLS. The control account can also
                    hold payments on account, credit notes and journals posted
                    straight to it, so the two are not the same number and the
                    difference is stated rather than hidden. */}
                <dl className="space-y-1 text-sm">
                  {[
                    ['Open bills aged above', rec.age_analysis_total],
                    ['Movements against a supplier that are not an open bill', rec.unallocated_to_suppliers],
                    ['Movements on the control account with no supplier recorded', rec.unattributed_to_any_supplier],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-mono">{formatCurrency(Number(value))}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                    <dt>Creditors control account per the general ledger</dt>
                    <dd className="font-mono">{formatCurrency(rec.general_ledger_ap_balance)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 font-semibold">
                    <dt>Variance</dt>
                    <dd className={`font-mono ${rec.reconciles ? '' : 'text-destructive'}`}>
                      {formatCurrency(rec.variance)}
                    </dd>
                  </div>
                </dl>
                <p className={`mt-3 text-sm ${rec.reconciles ? 'text-muted-foreground' : 'text-destructive font-medium'}`}>
                  {rec.reconciles
                    ? 'This age analysis reconciles to the creditors control account and can be submitted as it stands.'
                    : 'This age analysis does not reconcile. Investigate the variance before submitting it.'}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CreditorsAgeAnalysis;
