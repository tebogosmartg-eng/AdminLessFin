import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { invokePayroll } from '../lib/payrollOperations';
import { yearOfAssessmentFor, type Emp501Kind, type MonthFilingState } from '../lib/sars/statutoryCalendar';
import Emp201Panel from '../components/payroll/Emp201Panel';
import Emp501Panel from '../components/payroll/Emp501Panel';
import UifDeclarationPanel from '../components/payroll/UifDeclarationPanel';
import CoidaRoePanel from '../components/payroll/CoidaRoePanel';

type WorkspaceMonth = {
  month: string;
  period: string;
  dueDate: string;
  state: MonthFilingState;
  overdue: boolean;
  finalisedRuns: number;
  pendingRuns: number;
  paid: number;
  return: { id: string; version: number; totalPayable: number; paye: number; selfApproved: boolean } | null;
};
type WorkspaceReconciliation = {
  kind: Emp501Kind;
  period: string;
  opens: string;
  due: string;
  overdue: boolean;
  return: { id: string; version: number; status: string; approvedAt: string | null; certificateCount: number } | null;
};
type Workspace = { yearOfAssessment: number; today: string; months: WorkspaceMonth[]; reconciliations: WorkspaceReconciliation[] };

const STATE: Record<MonthFilingState, { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  no_payroll: { label: 'No payroll', tone: 'outline' },
  not_filed: { label: 'To file', tone: 'secondary' },
  filed: { label: 'Awaiting approval', tone: 'secondary' },
  approved: { label: 'To submit', tone: 'secondary' },
  submitted: { label: 'To pay', tone: 'secondary' },
  underpaid: { label: 'Part paid', tone: 'destructive' },
  overpaid: { label: 'Overpaid', tone: 'destructive' },
  paid: { label: 'Paid', tone: 'default' },
};

const monthName = (month: string) => format(new Date(`${month}-01T00:00:00`), 'MMM yyyy');
const day = (iso: string) => format(new Date(`${iso}T00:00:00`), 'd MMM yyyy');

/**
 * SARS employer returns for a tax year: every month's EMP201 (filed, approved, submitted,
 * paid, due date), the interim and annual EMP501 with IRP5 / IT3(a) certificates, and the
 * e@syFile file. Everything is built on the server from finalised payroll and kept as a
 * locked record.
 */
