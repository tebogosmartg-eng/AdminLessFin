import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, AlertTriangle, CheckCircle2, Unlock } from 'lucide-react';
import type { AccountingPolicyDashboard } from '@/governance/domains/accountingPolicyEngine/model';
import { POLICY_DOMAIN_ORDER, POLICY_DOMAIN_LABELS } from '@/governance/domains/accountingPolicyEngine/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type AccountingPolicyCardProps = {
  dashboard: AccountingPolicyDashboard;
};

function complianceTone(violations: number) {
  if (violations === 0) return 'text-emerald-700 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20';
  if (violations <= 3) return 'text-amber-800 border-amber-200 bg-amber-50/40 dark:bg-amber-950/20';
  return 'text-red-800 border-red-200 bg-red-50/40 dark:bg-red-950/20';
}

const AccountingPolicyCard = ({ dashboard }: AccountingPolicyCardProps) => {
  const activeDomains = POLICY_DOMAIN_ORDER.filter((key) => (dashboard.policiesByDomain[key] ?? 0) > 0);

  return (
    <Card className={cn('border', complianceTone(dashboard.violationCount))}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5" />
              Accounting Policies
            </CardTitle>
            <CardDescription>
              Preventive governance — rules enforced before transactions are accepted.
            </CardDescription>
          </div>
          <Badge variant="outline">{dashboard.enabledPolicies}/{dashboard.totalPolicies} active</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Passed
            </div>
            <div className="font-semibold tabular-nums">{dashboard.passedCount}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              Violations
            </div>
            <div className="font-semibold tabular-nums">{dashboard.violationCount}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Unlock className="h-3.5 w-3.5" />
              Overrides
            </div>
            <div className="font-semibold tabular-nums">{dashboard.overrideCount}</div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {activeDomains.slice(0, 6).map((key) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground truncate">{POLICY_DOMAIN_LABELS[key]}</span>
              <span className="font-medium tabular-nums ml-2">{dashboard.policiesByDomain[key]}</span>
            </div>
          ))}
        </div>

        {dashboard.recentViolations.length > 0 && (
          <div className="rounded-md border px-3 py-2 text-sm">
            <p className="font-medium">Recent violations</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              {dashboard.recentViolations.slice(0, 3).map((v) => (
                <li key={v.id}>{v.policyName}: {v.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to="/accounting/dashboard">
              View policy centre
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountingPolicyCard;
