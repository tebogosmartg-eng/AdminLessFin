import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import type { PayrollCalendarEvent } from '../../lib/payrollIntelligence';

type Props = { events: PayrollCalendarEvent[] };

const TYPE_LABELS: Record<PayrollCalendarEvent['type'], string> = {
  payroll: 'Payroll',
  claim_deadline: 'Claim deadline',
  payroll_review: 'Review',
  payslip_release: 'Payslips',
  tax_submission: 'Tax',
};

const PayrollCalendarStrip = ({ events }: Props) => (
  <Card>
    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
      <div>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Payroll Calendar
        </CardTitle>
        <CardDescription>Next 30 days of payroll events.</CardDescription>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/calendar">Full calendar</Link>
      </Button>
    </CardHeader>
    <CardContent>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payroll events in the next 30 days.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {events.slice(0, 8).map((event) => (
            <Link
              key={event.id}
              to={event.actionPath}
              className="flex-shrink-0 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors min-w-[140px]"
            >
              <p className="text-xs text-muted-foreground">{format(parseISO(event.date), 'dd MMM')}</p>
              <p className="text-sm font-medium truncate">{event.title}</p>
              <Badge variant="outline" className="text-[10px] mt-1 capitalize">
                {TYPE_LABELS[event.type]}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

export default PayrollCalendarStrip;