const StatutoryReturns = () => {
  useDocumentTitle('Statutory Returns');
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const lastMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
  const [yearOfAssessment, setYearOfAssessment] = useState(() => yearOfAssessmentFor(lastMonth));
  const [tab, setTab] = useState<'EMP201' | 'EMP501' | 'UIF' | 'COIDA'>('EMP201');
  const [month, setMonth] = useState(lastMonth);
  const years = useMemo(() => {
    const current = yearOfAssessmentFor(format(new Date(), 'yyyy-MM'));
    return [current + 1, current, current - 1, current - 2];
  }, []);

  const { data: workspace, isLoading, error } = useQuery({
    queryKey: ['statutory-workspace', companyId, yearOfAssessment],
    queryFn: () => invokePayroll<Workspace>({ method: 'GET_STATUTORY_WORKSPACE', company_id: companyId, yearOfAssessment }),
    enabled: !!companyId,
    retry: (count, err) => !/Unsupported method|not available on the server/i.test(String((err as Error)?.message)) && count < 1,
  });

  const overdue = (workspace?.months ?? []).filter((m) => m.overdue).length + (workspace?.reconciliations ?? []).filter((r) => r.overdue).length;
  const openMonth = (m: string) => {
    setMonth(m);
    setTab('EMP201');
    document.getElementById('statutory-return-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h1 className="text-3xl font-bold">Statutory Returns</h1>
          <p className="text-muted-foreground text-sm">
            SARS employer returns from finalised payroll: the EMP201 every month, the EMP501 twice a year, and the employees' IRP5 / IT3(a) certificates.
          </p>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Tax year</div>
          <Select value={String(yearOfAssessment)} onValueChange={(v) => setYearOfAssessment(Number(v))}>
            <SelectTrigger className="w-64" aria-label="Tax year"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{`March ${y - 1} – February ${y}`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card data-testid="statutory-year">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Filing calendar</CardTitle>
          <CardDescription>
            EMP201 due on the 7th of the next month (earlier when that is a weekend or public holiday). Reminders come from{' '}
            <Link to="/compliance" className="underline">Compliance &amp; Governance</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive"><AlertDescription>The filing calendar could not be loaded: {(error as Error).message}</AlertDescription></Alert>
          ) : isLoading || !workspace ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              {overdue > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{overdue} return{overdue === 1 ? ' is' : 's are'} past the due date and still need action.</AlertDescription>
                </Alert>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">PAYE</TableHead>
                      <TableHead className="text-right">Payable</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspace.months.map((m) => (
                      <TableRow key={m.month} data-testid={`statutory-month-${m.month}`}>
                        <TableCell className="whitespace-nowrap">{monthName(m.month)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{day(m.dueDate)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={m.overdue ? 'destructive' : STATE[m.state].tone}>{m.overdue ? `Overdue · ${STATE[m.state].label}` : STATE[m.state].label}</Badge>
                          {m.pendingRuns > 0 && <span className="ml-2 text-xs text-muted-foreground">{m.pendingRuns} run{m.pendingRuns === 1 ? '' : 's'} not finalised</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono">{m.return ? formatCurrency(m.return.paye) : '—'}</TableCell>
                        <TableCell className="text-right font-mono">{m.return ? formatCurrency(m.return.totalPayable) : '—'}</TableCell>
                        <TableCell className="text-right font-mono">{m.return ? formatCurrency(m.paid) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {m.state !== 'no_payroll' && (
                            <Button size="sm" variant="ghost" onClick={() => openMonth(m.month)} aria-label={`Open EMP201 ${m.month}`}>Open</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {workspace.reconciliations.map((r) => (
                      <TableRow key={r.kind} className="bg-muted/40" data-testid={`statutory-emp501-${r.kind}`}>
                        <TableCell className="whitespace-nowrap font-medium">EMP501 {r.kind === 'interim' ? 'interim' : 'annual'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{day(r.opens)} – {day(r.due)}</TableCell>
                        <TableCell>
                          <Badge variant={r.overdue ? 'destructive' : r.return?.status === 'submitted' ? 'default' : 'secondary'}>
                            {r.return
                              ? r.return.status === 'submitted' ? 'Submitted' : r.return.approvedAt ? 'To submit' : 'Awaiting approval'
                              : r.overdue ? 'Overdue · not filed' : 'Not filed'}
                          </Badge>
                        </TableCell>
                        <TableCell colSpan={3} className="text-right text-sm text-muted-foreground">
                          {r.return ? `${r.return.certificateCount} certificate${r.return.certificateCount === 1 ? '' : 's'} · v${r.return.version}` : ''}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setTab('EMP501'); document.getElementById('statutory-return-detail')?.scrollIntoView({ behavior: 'smooth' }); }}>
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card id="statutory-return-detail">
        <CardContent className="pt-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="EMP201">EMP201 monthly</TabsTrigger>
              <TabsTrigger value="EMP501">EMP501 &amp; certificates</TabsTrigger>
              <TabsTrigger value="UIF">UIF declaration</TabsTrigger>
              <TabsTrigger value="COIDA">COIDA return of earnings</TabsTrigger>
            </TabsList>
            <TabsContent value="EMP201" className="mt-4">
              <Emp201Panel month={month} onMonthChange={setMonth} />
            </TabsContent>
            <TabsContent value="EMP501" className="mt-4">
              <Emp501Panel yearOfAssessment={yearOfAssessment} />
            </TabsContent>
            <TabsContent value="UIF" className="mt-4">
              <UifDeclarationPanel />
            </TabsContent>
            <TabsContent value="COIDA" className="mt-4">
              <CoidaRoePanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatutoryReturns;
