import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { endOfMonth, endOfQuarter, format, startOfMonth, startOfQuarter, subMonths } from 'date-fns';
import { CalendarCheck, Lock, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useEnterpriseCalendar } from '../../hooks/useEnterpriseCalendar';
import {
  invokeFinancialClose,
  type EfcpCloseType,
  type EfcpCloseWorkspace,
} from '../../lib/financialClose/api';
import { closeTypeLabel, periodStatusLabel } from '../../lib/financialClose/presentation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { showError, showSuccess } from '../../utils/toast';

/**
 * EFCP V6.8.0 — Financial Close home.
 * The accountant opens a Month-End, Quarter-End, or Year-End close.
 * The platform builds the checklist automatically.
 */
export default function FinancialCloseHome() {
  const { activeCompany } = useAuth();
  const { startDate: fyStart, endDate: fyEnd, yearCode } = useEnterpriseCalendar(activeCompany?.id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const companyId = activeCompany?.id;

  const [creating, setCreating] = useState(false);
  const [closeType, setCloseType] = useState<EfcpCloseType>('month_end');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const listQuery = useQuery({
    queryKey: ['efcp_workspaces', companyId],
    queryFn: () =>
      invokeFinancialClose<EfcpCloseWorkspace[]>(companyId!, 'LIST_CLOSE_WORKSPACES'),
    enabled: !!companyId,
  });

  const defaults = useMemo(() => {
    const prevMonth = subMonths(new Date(), 1);
    return {
      month_end: {
        start: format(startOfMonth(prevMonth), 'yyyy-MM-dd'),
        end: format(endOfMonth(prevMonth), 'yyyy-MM-dd'),
        label: `${format(prevMonth, 'MMMM yyyy')} Close`,
      },
      quarter_end: {
        start: format(startOfQuarter(prevMonth), 'yyyy-MM-dd'),
        end: format(endOfQuarter(prevMonth), 'yyyy-MM-dd'),
        label: `Q${Math.floor(prevMonth.getMonth() / 3) + 1} ${prevMonth.getFullYear()} Close`,
      },
      year_end: {
        start: fyStart || format(startOfMonth(prevMonth), 'yyyy-MM-dd'),
        end: fyEnd || format(endOfMonth(prevMonth), 'yyyy-MM-dd'),
        label: `${yearCode || 'Financial Year'} Close`,
      },
    } as const;
  }, [fyStart, fyEnd, yearCode]);

  const effStart = startDate || defaults[closeType].start;
  const effEnd = endDate || defaults[closeType].end;

  const createMutation = useMutation({
    mutationFn: () =>
      invokeFinancialClose<{ id: string; existing: boolean }>(companyId!, 'CREATE_CLOSE_WORKSPACE', {
        close_type: closeType,
        label: defaults[closeType].label,
        start_date: effStart,
        end_date: effEnd,
      }),
    onSuccess: (res) => {
      showSuccess(res.existing ? 'Close already open for this period' : 'Close opened — checklist prepared automatically');
      qc.invalidateQueries({ queryKey: ['efcp_workspaces', companyId] });
      navigate(`/financial-close/${res.id}`);
    },
    onError: (e: Error) => showError(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financial Close</h1>
          <p className="text-sm text-muted-foreground">
            Verify the accounting period before Annual Financial Statements are prepared.
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          New Close
        </Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open a Close</CardTitle>
            <CardDescription>
              Choose the period. The close checklist is built automatically — no manual setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Close type</Label>
                <Select value={closeType} onValueChange={(v) => setCloseType(v as EfcpCloseType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month_end">Month-End Close</SelectItem>
                    <SelectItem value="quarter_end">Quarter-End Close</SelectItem>
                    <SelectItem value="year_end">Year-End Close</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Period start</Label>
                <Input
                  type="date"
                  value={effStart}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Period end</Label>
                <Input type="date" value={effEnd} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <CalendarCheck className="mr-2 h-4 w-4" />
              Open {closeTypeLabel(closeType)}
            </Button>
          </CardContent>
        </Card>
      )}

      {listQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (listQuery.data || []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No closes yet. Open your first Month-End, Quarter-End, or Year-End close.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(listQuery.data || []).map((ws) => (
            <Card
              key={ws.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => navigate(`/financial-close/${ws.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{ws.label}</CardTitle>
                  {ws.period_status === 'locked' && (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <CardDescription>{closeTypeLabel(ws.close_type)}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {ws.start_date} → {ws.end_date}
                </span>
                <Badge variant={ws.period_status === 'locked' ? 'default' : 'secondary'}>
                  {periodStatusLabel(ws.period_status)}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
