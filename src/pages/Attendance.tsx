import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { CalendarCheck2, ChevronLeft, ChevronRight, Lock, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { formatCurrency } from '../lib/utils';
import { invokePayroll } from '../lib/payrollOperations';
import { showError, showSuccess } from '../utils/toast';

type Employee = {
  id: string;
  name: string;
  employeeNumber: string | null;
  payBasis: 'hourly' | 'daily';
  payFrequency: string;
  employmentType: string | null;
  rate: number | null;
  hoursPerDay: number;
  startDate: string | null;
  endDate: string | null;
};
type Entry = { id: string; employee_id: string; work_date: string; hours: number | null; days: number | null; note: string | null; payroll_run_id: string | null };
type Register = { from: string; to: string; publicHolidays: string[]; employees: Employee[]; entries: Entry[] };

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The saved value of a day as the grid shows it: days (1 / 0.5) for daily-paid, hours for hourly-paid. */
function savedValue(e: Employee | undefined, entry: Entry): string {
  if (e?.payBasis === 'daily') return String(entry.days != null ? Number(entry.days) : Number(entry.hours) > 0 ? 1 : 0);
  return String(Number(entry.hours ?? 0));
}
/** A daily-paid day cycles: not worked → full day → half day → not worked. */
const nextDay = (v: string) => (v === '1' ? '0.5' : v === '0.5' ? '' : '1');

/**
 * Attendance: tick the days a daily-paid employee worked (full or half day), or type the
 * hours an hourly-paid employee worked. A pay run's timesheet is filled from it ("Fill
 * from attendance"): days × daily rate, hours × hourly rate. Days paid by a finalised run
 * are locked.
 */
export default function Attendance() {
  useDocumentTitle('Attendance');
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => iso(startOfWeek(new Date(), { weekStartsOn: 1 })));
  const [search, setSearch] = useState('');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(addDays(parseISO(weekStart), i))), [weekStart]);
  const to = days[6];

  const key = ['attendance', companyId, weekStart];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => invokePayroll<Register>({ method: 'GET_ATTENDANCE', company_id: companyId, from: weekStart, to }),
    enabled: !!companyId,
    retry: (count, err) => !/Unsupported method|not available on the server/i.test(String((err as Error)?.message)) && count < 1,
  });
  const employeesById = useMemo(() => new Map((data?.employees ?? []).map((e) => [e.id, e])), [data]);
  const saved = useMemo(() => Object.fromEntries((data?.entries ?? []).map((e) => [cellKey(e.employee_id, e.work_date), e])), [data]);
  const [cells, setCells] = useState<Record<string, string>>({});
  useEffect(() => {
    setCells(Object.fromEntries((data?.entries ?? []).map((e) => [cellKey(e.employee_id, e.work_date), savedValue(employeesById.get(e.employee_id), e)])));
  }, [data, employeesById]);

  const changed = Object.entries(cells).filter(([k, v]) => {
    const entry = saved[k];
    const before = entry ? savedValue(employeesById.get(entry.employee_id), entry) : '';
    const norm = (x: string) => (x.trim() === '' || Number(x) === 0 ? '' : String(Number(x)));
    return norm(v) !== norm(before);
  });
  const save = useMutation({
    mutationFn: () => invokePayroll<{ saved: number; cleared: number }>({
      method: 'SAVE_ATTENDANCE', company_id: companyId,
      entries: changed.map(([k, v]) => {
        const [employeeId, date] = k.split('|');
        const value = v.trim() === '' ? 0 : Number(v);
        return employeesById.get(employeeId)?.payBasis === 'daily' ? { employeeId, date, days: value } : { employeeId, date, hours: value };
      }),
    }),
    onSuccess: (r) => {
      showSuccess(`Attendance saved (${r.saved} day${r.saved === 1 ? '' : 's'}${r.cleared ? `, ${r.cleared} cleared` : ''}).`);
      queryClient.invalidateQueries({ queryKey: ['attendance', companyId] });
      queryClient.invalidateQueries({ queryKey: ['payroll-timesheet'] });
    },
    onError: (e: Error) => showError(e.message),
  });

  const holidays = new Set(data?.publicHolidays ?? []);
  const employed = (e: Employee, date: string) => (!e.startDate || e.startDate <= date) && (!e.endDate || e.endDate >= date);
  const isWorkday = (date: string) => parseISO(date).getDay() >= 1 && parseISO(date).getDay() <= 5 && !holidays.has(date);
  const normalWeek = (e: Employee) => setCells((prev) => {
    const next = { ...prev };
    for (const d of days) {
      const k = cellKey(e.id, d);
      if (isWorkday(d) && employed(e, d) && !saved[k]?.payroll_run_id && !next[k]?.trim()) next[k] = e.payBasis === 'daily' ? '1' : String(e.hoursPerDay);
    }
    return next;
  });
  const rows = (data?.employees ?? []).filter((e) => !search.trim() || `${e.name} ${e.employeeNumber ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const shift = (n: number) => setWeekStart(iso(addDays(parseISO(weekStart), n)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><CalendarCheck2 className="h-7 w-7" /> Attendance</h1>
          <p className="text-sm text-muted-foreground">Tick the days worked (daily-paid) or enter the hours (hourly-paid). The pay run fills its timesheet from here.</p>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-7)} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="space-y-1">
            <Label htmlFor="attendance-week">Week of</Label>
            <Input id="attendance-week" type="date" value={weekStart} className="w-44"
              onChange={(e) => e.target.value && setWeekStart(iso(startOfWeek(parseISO(e.target.value), { weekStartsOn: 1 })))} />
          </div>
          <Button variant="outline" size="icon" onClick={() => shift(7)} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Week of {format(parseISO(weekStart), 'd MMMM yyyy')}</CardTitle>
          <CardDescription>Daily-paid: click a day once for a full day (✓), again for a half day (½), again to clear. Hourly-paid: type the hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" aria-label="Search employees" />
          {error ? (
            <Alert variant="destructive"><AlertDescription>Attendance could not be loaded: {(error as Error).message}</AlertDescription></Alert>
          ) : isLoading || !data ? <Skeleton className="h-60 w-full" /> : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No daily or hourly-paid employees employed this week. Set "Paid by" on the employee to the day or the hour.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="attendance-grid">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    {days.map((d) => (
                      <TableHead key={d} className="text-center">
                        <div>{format(parseISO(d), 'EEE d')}</div>
                        {holidays.has(d) && <Badge variant="secondary" className="text-[10px]">Public holiday</Badge>}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Week</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => {
                    const daily = e.payBasis === 'daily';
                    const qty = round2(days.reduce((s, d) => s + (Number(cells[cellKey(e.id, d)]) || 0), 0));
                    return (
                      <TableRow key={e.id} data-testid={`attendance-row-${e.id}`}>
                        <TableCell className="min-w-44">
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrency(e.rate ?? 0)} / {daily ? 'day' : 'hour'} · {e.payFrequency}
                            {e.employmentType === 'casual' && <Badge variant="outline" className="ml-1">Casual</Badge>}
                          </div>
                        </TableCell>
                        {days.map((d) => {
                          const k = cellKey(e.id, d);
                          const paid = !!saved[k]?.payroll_run_id;
                          const out = !employed(e, d);
                          const v = cells[k] ?? '';
                          const title = paid ? 'Paid by a finalised payroll run' : out ? 'Not employed on this day' : undefined;
                          return (
                            <TableCell key={d} className="text-center p-1">
                              <div className="flex items-center justify-center gap-0.5">
                                {daily ? (
                                  <Button
                                    type="button" size="sm" variant={Number(v) > 0 ? 'default' : 'outline'} className="h-8 w-12"
                                    aria-label={`${e.name} on ${d}: ${v === '1' ? 'full day' : v === '0.5' ? 'half day' : 'not worked'}`}
                                    disabled={paid || out} title={title}
                                    onClick={() => setCells((p) => ({ ...p, [k]: nextDay(p[k] ?? '') }))}
                                  >
                                    {v === '1' ? '✓' : v === '0.5' ? '½' : ''}
                                  </Button>
                                ) : (
                                  <Input
                                    type="number" step="0.5" min="0" max="24" className="h-8 w-16 text-right px-1"
                                    aria-label={`${e.name} hours on ${d}`} disabled={paid || out} title={title}
                                    value={v} onChange={(ev) => setCells((p) => ({ ...p, [k]: ev.target.value }))}
                                  />
                                )}
                                {paid && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Paid" />}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right whitespace-nowrap" data-testid={`attendance-week-${e.id}`}>
                          <div>{qty ? `${qty} ${daily ? (qty === 1 ? 'day' : 'days') : (qty === 1 ? 'hour' : 'hours')}` : '—'}</div>
                          {qty > 0 && <div className="text-xs font-mono text-muted-foreground">{formatCurrency(round2(qty * (e.rate ?? 0)))}</div>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => normalWeek(e)} aria-label={`Normal week for ${e.name}`}>Normal week</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <Button onClick={() => save.mutate()} disabled={!changed.length || save.isPending} data-testid="save-attendance">
            <Save className="mr-1 h-4 w-4" />{save.isPending ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
