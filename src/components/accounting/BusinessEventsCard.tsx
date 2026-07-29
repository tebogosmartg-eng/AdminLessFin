import { Link } from 'react-router-dom';
import { Radio, ArrowRight, AlertTriangle, RefreshCw, Timer } from 'lucide-react';
import type { EventsDashboard } from '@/governance/domains/businessEventOrchestrator/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type BusinessEventsCardProps = {
  dashboard: EventsDashboard;
};

const BusinessEventsCard = ({ dashboard }: BusinessEventsCardProps) => {
  const hasIssues = dashboard.failedEvents > 0 || dashboard.deadLetterCount > 0;

  return (
    <Card className={cn('border border-violet-200/60 bg-violet-50/30 dark:bg-violet-950/10')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-5 w-5" />
              Business Events
            </CardTitle>
            <CardDescription>
              Central orchestrator — modules publish, subscribers react.
            </CardDescription>
          </div>
          {hasIssues && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Attention
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-sm">
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="text-muted-foreground">Events Today</div>
            <div className="font-semibold tabular-nums">{dashboard.eventsToday}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              Failed
            </div>
            <div className={cn('font-semibold tabular-nums', dashboard.failedEvents > 0 && 'text-destructive')}>
              {dashboard.failedEvents}
            </div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Retries
            </div>
            <div className="font-semibold tabular-nums">{dashboard.retries}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="text-muted-foreground">Dead Letter</div>
            <div className={cn('font-semibold tabular-nums', dashboard.deadLetterCount > 0 && 'text-destructive')}>
              {dashboard.deadLetterCount}
            </div>
          </div>
        </div>

        {dashboard.slowestSubscribers.length > 0 && (
          <div className="rounded-md border px-3 py-2 text-sm">
            <p className="font-medium flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              Slowest Subscribers (30d)
            </p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {dashboard.slowestSubscribers.slice(0, 3).map((s) => (
                <li key={s.subscriberId} className="flex justify-between gap-2">
                  <span className="truncate">{s.name}</span>
                  <span className="tabular-nums shrink-0">{s.avgDurationMs}ms</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to="/accounting/dashboard">
              View event centre
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BusinessEventsCard;
