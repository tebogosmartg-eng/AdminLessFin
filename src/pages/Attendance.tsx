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
import { Switch } from '../components/ui/switch';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { invokePayroll } from '../lib/payrollOperations';
import { showError, showSuccess } from '../utils/toast';

type Employee = {
  id: string;
  name: string;
  employeeNumber: string | null;
  payBasis: 'salaried' | 'hourly' | 'daily';
  payFrequency: string;
  employmentType: string | null;
  hoursPerDay: number;
  startDate: string | null;
  endDate: string | null;
};
type Entry = { id: string; employee_id: string; work_date: string; hours: number; note: string | null; payroll_run_id: string | null };
type Register = { from: string; to: string; publicHolidays: string[]; employees: Employee[]; entries: Entry[] };

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

/**
 * Daily attendance register: hours worked per employee per day, recorded during the week.
 * A payroll run's timesheet is filled from it ("Fill from attendance register"); overtime
 * per day, Sunday and public holiday hours are worked out from the days. Days paid by a
 * finalised run are locked.
 */
export default function Attendance() {
  useDocumentTitle('Attendance');
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => iso(startOfWeek(new Date(), { weekStartsOn: 1 })));
  const [includeSalaried, setIncludeSalaried] = useState(false);
  const [search, setSearch] = useState('');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(addDays(parseISO(weekStart), i))), [weekStart]);
  const to = days[6];

  const key = ['attendance', companyId, weekStart, includeSalaried];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => invokePayroll<Register>({ method: 'GET_ATTENDANCE', company_id: companyId, from: weekStart, to, includeSalaried }),
    enabled: !!companyId,
    retry: (count, err) => !/Unsupported method|not available on the server/i.test(String((err as Error)?.message)) && count < 1,
  });
  const [cells, setCells] = useState<Record<string, string>>({});
  const saved = useMemo(() => Object.fromEntries((data?.entries ?? []).map((e) => [cellKey(e.employee_id, e.work_date), e])), [data]);
  useEffect(() => {
    setCells(Object.fromEntries((data?.entries ?? []).map((e) => [cellKey(e.employee_id, e.work_date), String(Number(e.hours))])));
  }, [data]);

  const changed = Object.entries(cells).filter(([k, v]) => {
    const before = saved[k] ? String(Number(saved[k].hours)) : '';
    return (v.trim() === '' ? '' : String(Number(v))) !== before;
  });
  const save = useMutation({
    mutationFn: () => invokePayroll<{ saved: number; cleared: number }>({
      method: 'SAVE_ATTENDANCE', company_id: companyId,
      entries: changed.map(([k, v]) => { const [employeeId, date] = k.split('|'); return { employeeId, date, hours: v.trim() === '' ? 0 : Number(v) }; }),
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
      if (isWorkday(d) && employed(e, d) && !saved[k]?.payroll_run_id && !next[k]?.trim()) next[k] = String(e.hoursPerDay);
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
          <p className="text-sm text-muted-foreground">Hours worked each day. A pay run's timesheet is filled from here; overtime, Sunday and public holiday hours are worked out per day.</p>
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
          <CardDescription>Type the hours worked (blank = not worked). "Normal week" fills the working days with the employee's ordinary day; for daily-paid staff a full day is their ordinary day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <Input placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" aria-label="Search employees" />
            <div className="flex items-center gap-2">
              <Switch id="include-salaried" checked={includeSalaried} onCheckedChange={setIncludeSalaried} />
              <Label htmlFor="include-salaried" className="font-normal">Include salaried employees (for overtime)</Label>
            </div>
          </div>
          {error ? (
            <Alert variant="destructive"><AlertDescription>Attendance could not be loaded: {(error as Error).message}</AlertDescription></Alert>
          ) : isLoading || !data ? <Skeleton className="h-60 w-full" /> : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hourly or daily-paid employees employed this week. Set "Paid by" on the employee to the hour or the day.</p>
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
                        {!holidays.has(d) && parseISO(d).getDay() === 0 && <span className="text-[10px] text-muted-foreground">Sunday</span>}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => {
                    const total = days.reduce((s, d) => s + (Number(cells[cellKey(e.id, d)]) || 0), 0);
                    return (
                      <TableRow key={e.id} data-testid={`attendance-row-${e.id}`}>
                        <TableCell className="min-w-44">
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.payBasis === 'hourly' ? 'Hourly' : e.payBasis === 'daily' ? 'Daily' : 'Salaried'} · {e.payFrequency} · {e.hoursPerDay} h day
                            {e.employmentType === 'casual' && <Badge variant="outline" className="ml-1">Casual</Badge>}
                          </div>
                        </TableCell>
                        {days.map((d) => {
                          const k = cellKey(e.id, d);
                          const paid = !!saved[k]?.payroll_run_id;
                          const out = !employed(e, d);
                          return (
                            <TableCell key={d} className="text-center p-1">
                              <div className="flex items-center justify-center gap-0.5">
                                <Input
                                  type="number" step="0.5" min="0" max="24" className="h-8 w-16 text-right px-1"
                                  aria-label={`${e.name} hours on ${d}`} disabled={paid || out}
                                  title={paid ? 'Paid by a finalised payroll run' : out ? 'Not employed on this day' : undefined}
                                  value={cells[k] ?? ''} onChange={(ev) => setCells((p) => ({ ...p, [k]: ev.target.value }))}
                                />
                                {paid && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Paid" />}
                                {!paid && !out && e.payBasis === 'daily' && !cells[k]?.trim() && (
                                  <Button size="sm" variant="ghost" className="h-8 px-1" aria-label={`${e.name} full day on ${d}`}
                                    onClick={() => setCells((p) => ({ ...p, [k]: String(e.hoursPerDay) }))}>✓</Button>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-mono">{total ? Math.round(total * 100) / 100 : '—'}</TableCell>
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
          <div className="flex items-center gap-3">
            <Button onClick={() => save.mutate()} disabled={!changed.length || save.isPending} data-testid="save-attendance">
              <Save className="mr-1 h-4 w-4" />{save.isPending ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
            </Button>
            <p className="text-xs text-muted-foreground">A shift shorter than the minimum paid shift (Payroll settings → Pay rules) is paid as the minimum.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
