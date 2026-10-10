import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Clock, Copy, Download, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';

type Row = {
  employeeId: string;
  name: string;
  employeeNumber: string | null;
  employmentType: string | null;
  payBasis: 'hourly' | 'daily';
  rate: number | null;
  taxMethod: 'tables' | 'non_standard';
  quantity: number | null;
  source: 'manual' | 'work_module' | 'attendance' | null;
  attendance: { quantity: number; daysRecorded: number } | null;
  workHours: { quantity: number; entries: number } | null;
  amount: number;
  issues: Array<{ code: string; message: string }>;
};
type Timesheet = {
  run: { id: string; status: string; payPeriodStart: string; payPeriodEnd: string; payFrequency: string };
  rows: Row[];
  total: number;
  workHoursWaiting: number;
  attendanceWaiting: number;
};

const unit = (r: Pick<Row, 'payBasis'>, n: number) => (r.payBasis === 'daily' ? `${n} day${n === 1 ? '' : 's'}` : `${n} hour${n === 1 ? '' : 's'}`);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The run's timesheet for daily and hourly-paid employees: days or hours worked × the
 * employee's rate. Saving (or filling it) recalculates the payslips straight away.
 */
export default function TimesheetPanel({ runId, onSaved }: { runId: string; onSaved?: () => void }) {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const key = ['payroll-timesheet', companyId, runId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => invokePayroll<Timesheet>({ method: 'GET_TIMESHEET', company_id: companyId, runId }),
    enabled: !!companyId,
    retry: (count, err) => !/Unsupported method|not available on the server/i.test(String((err as Error)?.message)) && count < 1,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setDrafts(Object.fromEntries(data.rows.map((r) => [r.employeeId, r.quantity ? String(r.quantity) : ''])));
  }, [data]);

  /** Every timesheet change recalculates the payslips, so the run shows the pay at once. */
  const recalculate = async () => {
    await invokePayroll({ method: 'GENERATE_PAYSLIPS', company_id: companyId, runId });
    queryClient.invalidateQueries({ queryKey: key });
    onSaved?.();
  };
  const action = <T,>(fn: () => Promise<T>, message: (r: T) => string) => ({
    mutationFn: async () => { const r = await fn(); await recalculate(); return r; },
    onSuccess: (r: T) => showSuccess(message(r)),
    onError: (e: Error) => showError(e.message),
  });

  const changedRows = (data?.rows ?? []).filter((r) => {
    const v = (drafts[r.employeeId] ?? '').trim();
    return (v === '' ? 0 : Number(v)) !== (r.quantity ?? 0);
  });
  const save = useMutation(action(
    () => invokePayroll<{ saved: number }>({
      method: 'SAVE_TIMESHEET', company_id: companyId, runId,
      rows: changedRows.map((r) => ({ employeeId: r.employeeId, quantity: (drafts[r.employeeId] ?? '').trim() ? Number(drafts[r.employeeId]) : 0 })),
    }),
    () => 'Timesheet saved and payslips updated.',
  ));
  const fillFromRegister = useMutation(action(
    () => invokePayroll<{ imported: number }>({ method: 'IMPORT_ATTENDANCE', company_id: companyId, runId }),
    (r) => (r.imported ? `Filled from attendance for ${r.imported} employee${r.imported === 1 ? '' : 's'}; payslips updated.` : 'Nothing recorded on the attendance register for this period.'),
  ));
  const copyPrevious = useMutation(action(
    () => invokePayroll<{ copied: number; from: { start: string; end: string } | null }>({ method: 'COPY_PREVIOUS_TIMESHEET', company_id: companyId, runId }),
    (r) => (r.from
      ? `Copied ${r.copied} employee${r.copied === 1 ? '' : 's'} from ${r.from.start} – ${r.from.end}${r.copied ? '; payslips updated' : ' (everyone already has days or hours)'}.`
      : 'No earlier run of this frequency has a timesheet to copy.'),
  ));
  const importHours = useMutation(action(
    () => invokePayroll<{ imported: number }>({ method: 'IMPORT_WORK_HOURS', company_id: companyId, runId }),
    (r) => (r.imported ? `Approved hours imported for ${r.imported} employee${r.imported === 1 ? '' : 's'}; payslips updated.` : 'No approved hours waiting in Work Management for this period.'),
  ));
  const busy = save.isPending || fillFromRegister.isPending || copyPrevious.isPending || importHours.isPending;

  const live = (r: Row) => {
    const v = (drafts[r.employeeId] ?? '').trim();
    const qty = v === '' ? 0 : Number(v);
    return Number.isFinite(qty) && qty >= 0 ? round2(qty * (r.rate ?? 0)) : 0;
  };
  const total = (data?.rows ?? []).reduce((s, r) => s + live(r), 0);
  const draft = data?.run.status === 'draft';

  return (
    <Card data-testid="timesheet-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Days and hours worked</CardTitle>
        <CardDescription>
          Daily-paid: days × daily rate. Hourly-paid: hours × hourly rate. Fill it from attendance, copy last period, or type it in.
          Anything extra (overtime, a bonus) goes on the payslip as a once-off earning.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="destructive"><AlertDescription>The timesheet could not be loaded: {(error as Error).message}</AlertDescription></Alert>
        ) : isLoading || !data ? <Skeleton className="h-40 w-full" /> : data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No daily or hourly-paid employees on this {data.run.payFrequency} run. Set "Paid by" on the employee to the day or the hour.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => fillFromRegister.mutate()} disabled={busy || !draft} data-testid="fill-from-attendance">
                <CalendarCheck2 className="mr-1 h-4 w-4" />Fill from attendance{data.attendanceWaiting ? ` (${data.attendanceWaiting})` : ''}
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyPrevious.mutate()} disabled={busy || !draft} data-testid="copy-previous-timesheet">
                <Copy className="mr-1 h-4 w-4" />Copy previous period
              </Button>
              {data.workHoursWaiting > 0 && (
                <Button size="sm" variant="outline" onClick={() => importHours.mutate()} disabled={busy || !draft} data-testid="import-work-hours">
                  <Download className="mr-1 h-4 w-4" />Import approved hours ({data.workHoursWaiting})
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Days / hours</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.employeeId} data-testid={`timesheet-row-${r.employeeId}`}>
                      <TableCell className="min-w-48">
                        <div className="font-medium">
                          {r.name}
                          {r.employmentType === 'casual' && <Badge variant="outline" className="ml-1">Casual</Badge>}
                          {r.taxMethod === 'non_standard' && <Badge variant="secondary" className="ml-1">Tax 25%</Badge>}
                        </div>
                        {r.attendance && r.source !== 'attendance' && (
                          <div className="text-xs text-muted-foreground">Attendance shows {unit(r, r.attendance.quantity)}</div>
                        )}
                        {r.issues.map((i) => <div key={i.code} className="text-xs text-amber-600 dark:text-amber-400">{i.message}</div>)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatCurrency(r.rate ?? 0)} / {r.payBasis === 'daily' ? 'day' : 'hour'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number" step={r.payBasis === 'daily' ? '0.5' : '0.25'} min="0" className="w-24 h-8 text-right" disabled={!draft}
                            aria-label={`${r.payBasis === 'daily' ? 'Days' : 'Hours'} worked by ${r.name}`}
                            value={drafts[r.employeeId] ?? ''}
                            onChange={(e) => setDrafts((p) => ({ ...p, [r.employeeId]: e.target.value }))}
                          />
                          <span className="w-10 text-left text-xs text-muted-foreground">{r.payBasis === 'daily' ? 'days' : 'hours'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono" data-testid={`timesheet-total-${r.employeeId}`}>{formatCurrency(live(r))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right font-mono" data-testid="timesheet-grand-total">{formatCurrency(round2(total))}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            {draft && (
              <Button onClick={() => save.mutate()} disabled={busy || changedRows.length === 0} data-testid="save-timesheet">
                <Save className="mr-1 h-4 w-4" />{save.isPending ? 'Saving…' : 'Save and update payslips'}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
