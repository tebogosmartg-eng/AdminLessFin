import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Clock3, ArrowRight, BookOpen } from 'lucide-react';
import type { AccountingReadinessSnapshot, SetupStepKey } from '@/governance/domains/accountingReadiness/model';
import { SETUP_STEP_ORDER, accountingSetupPath } from '@/governance/domains/accountingReadiness/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

type AccountingSetupProgressCardProps = {
  readiness: AccountingReadinessSnapshot;
};

const AccountingSetupProgressCard = ({ readiness }: AccountingSetupProgressCardProps) => {
  if (readiness.accountingReady) return null;

  const steps = SETUP_STEP_ORDER.map((key: SetupStepKey) => ({
    key,
    ...readiness.steps[key],
  }));

  const completedCount = steps.filter((step) => step.complete).length;
  const currentIndex = steps.findIndex((step) => !step.complete);

  return (
    <Card className="border-emerald-200/70 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Accounting Setup</CardTitle>
            <CardDescription>
              Complete these steps before you can invoice, post journals, or generate financial
              statements. Progress updates automatically as you configure each area.
            </CardDescription>
          </div>
          <div className="text-right text-sm font-medium">{readiness.progressPercent}%</div>
        </div>
        <Progress value={readiness.progressPercent} className="mt-2 h-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          {steps.map((step, index) => {
            const isCurrent = index === currentIndex;
            const Icon = step.complete ? CheckCircle2 : isCurrent ? Clock3 : Circle;
            return (
              <div
                key={step.key}
                className={cn(
                  'flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
                  isCurrent && 'bg-white/60 font-medium dark:bg-white/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      step.complete ? 'text-emerald-600' : isCurrent ? 'text-amber-600' : 'text-muted-foreground',
                    )}
                  />
                  <span className={step.complete ? 'text-muted-foreground' : undefined}>{step.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {step.complete
                    ? 'Complete'
                    : isCurrent && step.key === 'chart_of_accounts' && readiness.validation.chartOfAccountsExists
                      ? readiness.validation.missingControlAccounts.length > 0
                        ? `Existing chart · ${readiness.validation.missingControlAccounts.length} mapping${readiness.validation.missingControlAccounts.length === 1 ? '' : 's'} required`
                        : 'Existing chart detected'
                      : isCurrent
                        ? 'In progress'
                        : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {completedCount} of {steps.length} steps complete
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/onboarding-guide">
                <BookOpen className="mr-2 h-4 w-4" />
                Guide
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to={accountingSetupPath(readiness.currentStep)}>
                Continue setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountingSetupProgressCard;
