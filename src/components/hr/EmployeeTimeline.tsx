import { format } from 'date-fns';
import { Skeleton } from '../ui/skeleton';
import { EmployeeIdentity } from './EmployeeIdentity';
import { TIMELINE_EVENT_LABELS, type EmployeeTimelineEventType } from '../../lib/employeeIdentity';

export type EmployeeTimelineRecord = {
  id: string;
  employee_id: string;
  employee_number: string;
  company_id: string;
  event_type: EmployeeTimelineEventType | string;
  event_label: string;
  event_data?: Record<string, unknown>;
  command_id?: string | null;
  correlation_id?: string | null;
  changed_by?: string | null;
  created_at: string;
};

type Props = {
  events: EmployeeTimelineRecord[];
  isLoading?: boolean;
  maxItems?: number;
};

export function EmployeeTimeline({ events, isLoading, maxItems = 20 }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!events.length) {
    return <p className="text-sm text-muted-foreground">No timeline events recorded yet.</p>;
  }

  const visible = events.slice(0, maxItems);

  return (
    <ol className="relative border-l border-muted ml-2 space-y-4">
      {visible.map((event) => (
        <li key={event.id} className="ml-4">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">
                {event.event_label || TIMELINE_EVENT_LABELS[event.event_type as EmployeeTimelineEventType] || event.event_type}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(event.created_at), 'PPp')}
              </span>
            </div>
            <EmployeeIdentity
              employee={{
                employee_number: event.employee_number,
                first_name: (event.event_data?.first_name as string) ?? '',
                last_name: (event.event_data?.last_name as string) ?? '',
                department: (event.event_data?.department as string) ?? null,
              }}
              variant="timeline"
              size="sm"
              showDepartment
            />
            {event.event_data?.detail && (
              <p className="text-xs text-muted-foreground">{String(event.event_data.detail)}</p>
            )}
            {(event.command_id || event.correlation_id) && (
              <p className="text-[10px] font-mono text-muted-foreground">
                {event.command_id && `cmd:${event.command_id.slice(0, 8)}…`}
                {event.command_id && event.correlation_id && ' · '}
                {event.correlation_id && `corr:${event.correlation_id.slice(0, 12)}…`}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
