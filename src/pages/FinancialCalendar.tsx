import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { expenseClaimsQuery, payrollWorkspaceQuery } from '../lib/queries';
import { buildPayrollCalendarEvents } from '../lib/payrollIntelligence';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  Repeat,
  AlertCircle,
} from 'lucide-react';
import {
  addMonths,
  subMonths,
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isPast,
  isToday,
  parseISO,
  addDays,
  compareAsc,
} from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { navigateToCalendarEvent, type CalendarEventType } from '../lib/boe/calendarNavigation';
import LifecycleContextBadge from '../components/boe/LifecycleContextBadge';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';

type EventType =
  | 'invoice'
  | 'bill'
  | 'payroll'
  | 'recurring_invoice'
  | 'recurring_bill'
  | 'payroll_review'
  | 'claim_deadline'
  | 'payslip_release';

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  type: EventType;
  status: string;
  amount?: number;
  description?: string;
};

const EVENT_META: Record<
  EventType,
  { label: string; color: string; direction: 'in' | 'out' | 'neutral' }
> = {
  invoice: {
    label: 'Receivable',
    color:
      'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
    direction: 'in',
  },
  bill: {
    label: 'Payable',
    color:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    direction: 'out',
  },
  payroll: {
    label: 'Payroll',
    color:
      'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    direction: 'out',
  },
  recurring_invoice: {
    label: 'Recurring receivable',
    color:
      'bg-green-50 text-green-600 border-dashed border-green-200 dark:bg-green-950/30 dark:text-green-400',
    direction: 'in',
  },
  recurring_bill: {
    label: 'Recurring payable',
    color:
      'bg-red-50 text-red-600 border-dashed border-red-200 dark:bg-red-950/30 dark:text-red-400',
    direction: 'out',
  },
  payroll_review: {
    label: 'Payroll review',
    color:
      'bg-blue-50 text-blue-700 border-dashed border-blue-300 dark:bg-blue-950/40 dark:text-blue-300',
    direction: 'neutral',
  },
  claim_deadline: {
    label: 'Claim deadline',
    color:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
    direction: 'neutral',
  },
  payslip_release: {
    label: 'Payslip release',
    color:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300',
    direction: 'neutral',
  },
};

const ALL_EVENT_TYPES = Object.keys(EVENT_META) as EventType[];

function isEventOverdue(event: CalendarEvent): boolean {
  if (event.status === 'paid' || event.status === 'void' || event.status === 'scheduled') {
    return false;
  }
  const eventDate = parseISO(event.date);
  return isPast(eventDate) && !isToday(eventDate);
}

