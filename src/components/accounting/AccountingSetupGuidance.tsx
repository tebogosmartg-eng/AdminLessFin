import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowRight, Settings2 } from 'lucide-react';
import type { AccountingGatedModule, AccountingReadinessSnapshot } from '@/governance/domains/accountingReadiness/model';
import { ACCOUNTING_MODULE_LABELS } from '@/governance/domains/accountingReadiness/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

type AccountingSetupGuidanceProps = {
  module?: AccountingGatedModule;
  readiness?: AccountingReadinessSnapshot | null;
};

const AccountingSetupGuidance = ({ module, readiness }: AccountingSetupGuidanceProps) => {
  const moduleLabel = module ? ACCOUNTING_MODULE_LABELS[module] : 'accounting operations';
  const errors = readiness?.validation?.errors ?? [];

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center p-6">
      <Card className="w-full border-amber-200/70 bg-amber-50/20 dark:border-amber-900/40 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Accounting foundation required
          </CardTitle>
          <CardDescription>
            {moduleLabel} is unavailable until Enterprise Accounting Setup is complete.
            Partial accounting is not permitted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {readiness && (
            <p className="text-sm text-muted-foreground">
              Current progress: <span className="font-medium text-foreground">{readiness.progressPercent}%</span>
              {' · '}
              Status: <span className="font-medium text-foreground">{readiness.status.replaceAll('_', ' ')}</span>
            </p>
          )}

          {errors.length > 0 && (
            <Alert>
              <AlertTitle>Outstanding requirements</AlertTitle>
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
              <Link to="/">Back to Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountingSetupGuidance;
