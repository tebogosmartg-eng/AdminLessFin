import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import type { TimelineEvent } from '../../lib/payrollIntelligence';

type Props = { events: TimelineEvent[] };

const TYPE_COLORS: Record<TimelineEvent['type'], string> = {
  claims: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30',
  review: 'border-blue-400 bg-blue-50 dark:bg-blue-950/30',
  processing: 'border-primary bg-primary/5',
  payslips: 'border-green-400 bg-green-50 dark:bg-green-950/30',
  posting: 'border-violet-400 bg-violet-50 dark:bg-violet-950/30',
  payroll: 'border-blue-400 bg-blue-50 dark:bg-blue-950/30',
};

const PayrollTimeline = ({ events }: Props) => {
  const navigate = useNavigate();

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payroll Timeline</CardTitle>
          <CardDescription>No upcoming payroll events scheduled.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Create a payroll run to see your operational timeline.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Payroll Timeline</CardTitle>
        <CardDescription>Chronological workflow — click to navigate.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {events.map((event, index) => (
            <button
              key={event.id}
              type="button"
              onClick={() => navigate(event.actionPath)}
              className={cn(
                'flex-shrink-0 w-44 text-left rounded-lg border-l-4 p-3 transition-colors hover:ring-2 hover:ring-primary/20',
                TYPE_COLORS[event.type],
                event.isPast && 'opacity-60'
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {event.isToday ? 'Today' : format(parseISO(event.date), 'EEE, dd MMM')}
                </span>
                {event.isToday && <Badge variant="secondary" className="text-[10px] px-1 py-0">Now</Badge>}
              </div>
              <p className="text-sm font-semibold leading-tight">{event.label}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</p>
              {index < events.length - 1 && (
                <span className="sr-only">Next: {events[index + 1]?.label}</span>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default PayrollTimeline;
