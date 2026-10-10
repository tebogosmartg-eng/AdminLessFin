import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Download, Plus, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';

type Values = {
  ordinaryHours: number;
  daysWorked: number;
  overtimeHours: number;
  sundayHours: number;
  publicHolidayHours: number;
  publicHolidayDaysPaid: number;
};
type Row = {
  employeeId: string;
  name: string;
  employeeNumber: string | null;
  employmentType: string | null;
  payBasis: 'salaried' | 'hourly' | 'daily';
  rate: number | null;
  hourlyWage: number;
  dailyWage: number;
  hoursPerDay: number;
  worksSundays: boolean;
  taxMethod: 'tables' | 'non_standard';
  timesheet: Values | null;
  source: 'manual' | 'work_module' | null;
  suggestedPublicHolidays: string[];
  workHours: { ordinary: number; overtime: number; sunday: number; publicHoliday: number; daysWorked: number; factIds: string[] } | null;
  estimatedPay: number;
  issues: Array<{ code: string; message: string }>;
};
type Timesheet = {
  run: { id: string; status: string; payPeriodStart: string; payPeriodEnd: string; payFrequency: string };
  rows: Row[];
  salaried: Array<{ employeeId: string; name: string }>;
  workHoursWaiting: number;
};

const EMPTY: Values = { ordinaryHours: 0, daysWorked: 0, overtimeHours: 0, sundayHours: 0, publicHolidayHours: 0, publicHolidayDaysPaid: 0 };
type Draft = Record<keyof Values, string>;
const toDraft = (v: Values | null): Draft => Object.fromEntries(Object.entries(v ?? EMPTY).map(([k, n]) => [k, n ? String(n) : ''])) as Draft;

