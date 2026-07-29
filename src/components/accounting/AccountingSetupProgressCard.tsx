import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Clock3, ArrowRight } from 'lucide-react';
import type { AccountingReadinessSnapshot, SetupStepKey } from '@/governance/domains/accountingReadiness/model';
import { SETUP_STEP_ORDER } from '@/governance/domains/accountingReadiness/model';
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
              Progress is derived automatically from your accounting foundation. Complete setup before posting journals, invoicing, payroll, or banking.
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
                  {step.complete ? 'Complete' : isCurrent ? 'In progress' : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {completedCount} of {steps.length} steps complete
          </p>
          <Button asChild size="sm">
            <Link to="/accounting-setup">
              Continue setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountingSetupProgressCard;