const FinancialCalendar = () => {
  useDocumentTitle('Operations Calendar');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES));

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar_events', activeCompany?.id, format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      if (!activeCompany) return [];
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const visualStart = startOfWeek(start);
      const visualEnd = endOfWeek(end);

      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          company_id: activeCompany.id,
          start_date: format(visualStart, 'yyyy-MM-dd'),
          end_date: format(visualEnd, 'yyyy-MM-dd'),
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  const { data: payrollWorkspace } = useQuery({
    ...payrollWorkspaceQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: expenseClaims = [] } = useQuery({
    ...expenseClaimsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const allEvents = useMemo(() => {
    const supplemental: CalendarEvent[] = buildPayrollCalendarEvents(payrollWorkspace, expenseClaims).map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      type: e.type as EventType,
      status: e.status,
      amount: 'amount' in e ? (e as { amount?: number }).amount : undefined,
      description: 'description' in e ? (e as { description?: string }).description : undefined,
    }));
    const merged: CalendarEvent[] = [...events, ...supplemental];
    const seen = new Set<string>();
    return merged.filter((e) => {
      const key = `${e.type}-${e.id}-${e.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [events, payrollWorkspace, expenseClaims]);

  const filteredEvents = useMemo(
    () => allEvents.filter((event) => activeFilters.has(event.type)),
    [allEvents, activeFilters]
  );

  const monthStats = useMemo(() => {
    const inMonth = filteredEvents.filter((event) =>
      isSameMonth(parseISO(event.date), currentMonth)
    );
    const receivables = inMonth.filter(
      (e) => e.type === 'invoice' || e.type === 'recurring_invoice'
    );
    const payables = inMonth.filter((e) => e.type === 'bill' || e.type === 'recurring_bill');
    const overdue = inMonth.filter(isEventOverdue);

    return {
      total: inMonth.length,
      receivableTotal: receivables.reduce((sum, e) => sum + (e.amount ?? 0), 0),
      payableTotal: payables.reduce((sum, e) => sum + (e.amount ?? 0), 0),
      overdueCount: overdue.length,
      payrollCount: inMonth.filter(
        (e) =>
          e.type === 'payroll' ||
          e.type === 'payroll_review' ||
          e.type === 'payslip_release'
      ).length,
    };
  }, [filteredEvents, currentMonth]);

  const upcomingEvents = useMemo(() => {
    const horizon = addDays(new Date(), 14);
    return filteredEvents
      .filter((event) => {
        const date = parseISO(event.date);
        return !isPast(date) || isToday(date);
      })
      .filter((event) => parseISO(event.date) <= horizon)
      .sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)))
      .slice(0, 8);
  }, [filteredEvents]);

  const selectedDayEvents = useMemo(
    () => filteredEvents.filter((event) => isSameDay(parseISO(event.date), selectedDay)),
    [filteredEvents, selectedDay]
  );

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDay(today);
  };

  const toggleFilter = (type: EventType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return prev;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth)),
  });

  const handleEventClick = (event: CalendarEvent) => {
    navigateToCalendarEvent(navigate, event.type as CalendarEventType, event.id);
  };

  return (
    <div className="section-stack">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Operations Calendar</h1>
          <p className="text-muted-foreground">
            Your financial deadline command centre — receivables, payables, payroll and recurring
            schedules in one view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[10rem] text-center font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </div>
          <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={goToToday}>
            Today
          </Button>
        </div>
      </header>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Month summary"
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : (
          <>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
                  <ArrowDownLeft className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Receivables due</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCurrency(monthStats.receivableTotal)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Payables due</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatCurrency(monthStats.payableTotal)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Payroll dates</p>
                  <p className="text-lg font-semibold tabular-nums">{monthStats.payrollCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className={monthStats.overdueCount > 0 ? 'border-destructive/40' : undefined}>
              <CardContent className="flex items-center gap-3 p-4">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg',
                    monthStats.overdueCount > 0
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <AlertCircle className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Overdue items</p>
                  <p className="text-lg font-semibold tabular-nums">{monthStats.overdueCount}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Event type filters">
        {ALL_EVENT_TYPES.map((type) => {
          const active = activeFilters.has(type);
          return (
            <Button
              key={type}
              variant={active ? 'secondary' : 'outline'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => toggleFilter(type)}
            >
              <span
                className={cn('h-2 w-2 rounded-full', EVENT_META[type].color.split(' ')[0])}
                aria-hidden
              />
              {EVENT_META[type].label}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : monthStats.total === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No financial events this month"
                description="When invoices, bills, payroll runs or recurring schedules have due dates in this month, they appear here automatically."
                action={
                  <Button variant="outline" onClick={() => navigate('/invoices')}>
                    Create an invoice
                  </Button>
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-7 border-b">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div
                      key={day}
                      className="p-3 text-center text-sm font-medium text-muted-foreground"
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-[minmax(110px,_1fr)]">
                  {days.map((day, dayIdx) => {
                    const dayEvents = filteredEvents.filter((e) =>
                      isSameDay(parseISO(e.date), day)
                    );
                    const hasOverdue = dayEvents.some(isEventOverdue);
                    const isSelected = isSameDay(day, selectedDay);

                    return (
                      <button
                        type="button"
                        key={day.toISOString()}
                        onClick={() => setSelectedDay(day)}
                        className={cn(
                          'border-b border-r p-2 text-left transition-colors hover:bg-muted/30 min-h-[110px] flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                          !isSameMonth(day, currentMonth) && 'bg-muted/10 text-muted-foreground',
                          dayIdx % 7 === 0 && 'border-l',
                          isToday(day) && 'bg-primary/5',
                          isSelected && 'ring-2 ring-primary ring-inset',
                          hasOverdue && isSameMonth(day, currentMonth) && 'bg-destructive/[0.03]'
                        )}
                        aria-label={format(day, 'EEEE, MMMM d')}
                        aria-pressed={isSelected}
                      >
                        <div
                          className={cn(
                            'text-right text-sm p-0.5 mb-0.5 font-medium',
                            isToday(day) && 'text-primary'
                          )}
                        >
                          {format(day, 'd')}
                        </div>

                        {dayEvents.slice(0, 3).map((event) => (
                          <div
                            key={`${event.type}-${event.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEventClick(event);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                handleEventClick(event);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            className={cn(
                              'text-xs p-1 rounded-sm border cursor-pointer truncate',
                              EVENT_META[event.type].color,
                              event.status === 'paid' && 'opacity-60 line-through',
                              isEventOverdue(event) && 'border-destructive/50'
                            )}
                            title={`${event.title}${event.description ? ` — ${event.description}` : ''}`}
                          >
                            <div className="font-semibold truncate">{event.title}</div>
                            {event.amount !== undefined && (
                              <div className="tabular-nums">{formatCurrency(event.amount)}</div>
                            )}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-muted-foreground px-1">
                            +{dayEvents.length - 3} more
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {format(selectedDay, 'EEEE, MMM d')}
              </CardTitle>
              <CardDescription>
                {selectedDayEvents.length === 0
                  ? 'Nothing scheduled'
                  : `${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? '' : 's'}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Select a day with events or create invoices and bills with due dates to populate
                  your calendar.
                </p>
              ) : (
                selectedDayEvents.map((event) => (
                  <button
                    key={`${event.type}-${event.id}-detail`}
                    type="button"
                    onClick={() => handleEventClick(event)}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      {isEventOverdue(event) && (
                        <Badge variant="destructive" className="shrink-0 text-[10px]">
                          Overdue
                        </Badge>
                      )}
                    </div>
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                    )}
                    {event.amount !== undefined && (
                      <p className="text-sm font-semibold tabular-nums mt-1">
                        {formatCurrency(event.amount)}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1 capitalize">
                      {EVENT_META[event.type].label} · {event.status}
                    </p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Repeat className="h-4 w-4 text-muted-foreground" />
                Coming up
              </CardTitle>
              <CardDescription>Next 14 days</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
              ) : (
                upcomingEvents.map((event) => (
                  <button
                    key={`upcoming-${event.type}-${event.id}`}
                    type="button"
                    onClick={() => handleEventClick(event)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="truncate font-medium">{event.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {format(parseISO(event.date), 'MMM d')}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
};

export default FinancialCalendar;
