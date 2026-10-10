import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Palmtree, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { invokePayroll } from '../lib/payrollOperations';
import LeaveAccrualPanel from '../components/payroll/LeaveAccrualPanel';
import { formatCurrency } from '../lib/utils';
import { showError, showSuccess } from '../utils/toast';
import { leaveWorkingDays, type LeaveAccrual, type LeaveBalance } from '../lib/payrollRulesEngine/leave';

type LeaveType = { id: string; code: string; name: string; category: string; paid: boolean; accrual: LeaveAccrual; system: boolean; active: boolean };
type TypeBalance = LeaveBalance & { leaveTypeId: string; code: string; name: string; paid: boolean; accrual: LeaveAccrual };
type Overview = {
  asAt: string;
  types: LeaveType[];
  employees: Array<{ id: string; employeeNumber: string | null; name: string; department: string | null; startDate: string | null; balances: TypeBalance[] }>;
};
type Entry = {
  id: string;
  leave_type_id: string;
  entry_type: 'taken' | 'opening_balance' | 'adjustment' | 'payout' | 'forfeit';
  start_date: string | null;
  end_date: string | null;
  effective_date: string;
  days: number;
  status: 'approved' | 'cancelled';
  reason: string | null;
  cancel_reason: string | null;
  payroll_run_id: string | null;
};
type EmployeeLeave = {
  asAt: string;
  employee: { id: string; name: string; startDate: string | null; endDate: string | null; workDaysPerWeek: number | null; dailyRate: number };
  balances: TypeBalance[];
  entries: Entry[];
  types: LeaveType[];
};

const ENTRY_LABEL: Record<Entry['entry_type'], string> = {
  taken: 'Leave taken',
  opening_balance: 'Opening balance',
  adjustment: 'Adjustment',
  payout: 'Paid out',
  forfeit: 'Forfeited',
};
const RULE: Record<LeaveAccrual, string> = {
  bcea_annual: 'BCEA s20: 3 weeks a year (or contract), accrued daily',
  bcea_sick: 'BCEA s22: 6 weeks per 36 months',
  bcea_family: 'BCEA s27: 3 days a year',
  none: 'No balance',
};
const days = (n: number) => `${Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`;
const today = () => format(new Date(), 'yyyy-MM-dd');

