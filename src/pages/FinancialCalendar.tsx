import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { addMonths, subMonths, format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';
import { Badge } from '../components/ui/badge';
import { useNavigate } from 'react-router-dom';

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  type: 'invoice' | 'bill' | 'payroll' | 'recurring_invoice' | 'recurring_bill';
  status: string;
  amount?: number;
  description?: string;
};

const FinancialCalendar = () => {
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
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

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const today = () => setCurrentMonth(new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth)),
  });

  const getEventColor = (type: string) => {
    switch (type) {
      case 'invoice': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
      case 'bill': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
      case 'payroll': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
      case 'recurring_invoice': return 'bg-green-50 text-green-600 border-dashed border-green-200 dark:bg-green-950/30 dark:text-green-400';
      case 'recurring_bill': return 'bg-red-50 text-red-600 border-dashed border-red-200 dark:bg-red-950/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    switch (event.type) {
      case 'invoice': navigate(`/invoices/${event.id}`); break;
      case 'bill': navigate(`/bills`); break;
      case 'payroll': navigate(`/payroll-runs/${event.id}`); break;
      case 'recurring_invoice': navigate(`/recurring-invoices`); break;
      case 'recurring_bill': navigate(`/recurring-bills`); break;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Calendar</h1>
          <p className="text-muted-foreground">Overview of upcoming payments and receivables.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="w-40 text-center font-semibold">{format(currentMonth, 'MMMM yyyy')}</div>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={today}>Today</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-4 text-center font-medium text-sm text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-[minmax(120px,_1fr)]">
            {days.map((day, dayIdx) => {
              const dayEvents = events?.filter(e => isSameDay(new Date(e.date), day));
              return (
                <div 
                  key={day.toString()} 
                  className={cn(
                    "border-b border-r p-2 transition-colors hover:bg-muted/30 min-h-[120px] flex flex-col gap-1",
                    !isSameMonth(day, currentMonth) && "bg-muted/10 text-muted-foreground",
                    dayIdx % 7 === 0 && "border-l",
                    isSameDay(day, new Date()) && "bg-blue-50/50 dark:bg-blue-900/10"
                  )}
                >
                  <div className={cn(
                    "text-right text-sm p-1 mb-1 font-medium",
                    isSameDay(day, new Date()) && "text-blue-600 dark:text-blue-400"
                  )}>
                    {format(day, 'd')}
                  </div>
                  
                  {isLoading && isSameMonth(day, currentMonth) && dayIdx === 15 && (
                    <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  )}

                  {dayEvents?.map(event => (
                    <div 
                      key={`${event.type}-${event.id}`}
                      onClick={() => handleEventClick(event)}
                      className={cn(
                        "text-xs p-1.5 rounded-sm border cursor-pointer truncate",
                        getEventColor(event.type),
                        event.status === 'paid' && "opacity-60 line-through"
                      )}
                      title={`${event.title} - ${event.description || ''}`}
                    >
                      <div className="font-semibold truncate">{event.title}</div>
                      {event.amount !== undefined && (
                        <div className="flex justify-between mt-0.5">
                          <span>{formatCurrency(event.amount)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialCalendar;