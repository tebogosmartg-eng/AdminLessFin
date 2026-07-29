import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { BUSINESS_LIFECYCLES } from '../../lib/businessLifecycles';
import { normalizeJournalActivities, type ActivityFeedItem } from '../../lib/boe/activityEngine';

type JournalEntry = {
  id: string;
  entry_date: string;
  description: string | null;
  created_at: string;
};

type Props = {
  entries: JournalEntry[];
  isLoading?: boolean;
  limit?: number;
  showLifecycleBadge?: boolean;
};

const lifecycleColor: Record<string, string> = {
  revenue: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  procurement: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  payroll: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  accounting: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  fixed_assets: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  projects: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

function ActivityRow({ item, showLifecycleBadge }: { item: ActivityFeedItem; showLifecycleBadge?: boolean }) {
  const lifecycleLabel = BUSINESS_LIFECYCLES[item.lifecycleId]?.label ?? item.lifecycleId;

  const content = (
    <div className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <p className="text-sm font-medium leading-none">{item.label}</p>
          {showLifecycleBadge && (
            <Badge variant="outline" className={cnBadge(item.lifecycleId)}>
              {lifecycleLabel.split(' ')[0]}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{item.summary}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );

  if (item.route) {
    return <Link to={item.route} className="block hover:bg-muted/50 -mx-2 px-2 py-1 rounded-md transition-colors">{content}</Link>;
  }
  return content;
}

function cnBadge(lifecycleId: string) {
  return lifecycleColor[lifecycleId] ?? 'bg-muted text-muted-foreground';
}

const ActivityFeed = ({ entries, isLoading, limit = 8, showLifecycleBadge = true }: Props) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const items = normalizeJournalActivities(entries).slice(0, limit);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No recent business activity.</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} showLifecycleBadge={showLifecycleBadge} />
      ))}
    </div>
  );
};

export default ActivityFeed;
