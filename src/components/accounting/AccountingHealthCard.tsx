import { Link } from 'react-router-dom';
import { Activity, ArrowRight } from 'lucide-react';
import type { AccountingHealthReport } from '@/governance/domains/accountingHealth/model';
import { HEALTH_DOMAIN_ORDER } from '@/governance/domains/accountingHealth/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type AccountingHealthCardProps = {
  health: AccountingHealthReport;
};

function statusTone(status: AccountingHealthReport['status']) {
  if (status === 'Healthy') return 'text-emerald-700 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20';
  if (status === 'Needs Attention') return 'text-amber-800 border-amber-200 bg-amber-50/40 dark:bg-amber-950/20';
  if (status === 'Critical') return 'text-red-800 border-red-200 bg-red-50/40 dark:bg-red-950/20';
  return 'border-muted';
}

const AccountingHealthCard = ({ health }: AccountingHealthCardProps) => {
  const domains = HEALTH_DOMAIN_ORDER.map((key) => health.domains[key]).filter((d) => d?.applicable);

  return (
    <Card className={cn('border', statusTone(health.status))}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              Accounting Health
            </CardTitle>
            <CardDescription>
              Advisory quality analysis of your accounting foundation. Does not block posting.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{health.overallScore}%</div>
            <Badge variant="outline" className="mt-1">
              {health.status}
            </Badge>
          </div>
        </div>
        <Progress value={health.overallScore} className="mt-3 h-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {domains.map((domain) => (
            <div
              key={domain.domain}
              className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{domain.label}</span>
              <span className="font-medium tabular-nums">{domain.percent}%</span>
            </div>
          ))}
        </div>

        {health.warnings.length > 0 && (
          <div className="rounded-md border px-3 py-2 text-sm">
            <p className="font-medium">
              {health.findingCount.critical} critical · {health.findingCount.warning} warnings
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              {health.warnings.slice(0, 3).map((w) => (
                <li key={w.id}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        {health.recommendations.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Recommendation: {health.recommendations[0]}
          </p>
        )}

        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to="/accounting-setup">
              Review foundation
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountingHealthCard;
