import { Link } from 'react-router-dom';
import { BookOpenCheck, ArrowRight, Layers, Building2, Factory } from 'lucide-react';
import type { RulesDashboard } from '@/governance/domains/accountingRulesEngine/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type AccountingRulesCardProps = {
  dashboard: RulesDashboard;
};

const AccountingRulesCard = ({ dashboard }: AccountingRulesCardProps) => {
  return (
    <Card className={cn('border border-blue-200/60 bg-blue-50/30 dark:bg-blue-950/10')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpenCheck className="h-5 w-5" />
              Accounting Rules
            </CardTitle>
            <CardDescription>
              Centralized accounting intelligence — business events become journal entries.
            </CardDescription>
          </div>
          <Badge variant="outline">{dashboard.totalRules} rules</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              System
            </div>
            <div className="font-semibold tabular-nums">{dashboard.systemRules}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Company
            </div>
            <div className="font-semibold tabular-nums">{dashboard.companyRules}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-2">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Factory className="h-3.5 w-3.5" />
              Industry
            </div>
            <div className="font-semibold tabular-nums">{dashboard.industryRules}</div>
          </div>
        </div>

        {dashboard.mostUsed.length > 0 && (
          <div className="rounded-md border px-3 py-2 text-sm">
            <p className="font-medium">Most used (30d)</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {dashboard.mostUsed.slice(0, 3).map((r) => (
                <li key={r.ruleCode} className="flex justify-between gap-2">
                  <span className="truncate">{r.ruleName}</span>
                  <span className="tabular-nums shrink-0">{r.executionCount}×</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to="/accounting/dashboard">
              View rules centre
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountingRulesCard;
