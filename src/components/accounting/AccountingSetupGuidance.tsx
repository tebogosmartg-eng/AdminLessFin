import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight, Settings2, BookOpen, Lightbulb, Loader2 } from 'lucide-react';
import type { AccountingGatedModule, AccountingReadinessSnapshot } from '@/governance/domains/accountingReadiness/model';
import { ACCOUNTING_MODULE_LABELS, CONTROL_ACCOUNT_LABELS } from '@/governance/domains/accountingReadiness/model';
import { MODULE_BLOCKED_GUIDANCE } from '@/lib/onboarding/copy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Progress } from '../ui/progress';

type AccountingSetupGuidanceProps = {
  module?: AccountingGatedModule;
  readiness?: AccountingReadinessSnapshot | null;
  pending?: boolean;
  errorMessage?: string;
};

const AccountingSetupGuidance = ({ module, readiness, pending, errorMessage }: AccountingSetupGuidanceProps) => {
  const moduleLabel = module ? ACCOUNTING_MODULE_LABELS[module] : 'Accounting operations';
  const guidance = module ? MODULE_BLOCKED_GUIDANCE[module] : null;
  const errors = readiness?.validation?.errors ?? [];
  const progress = readiness?.progressPercent ?? 0;
  const missingControls = readiness?.validation?.missingControlAccounts ?? [];

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center p-6">
      <Card className="w-full border-amber-200/70 bg-amber-50/20 dark:border-amber-900/40 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            {pending ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            )}
            {pending ? 'Checking accounting setup' : 'Complete Accounting Setup'}
          </CardTitle>
          <CardDescription>
            {pending ? (
              <>Confirming that <strong>{moduleLabel}</strong> has a validated accounting foundation.</>
            ) : (
              <>
                <strong>{moduleLabel}</strong> will be available once your accounting foundation is
                validated. This protects ledger integrity — partial setup is not permitted.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!pending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Setup progress</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              {readiness && (
                <p className="text-xs text-muted-foreground capitalize">
                  Status: {readiness.status.replaceAll('_', ' ').toLowerCase()}
                </p>
              )}
            </div>
          )}

          {errorMessage && (
            <Alert variant="destructive">
              <AlertTitle>Setup could not be verified</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {!pending && guidance && (
            <Alert>
              <Lightbulb className="h-4 w-4" />
              <AlertTitle>Why is this blocked?</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{guidance.why}</p>
                <p className="text-xs text-muted-foreground">{guidance.tip}</p>
              </AlertDescription>
            </Alert>
          )}

          {missingControls.length > 0 && (
            <Alert>
              <AlertTitle>Missing control accounts</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {missingControls.map((role) => (
                    <li key={role}>{CONTROL_ACCOUNT_LABELS[role] ?? role}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {errors.length > 0 && (
            <Alert>
              <AlertTitle>What still needs attention</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/accounting-setup">
                <Settings2 className="mr-2 h-4 w-4" />
                Continue Accounting Setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/onboarding-guide">
                <BookOpen className="mr-2 h-4 w-4" />
                Onboarding guide
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">Back to Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountingSetupGuidance;
