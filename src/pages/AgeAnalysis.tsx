import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';
import { parseIsoDateSafe } from '../lib/reportingPeriod/presets';
import {
  asAtForPeriod, isCappedToToday, isoDay, ledgerStartForPeriod,
} from '../lib/reportingPeriod/asAt';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { BookOpen, Download, FileText, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { formatCurrency, downloadCSV } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showError } from '../utils/toast';
import { creditorsAgeAnalysisQuery, debtorsAgeAnalysisQuery } from '../lib/queries';
import {
  downloadAgeAnalysisPdf, downloadControlLedgerPdf, SIDE_WORDING,
  type AgeAnalysisSide, type ControlLedgerRow,
} from '../lib/statements/ageAnalysisPdf';
import { supabase } from '../integrations/supabase/client';
import { edgeErrorMessage } from '../lib/platform/edgeError';

type Buckets = {
  current: number; days_1_30: number; days_31_60: number; days_61_90: number; days_120_plus: number;
};
type PartyRow = {
  party_id: string; party_name: string; buckets: Buckets; total: number;
  control_balance: number; unallocated: number; oldest_days_overdue: number; open_document_count: number;
};
type AgeAnalysisData = {
  as_of: string;
  parties: PartyRow[];
  totals: Buckets & { total: number; control_balance: number; unallocated: number };
  reconciliation: {
    age_analysis_total: number; unallocated_to_parties: number;
    unattributed_to_any_party: number; general_ledger_control_balance: number;
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

type ControlLedger = {
  control_accounts: Array<{ account_number: number; name: string }>;
  opening_balance: number;
  rows: ControlLedgerRow[];
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  truncated: boolean;
  tie: {
    ledger_closing_balance: number;
    age_analysis_control_balance: number;
    age_analysis_total: number;
    not_open_documents: number;
    ties: boolean;
  };
};

const longDate = (iso: string | null) => {
  const parsed = parseIsoDateSafe(iso);
  return parsed ? format(parsed, 'd MMM yyyy') : '';
};

/**
 * One page for both sides of the ledger. Creditors and debtors age by exactly
 * the same rules - only the wording and the party link differ - so the table,
 * the exports and the reconciliation panel are written once.
 */
const AgeAnalysis = ({ side }: { side: AgeAnalysisSide }) => {
  const w = SIDE_WORDING[side];
  const heading = side === 'payable' ? 'Creditors Age Analysis' : 'Debtors Age Analysis';
  const partyRoute = side === 'payable' ? '/vendors' : '/customers';
  useDocumentTitle(heading);
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const { dateFrom, dateTo, isReady } = useReportingPeriod();

  /**
   * An age analysis is a point-in-time report, so it takes the reporting
   * period's closing date - which is what makes this control mean the same
   * thing here that it means on every other report. See asAt.ts for why that
   * date is capped at today.
   */
  const todayIso = isoDay(new Date());
  const periodEnd = dateTo;
  const asOf = asAtForPeriod(periodEnd, todayIso);
  const cappedToToday = isCappedToToday(periodEnd, todayIso);
  const ledgerFrom = ledgerStartForPeriod(dateFrom, asOf);

  const { data, isLoading, isError, error } = useQuery<AgeAnalysisData>({
    ...(side === 'payable'
      ? creditorsAgeAnalysisQuery(activeCompany?.id ?? '', asOf)
      : debtorsAgeAnalysisQuery(activeCompany?.id ?? '', asOf)),
    enabled: !!activeCompany && isReady && !!asOf,
  });

  const rows = useMemo(() => data?.parties ?? [], [data]);
  const [ledgerBusy, setLedgerBusy] = useState<'csv' | 'pdf' | null>(null);

  /**
   * The control account ledger is fetched only when asked for. It is the full
   * transaction detail behind the control balance and can be thousands of
   * lines, so loading it with the page would make the summary slow for the many
   * people who never download it.
   */
  const fetchLedger = async (): Promise<ControlLedger> => {
    const { data: result, error: err } = await supabase.functions.invoke(
      side === 'payable' ? 'vendors' : 'customers',
      {
        body: {
          method: 'GET_CONTROL_LEDGER',
          company_id: activeCompany!.id,
          as_of: asOf,
          // The reporting period, so the ledger opens with a brought-forward
          // balance and shows the period's movement, rather than every entry
          // since inception.
          date_from: ledgerFrom,
        },
      },
    );
    if (err) throw new Error(await edgeErrorMessage(err, 'The control account ledger could not be prepared.'));
    return result as ControlLedger;
  };
  const t = data?.totals;
  const rec = data?.reconciliation;

  const handleCsv = () => {
    if (!data) return;
    const body = rows.map((r) => ({
      [w.party]: r.party_name,
      Current: r.buckets.current,
      '1-30 days': r.buckets.days_1_30,
      '31-60 days': r.buckets.days_31_60,
      '61-90 days': r.buckets.days_61_90,
      '90+ days': r.buckets.days_120_plus,
      'Aged total': r.total,
      'Control balance': r.control_balance,
      Difference: r.unallocated,
      'Open documents': r.open_document_count,
      'Oldest days overdue': r.oldest_days_overdue,
    }));
    // The reconciliation travels with the data, so a spreadsheet handed to an
    // auditor cannot be mistaken for a statement of the creditors balance.
    body.push(
      {} as never,
      { [w.party]: 'Open ' + w.document + ' aged above', 'Aged total': rec!.age_analysis_total } as never,
      { [w.party]: 'Not an open document (payments on account, credit notes, journals)', 'Aged total': rec!.unallocated_to_parties } as never,
      { [w.party]: 'No ' + w.party.toLowerCase() + ' recorded on the control account', 'Aged total': rec!.unattributed_to_any_party } as never,
      { [w.party]: w.controlAccount, 'Aged total': rec!.general_ledger_control_balance } as never,
      { [w.party]: 'Variance', 'Aged total': rec!.variance } as never,
    );
    downloadCSV(body, (side === 'payable' ? 'creditors' : 'debtors') + '-age-analysis-' + asOf + '.csv');
  };

  const handlePdf = () => {
    if (!data || !t || !rec) return;
    try {
      downloadAgeAnalysisPdf({
        side,
        companyName: identity?.name || activeCompany?.name || 'Company',
        companyAddress: identity?.address ?? null,
        asOf: data.as_of,
        parties: rows,
        totals: t,
        reconciliation: rec,
      });
    } catch (e) {
      showError(e instanceof Error ? e.message : 'The PDF could not be generated.');
    }
  };

  const handleLedgerCsv = async () => {
    setLedgerBusy('csv');
    try {
      const l = await fetchLedger();
      const accounts = l.control_accounts.map((a) => `${a.account_number} ${a.name}`).join(' / ');
      const body: Array<Record<string, unknown>> = [
        {
          Date: ledgerFrom ?? '',
          Journal: '', [w.party]: '', Reference: '',
          Description: ledgerFrom ? 'Opening balance brought forward' : 'Opening balance (inception)',
          Debit: '', Credit: '', Balance: l.opening_balance,
        },
        ...l.rows.map((r) => ({
          Date: r.entry_date,
          Journal: r.journal_number ?? '',
          [w.party]: r.party_name ?? '',
          Reference: r.document ?? '',
          Description: r.description ?? '',
          Debit: r.debit || '',
          Credit: r.credit || '',
          Balance: r.balance,
        })),
        { Date: asOf, Journal: '', [w.party]: '', Reference: '', Description: 'Closing balance', Debit: l.total_debit, Credit: l.total_credit, Balance: l.closing_balance },
        {},
        { Description: `Control account: ${accounts}` },
        { Description: 'Period covered', Reference: ledgerFrom ? `${ledgerFrom} to ${asOf}` : `Inception to ${asOf}` },
        { Description: 'Control account closing balance per this ledger', Balance: l.tie.ledger_closing_balance },
        { Description: 'Control account balance per the age analysis', Balance: l.tie.age_analysis_control_balance },
        { Description: 'Difference', Balance: l.tie.ledger_closing_balance - l.tie.age_analysis_control_balance },
        { Description: `Of that balance, open ${w.document} aged in the analysis`, Balance: l.tie.age_analysis_total },
        { Description: 'Not represented by an open document', Balance: l.tie.not_open_documents },
      ];
      downloadCSV(body, `${side === 'payable' ? 'creditors' : 'debtors'}-control-account-${asOf}.csv`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'The control account ledger could not be prepared.');
    } finally {
      setLedgerBusy(null);
    }
  };

  const handleLedgerPdf = async () => {
    setLedgerBusy('pdf');
    try {
      const l = await fetchLedger();
      downloadControlLedgerPdf({
        side,
        companyName: identity?.name || activeCompany?.name || 'Company',
        companyAddress: identity?.address ?? null,
        asOf,
        dateFrom: ledgerFrom,
        controlAccounts: l.control_accounts,
        openingBalance: l.opening_balance,
        rows: l.rows,
        totalDebit: l.total_debit,
        totalCredit: l.total_credit,
        closingBalance: l.closing_balance,
        truncated: l.truncated,
        tie: l.tie,
      });
    } catch (e) {
      showError(e instanceof Error ? e.message : 'The control account ledger could not be prepared.');
    } finally {
      setLedgerBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>{heading}</CardTitle>
            <CardDescription>
              Every {w.party.toLowerCase()} with an outstanding balance, aged as at{' '}
              <span className="font-medium text-foreground">{longDate(asOf)}</span> and
              reconciled to the control account in the general ledger.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <ReportingPeriodPicker showLabel={false} />
              {/* Said plainly, because a period that closes in the future would
                  otherwise look as though the picker had been ignored. */}
              {cappedToToday && (
                <span className="text-xs text-muted-foreground">
                  Aged as at today; the period runs to {longDate(periodEnd)}.
                </span>
              )}
            </div>
            <Button variant="outline" onClick={handleCsv} disabled={!data}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
            <Button onClick={handlePdf} disabled={!data}>
              <FileText className="mr-2 h-4 w-4" /> PDF for auditors
            </Button>
            {/* The control account behind these figures, for the auditor who
                asks to see that the age analysis agrees with the ledger. */}
            <Button variant="outline" onClick={handleLedgerCsv} disabled={!data || ledgerBusy !== null}>
              {ledgerBusy === 'csv'
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <BookOpen className="mr-2 h-4 w-4" />}
              Control account CSV
            </Button>
            <Button variant="outline" onClick={handleLedgerPdf} disabled={!data || ledgerBusy !== null}>
              {ledgerBusy === 'pdf'
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <BookOpen className="mr-2 h-4 w-4" />}
              Control account PDF
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
                    <TableHead>{w.party}</TableHead>
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
                        No {w.party.toLowerCase()} has a balance or an open document as at {longDate(data.as_of)}.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.party_id}>
                      <TableCell>
                        <Link to={`${partyRoute}/${r.party_id}`} className="underline underline-offset-2">
                          {r.party_name}
                        </Link>
                        {r.open_document_count > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {r.open_document_count} open
                          </span>
                        )}
                      </TableCell>
                      {BUCKETS.map((b) => (
                        <TableCell key={b.key} className="text-right font-mono">
                          {formatCurrency(r.buckets[b.key])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono font-semibold">{formatCurrency(r.total)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(r.control_balance)}</TableCell>
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
                      <TableCell className="text-right font-mono">{formatCurrency(t.control_balance)}</TableCell>
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
                    ['Open ' + w.document + ' aged above', rec.age_analysis_total],
                    ['Movements against a ' + w.party.toLowerCase() + ' that are not an open document', rec.unallocated_to_parties],
                    ['Movements on the control account with no ' + w.party.toLowerCase() + ' recorded', rec.unattributed_to_any_party],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-mono">{formatCurrency(Number(value))}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
                    <dt>{w.controlAccount}</dt>
                    <dd className="font-mono">{formatCurrency(rec.general_ledger_control_balance)}</dd>
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
                    ? 'This age analysis reconciles to the ' + (side === 'payable' ? 'creditors' : 'debtors') + ' control account and can be submitted as it stands.'
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

export default AgeAnalysis;