/**
 * The run's timesheet: hours (hourly pay) or days (daily pay) worked, overtime, Sunday and
 * public holiday hours, typed in or imported from approved Work Management hours. Hourly and
 * daily-paid employees are paid only for what is on it; salaried employees can be added for
 * overtime. Regenerate payslips after saving.
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
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [added, setAdded] = useState<Array<{ employeeId: string; name: string }>>([]);

  useEffect(() => {
    if (!data) return;
    setDrafts(Object.fromEntries(data.rows.map((r) => [r.employeeId, toDraft(r.timesheet)])));
    setAdded([]);
  }, [data]);

  const refresh = () => { queryClient.invalidateQueries({ queryKey: key }); onSaved?.(); };
  const save = useMutation({
    mutationFn: () => invokePayroll<{ saved: Array<{ employeeId: string; issues: unknown[] }> }>({
      method: 'SAVE_TIMESHEET', company_id: companyId, runId,
      rows: [...(data?.rows ?? []).map((r) => r.employeeId), ...added.map((a) => a.employeeId)].map((employeeId) => {
        const d = drafts[employeeId] ?? toDraft(null);
        const row = data?.rows.find((r) => r.employeeId === employeeId);
        return {
          employeeId,
          ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim() ? Number(v) : 0])),
          source: row?.source ?? 'manual',
        };
      }),
    }),
    onSuccess: () => { showSuccess('Timesheet saved. Regenerate payslips to apply it.'); refresh(); },
    onError: (e: Error) => showError(e.message),
  });
  const importHours = useMutation({
    mutationFn: () => invokePayroll<{ imported: number }>({ method: 'IMPORT_WORK_HOURS', company_id: companyId, runId }),
    onSuccess: (r) => { showSuccess(r.imported ? `Approved hours imported for ${r.imported} employee${r.imported === 1 ? '' : 's'}.` : 'No approved hours waiting in Work Management for this period.'); refresh(); },
    onError: (e: Error) => showError(e.message),
  });

  const set = (employeeId: string, field: keyof Values, value: string) =>
    setDrafts((prev) => ({ ...prev, [employeeId]: { ...(prev[employeeId] ?? toDraft(null)), [field]: value } }));

  const rows: Array<Row | { employeeId: string; name: string; payBasis: 'salaried'; added: true }> = useMemo(
    () => [...(data?.rows ?? []), ...added.map((a) => ({ ...a, payBasis: 'salaried' as const, added: true as const }))],
    [data, added],
  );
  const available = (data?.salaried ?? []).filter((s) => !added.some((a) => a.employeeId === s.employeeId));

  const cell = (employeeId: string, field: keyof Values, label: string, disabled = false) => (
    <Input
      type="number" step="0.5" min="0" className="w-20 h-8 text-right" disabled={disabled}
      aria-label={label} value={drafts[employeeId]?.[field] ?? ''}
      onChange={(e) => set(employeeId, field, e.target.value)}
    />
  );

  return (
    <Card data-testid="timesheet-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Timesheet</CardTitle>
        <CardDescription>
          Hours and days worked this period. Hourly and daily-paid employees are paid only for what is captured here; overtime is 1.5×,
          Sunday work 2× (1.5× for regular Sunday workers) and public holiday work 2× (BCEA). Add a salaried employee to pay overtime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="destructive"><AlertDescription>The timesheet could not be loaded: {(error as Error).message}</AlertDescription></Alert>
        ) : isLoading || !data ? <Skeleton className="h-40 w-full" /> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => importHours.mutate()} disabled={importHours.isPending || data.run.status !== 'draft'} data-testid="import-work-hours">
                <Download className="mr-1 h-4 w-4" />Import approved hours{data.workHoursWaiting ? ` (${data.workHoursWaiting} entries)` : ''}
              </Button>
              {available.length > 0 && (
                <Select value="" onValueChange={(id) => { const s = available.find((x) => x.employeeId === id); if (s) setAdded((p) => [...p, s]); }}>
                  <SelectTrigger className="h-9 w-64" aria-label="Add a salaried employee for overtime"><Plus className="mr-1 h-4 w-4" /><SelectValue placeholder="Add salaried employee (overtime)" /></SelectTrigger>
                  <SelectContent>{available.map((s) => <SelectItem key={s.employeeId} value={s.employeeId}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hourly or daily-paid employees on this {data.run.payFrequency} run. Set "Paid by" on the employee to the hour or the day.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead className="text-right">Overtime h</TableHead>
                      <TableHead className="text-right">Sunday h</TableHead>
                      <TableHead className="text-right">Public holiday h</TableHead>
                      <TableHead className="text-right">Public holidays paid (days)</TableHead>
                      <TableHead className="text-right">Estimate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const full = 'rate' in r ? r : null;
                      const basis = r.payBasis;
                      return (
                        <TableRow key={r.employeeId} data-testid={`timesheet-row-${r.employeeId}`}>
                          <TableCell className="min-w-48">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {basis === 'hourly' ? `${formatCurrency(full?.rate ?? 0)}/hour` : basis === 'daily' ? `${formatCurrency(full?.rate ?? 0)}/day (${full?.hoursPerDay} h)` : 'Salaried: overtime only'}
                              {full?.employmentType === 'casual' && <Badge variant="outline" className="ml-1">Casual</Badge>}
                              {full?.taxMethod === 'non_standard' && <Badge variant="secondary" className="ml-1">Tax 25%</Badge>}
                              {full?.source === 'work_module' && <Badge variant="outline" className="ml-1">From Work Management</Badge>}
                            </div>
                            {full?.workHours && full.source !== 'work_module' && (
                              <div className="text-xs text-muted-foreground">Approved in Work Management: {full.workHours.ordinary} h + {full.workHours.overtime} h overtime</div>
                            )}
                            {full?.issues.map((i) => <div key={i.code} className="text-xs text-destructive">{i.message}</div>)}
                          </TableCell>
                          <TableCell className="text-right">{cell(r.employeeId, 'ordinaryHours', `Hours worked by ${r.name}`, basis !== 'hourly')}</TableCell>
                          <TableCell className="text-right">{cell(r.employeeId, 'daysWorked', `Days worked by ${r.name}`, basis !== 'daily')}</TableCell>
                          <TableCell className="text-right">{cell(r.employeeId, 'overtimeHours', `Overtime hours for ${r.name}`)}</TableCell>
                          <TableCell className="text-right">{cell(r.employeeId, 'sundayHours', `Sunday hours for ${r.name}`)}</TableCell>
                          <TableCell className="text-right">{cell(r.employeeId, 'publicHolidayHours', `Public holiday hours for ${r.name}`)}</TableCell>
                          <TableCell className="text-right">
                            {cell(r.employeeId, 'publicHolidayDaysPaid', `Public holidays paid to ${r.name}`, basis === 'salaried')}
                            {full && full.suggestedPublicHolidays.length > 0 && (
                              <div className="text-xs text-muted-foreground">{full.suggestedPublicHolidays.length} on working days: {full.suggestedPublicHolidays.join(', ')}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">{full ? formatCurrency(full.estimatedPay) : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {rows.length > 0 && (
              <Button onClick={() => save.mutate()} disabled={save.isPending || data.run.status !== 'draft'} data-testid="save-timesheet">
                <Save className="mr-1 h-4 w-4" />{save.isPending ? 'Saving…' : 'Save timesheet'}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Estimates use the saved timesheet; the payslip is worked out when payslips are generated. UIF is not deducted for anyone working under 24 hours in the month.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
