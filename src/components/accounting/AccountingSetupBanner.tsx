import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingReadinessQuery } from '../../lib/queries';
import { accountingSetupPath } from '@/governance/domains/accountingReadiness/model';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';

type AccountingSetupBannerProps = {
  /** Short label for the action the user is attempting, e.g. "Recording a bill". */
  actionLabel?: string;
};

/**
 * Informational banner for modules reachable before Accounting Ready (e.g. Bills).
 * Does not block access — explains why posting may fail and where to continue setup.
 */
const AccountingSetupBanner = ({ actionLabel = 'Posting transactions' }: AccountingSetupBannerProps) => {
  const { activeCompany } = useAuth();

  const { data: readiness } = useQuery({
    ...accountingReadinessQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  if (!readiness || readiness.accountingReady) return null;

  return (
    <Alert className="border-amber-200/70 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle>Accounting setup in progress ({readiness.progressPercent}%)</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {actionLabel} requires a validated accounting foundation. Complete Accounting Setup
          before posting — otherwise you may see errors when saving.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to={accountingSetupPath(readiness.currentStep)}>
            Continue setup
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default AccountingSetupBanner;
