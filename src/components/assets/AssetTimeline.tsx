import { format } from 'date-fns';
import { Link2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { EmptyState } from '../EmptyState';

export type LifecycleEventRow = {
  id?: string;
  event_type: string;
  event_date: string;
  user_name?: string | null;
  reason?: string | null;
  reference?: string | null;
  attachment_url?: string | null;
};

type Props = {
  events: LifecycleEventRow[];
};

const AssetTimeline = ({ events }: Props) => {
  if (!events.length) {
    return (
      <EmptyState
        icon={Link2}
        title="No lifecycle events"
        description="Events appear as the asset is created, transferred, verified, maintained, or capitalised."
      />
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-border ml-3 pl-6">
      {events.map((ev, idx) => (
        <li key={ev.id || `${ev.event_type}-${ev.event_date}-${idx}`} className="mb-6 last:mb-0">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge variant="outline" className="capitalize">
              {(ev.event_type || '').replace(/_/g, ' ')}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {ev.event_date ? format(new Date(ev.event_date), 'PPp') : '—'}
            </span>
            {ev.user_name && (
              <span className="text-xs text-muted-foreground">· {ev.user_name}</span>
            )}
          </div>
          {ev.reason && <p className="text-sm">{ev.reason}</p>}
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
            {ev.reference && <span>Ref: {ev.reference}</span>}
            {ev.attachment_url && (
              <a
                href={ev.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                Attachment
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};

export default AssetTimeline;