/** Record leave, an opening balance, an adjustment or forfeiture for one employee. */
function RecordLeaveDialog({
  open, onClose, employees, types, presetEmployeeId,
}: {
  open: boolean;
  onClose: () => void;
  employees: Array<{ id: string; name: string }>;
  types: LeaveType[];
  presetEmployeeId?: string | null;
}) {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState(presetEmployeeId ?? '');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [entryType, setEntryType] = useState<'taken' | 'opening_balance' | 'adjustment' | 'forfeit'>('taken');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [dayCount, setDayCount] = useState('');
  const [reason, setReason] = useState('');
  const type = types.find((t) => t.id === leaveTypeId);
  const workingDays = entryType === 'taken' && startDate && endDate && endDate >= startDate ? leaveWorkingDays(startDate, endDate, 5) : 0;

  const reset = () => { setLeaveTypeId(''); setEntryType('taken'); setDayCount(''); setReason(''); };
  const save = useMutation({
    mutationFn: () => invokePayroll<{ regenerateRuns: string[] }>({
      method: 'RECORD_LEAVE', company_id: activeCompany?.id, employeeId: presetEmployeeId ?? employeeId, leaveTypeId, entryType,
      ...(entryType === 'taken' ? { startDate, endDate, days: dayCount.trim() ? Number(dayCount) : undefined } : { effectiveDate, days: Number(dayCount) }),
      reason: reason.trim() || undefined,
    }),
    onSuccess: (result) => {
      showSuccess(result.regenerateRuns?.length
        ? 'Leave recorded. A draft payroll run covers these dates: regenerate its payslips to apply the unpaid leave.'
        : 'Leave recorded.');
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      reset();
      onClose();
    },
    onError: (error: Error) => showError(error.message),
  });

  const balanceKind = type && type.accrual !== 'none';
  const canSave = !!(presetEmployeeId ?? employeeId) && !!leaveTypeId && (
    entryType === 'taken'
      ? !!startDate && !!endDate && endDate >= startDate
      : !!effectiveDate && Number(dayCount) !== 0 && !Number.isNaN(Number(dayCount)) && (entryType === 'opening_balance' || reason.trim().length >= 5)
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="record-leave-dialog">
        <DialogHeader>
          <DialogTitle>Record leave</DialogTitle>
          <DialogDescription>Weekends and public holidays inside the dates are not counted as leave days.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!presetEmployeeId && (
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger aria-label="Employee"><SelectValue placeholder="Choose an employee…" /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Leave type</Label>
              <Select value={leaveTypeId} onValueChange={(v) => { setLeaveTypeId(v); if (types.find((t) => t.id === v)?.accrual === 'none') setEntryType('taken'); }}>
                <SelectTrigger aria-label="Leave type"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{types.filter((t) => t.active).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (unpaid)'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Entry</Label>
              <Select value={entryType} onValueChange={(v) => setEntryType(v as typeof entryType)}>
                <SelectTrigger aria-label="Entry"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="taken">Leave taken</SelectItem>
                  {balanceKind && <SelectItem value="opening_balance">Opening balance (take-on)</SelectItem>}
                  {balanceKind && <SelectItem value="adjustment">Adjustment</SelectItem>}
                  {type?.accrual === 'bcea_annual' && <SelectItem value="forfeit">Forfeited</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          {entryType === 'taken' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="leave-start">First day</Label>
                <Input id="leave-start" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="leave-end">Last day</Label>
                <Input id="leave-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="leave-days">Days</Label>
                <Input id="leave-days" type="number" step="0.5" min="0.5" value={dayCount} placeholder={workingDays ? String(workingDays) : ''} onChange={(e) => setDayCount(e.target.value)} />
              </div>
              <p className="sm:col-span-3 text-xs text-muted-foreground">
                {workingDays} working day{workingDays === 1 ? '' : 's'} on a Monday–Friday week; the employee's own working week is applied when saved. Enter fewer days for half days.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="leave-effective">{entryType === 'opening_balance' ? 'Balance as at' : 'Date'}</Label>
                <Input id="leave-effective" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="leave-adjust-days">Days{entryType === 'adjustment' ? ' (negative to reduce)' : ''}</Label>
                <Input id="leave-adjust-days" type="number" step="0.5" value={dayCount} onChange={(e) => setDayCount(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="leave-reason">Reason{entryType === 'adjustment' || entryType === 'forfeit' ? '' : ' (optional)'}</Label>
            <Textarea id="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending} data-testid="save-leave">{save.isPending ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One employee's balances and register. */
function EmployeeLeaveSheet({ employeeId, asAt, onClose }: { employeeId: string | null; asAt: string; onClose: () => void }) {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [recordOpen, setRecordOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Entry | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['leave', 'employee', activeCompany?.id, employeeId, asAt],
    queryFn: () => invokePayroll<EmployeeLeave>({ method: 'GET_EMPLOYEE_LEAVE', company_id: activeCompany?.id, employeeId, asAt }),
    enabled: !!activeCompany?.id && !!employeeId,
  });
  const cancel = useMutation({
    mutationFn: () => invokePayroll<{ regenerateRuns: string[] }>({ method: 'CANCEL_LEAVE', company_id: activeCompany?.id, entryId: cancelling?.id, reason: cancelReason.trim() }),
    onSuccess: (result) => {
      showSuccess(result.regenerateRuns?.length ? 'Leave cancelled. Regenerate the draft payroll run that covers these dates.' : 'Leave cancelled.');
      setCancelling(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (error: Error) => showError(error.message),
  });
  const typeName = (id: string) => data?.types.find((t) => t.id === id)?.name ?? '';

  return (
    <Sheet open={!!employeeId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="employee-leave">
        <SheetHeader>
          <SheetTitle>{data?.employee.name ?? 'Leave'}</SheetTitle>
          <SheetDescription>
            Balances as at {asAt}{data?.employee.startDate ? ` · employed since ${data.employee.startDate}` : ''}
            {data?.employee.dailyRate ? ` · daily rate ${formatCurrency(data.employee.dailyRate)}` : ''}
          </SheetDescription>
        </SheetHeader>
        {isLoading || !data ? <Skeleton className="h-60 w-full mt-4" /> : (
          <div className="space-y-4 mt-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {data.balances.filter((b) => b.accrual !== 'none').map((b) => (
                <Card key={b.leaveTypeId}>
                  <CardContent className="p-3 space-y-1">
                    <div className="text-sm font-medium">{b.name}</div>
                    <div className="text-2xl font-semibold" data-testid={`leave-balance-${b.code}`}>{days(b.balance)} <span className="text-sm font-normal text-muted-foreground">days</span></div>
                    <div className="text-xs text-muted-foreground">
                      {days(b.entitled)} entitled · {days(b.taken)} taken{b.booked ? ` · ${days(b.booked)} booked` : ''}
                      {b.cycleStart ? ` · cycle ${b.cycleStart} – ${b.cycleEnd}` : ''}
                    </div>
                    {b.note && <div className="text-xs text-muted-foreground">{b.note}</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button onClick={() => setRecordOpen(true)}><Plus className="mr-1 h-4 w-4" />Record leave</Button>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No leave recorded yet.</TableCell></TableRow>
                )}
                {data.entries.map((e) => (
                  <TableRow key={e.id} className={e.status === 'cancelled' ? 'opacity-60' : undefined}>
                    <TableCell className="whitespace-nowrap text-sm">{e.start_date ? `${e.start_date} – ${e.end_date}` : e.effective_date}</TableCell>
                    <TableCell className="text-sm">{typeName(e.leave_type_id)}</TableCell>
                    <TableCell className="text-sm">
                      {ENTRY_LABEL[e.entry_type]}
                      {e.status === 'cancelled' && <Badge variant="secondary" className="ml-2">Cancelled</Badge>}
                      {(e.reason || e.cancel_reason) && <div className="text-xs text-muted-foreground">{e.cancel_reason ?? e.reason}</div>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{days(e.days)}</TableCell>
                    <TableCell className="text-right">
                      {e.status === 'approved' && e.entry_type !== 'payout' && (
                        <Button size="sm" variant="ghost" onClick={() => setCancelling(e)}>Cancel</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {cancelling && (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="leave-cancel-reason">Why is this {ENTRY_LABEL[cancelling.entry_type].toLowerCase()} entry cancelled?</Label>
                <Textarea id="leave-cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCancelling(null)}>Keep it</Button>
                  <Button variant="destructive" disabled={cancelReason.trim().length < 5 || cancel.isPending} onClick={() => cancel.mutate()}>Cancel entry</Button>
                </div>
              </div>
            )}
            <RecordLeaveDialog
              open={recordOpen}
              onClose={() => setRecordOpen(false)}
              employees={[{ id: data.employee.id, name: data.employee.name }]}
              types={data.types}
              presetEmployeeId={data.employee.id}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LeaveTypesTab({ types }: { types: LeaveType[] }) {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [paid, setPaid] = useState(false);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => invokePayroll({ method: 'SAVE_LEAVE_TYPE', company_id: activeCompany?.id, ...body }),
    onSuccess: () => { showSuccess('Leave type saved.'); setName(''); queryClient.invalidateQueries({ queryKey: ['leave'] }); },
    onError: (error: Error) => showError(error.message),
  });
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Leave type</TableHead>
            <TableHead>Pay</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead className="text-right">Offered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.name}{t.system && <Badge variant="outline" className="ml-2">Standard</Badge>}</TableCell>
              <TableCell>{t.paid ? 'Paid' : 'Unpaid — reduces pay'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{RULE[t.accrual]}</TableCell>
              <TableCell className="text-right">
                <Switch
                  checked={t.active}
                  disabled={t.system && t.accrual !== 'none'}
                  onCheckedChange={(active) => save.mutate({ id: t.id, name: t.name, paid: t.paid, active })}
                  aria-label={`Offer ${t.name}`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="leave-type-name">New leave type</Label>
          <Input id="leave-type-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Study leave" className="w-64" />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="leave-type-paid" checked={paid} onCheckedChange={setPaid} />
          <Label htmlFor="leave-type-paid" className="font-normal">Paid</Label>
        </div>
        <Button onClick={() => save.mutate({ name: name.trim(), paid })} disabled={name.trim().length < 2 || save.isPending}>Add leave type</Button>
      </div>
      <p className="text-xs text-muted-foreground">Custom leave types have no balance: they record leave taken. Unpaid types reduce the basic salary in the pay period.</p>
    </div>
  );
}

/**
 * Leave management: BCEA balances per employee, the leave register, and leave types.
 * Unpaid leave reduces pay in the payroll run covering it; leave owing to a leaver is paid
 * out from the run. Balances are worked out on the server from the register.
 */
export default function Leave() {
  useDocumentTitle('Leave');
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const [asAt, setAsAt] = useState(today());
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['leave', 'overview', companyId, asAt],
    queryFn: () => invokePayroll<Overview>({ method: 'GET_LEAVE_OVERVIEW', company_id: companyId, asAt }),
    enabled: !!companyId,
    retry: (count, err) => !/Unsupported method|not available on the server/i.test(String((err as Error)?.message)) && count < 1,
  });
  const balanceTypes = (data?.types ?? []).filter((t) => t.accrual !== 'none');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.employees ?? []).filter((e) => !q || `${e.name} ${e.employeeNumber ?? ''} ${e.department ?? ''}`.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Palmtree className="h-7 w-7" /> Leave</h1>
          <p className="text-sm text-muted-foreground">Annual, sick and family responsibility leave under the BCEA, and the leave register.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="leave-as-at">Balances as at</Label>
            <Input id="leave-as-at" type="date" value={asAt} onChange={(e) => e.target.value && setAsAt(e.target.value)} className="w-44" />
          </div>
          <Button onClick={() => setRecordOpen(true)} disabled={!data}><Plus className="mr-1 h-4 w-4" />Record leave</Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive"><AlertDescription>Leave could not be loaded: {(error as Error).message}</AlertDescription></Alert>
      ) : (
        <Tabs defaultValue="balances">
          <TabsList>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="types">Leave types</TabsTrigger>
            <TabsTrigger value="accrual">Year-end accrual</TabsTrigger>
          </TabsList>
          <TabsContent value="balances" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Balances</CardTitle>
                <CardDescription>Days available as at {asAt}. Open an employee for the cycle, what was taken and the register.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" aria-label="Search employees" />
                {isLoading || !data ? <Skeleton className="h-60 w-full" /> : (
                  <div className="overflow-x-auto">
                    <Table data-testid="leave-balances">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          {balanceTypes.map((t) => <TableHead key={t.id} className="text-right">{t.name}</TableHead>)}
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.length === 0 && (
                          <TableRow><TableCell colSpan={balanceTypes.length + 2} className="text-sm text-muted-foreground">No employees employed on this date.</TableCell></TableRow>
                        )}
                        {rows.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell>
                              <div className="font-medium">{e.name}</div>
                              <div className="text-xs text-muted-foreground">{[e.employeeNumber, e.department].filter(Boolean).join(' · ')}</div>
                            </TableCell>
                            {balanceTypes.map((t) => {
                              const b = e.balances.find((x) => x.leaveTypeId === t.id);
                              return (
                                <TableCell key={t.id} className={`text-right font-mono ${b && b.balance < 0 ? 'text-destructive' : ''}`}>
                                  {b ? days(b.balance) : '—'}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => setSelected(e.id)} aria-label={`Leave for ${e.name}`}>Open</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="accrual" className="mt-4">
            <LeaveAccrualPanel />
          </TabsContent>
          <TabsContent value="types" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {data ? <LeaveTypesTab types={data.types} /> : <Skeleton className="h-40 w-full" />}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <EmployeeLeaveSheet employeeId={selected} asAt={asAt} onClose={() => setSelected(null)} />
      {data && (
        <RecordLeaveDialog
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          employees={data.employees.map((e) => ({ id: e.id, name: e.name }))}
          types={data.types}
        />
      )}
    </div>
  );
}
