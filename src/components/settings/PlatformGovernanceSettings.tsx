import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  accountingHealthQuery,
  accountingPolicyDashboardQuery,
  accountingRulesDashboardQuery,
  businessEventsDashboardQuery,
} from '@/lib/queries';
import AccountingHealthCard from '@/components/accounting/AccountingHealthCard';
import AccountingPolicyCard from '@/components/accounting/AccountingPolicyCard';
import AccountingRulesCard from '@/components/accounting/AccountingRulesCard';
import BusinessEventsCard from '@/components/accounting/BusinessEventsCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Platform Governance — Accounting Engine diagnostics for administrators.
 * Relocated from the Operations Command Centre so day-to-day operators see
 * business performance, while owners/admins retain full engine visibility
 * under Settings (AdminRoute).
 */
const PlatformGovernanceSettings = () => {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id ?? '';

  const { data: accountingHealth, isLoading: healthLoading } = useQuery({
    ...accountingHealthQuery(companyId),
    enabled: !!activeCompany,
  });

  const { data: accountingPolicyDashboard, isLoading: policyLoading } = useQuery({
    ...accountingPolicyDashboardQuery(companyId),
    enabled: !!activeCompany,
  });

  const { data: accountingRulesDashboard, isLoading: rulesLoading } = useQuery({
    ...accountingRulesDashboardQuery(companyId),
    enabled: !!activeCompany,
  });

  const { data: businessEventsDashboard, isLoading: eventsLoading } = useQuery({
    ...businessEventsDashboardQuery(companyId),
    enabled: !!activeCompany,
  });

  const isLoading = healthLoading || policyLoading || rulesLoading || eventsLoading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Platform Governance
          </CardTitle>
          <CardDescription>
            Accounting Engine health, policies, rules, and business-event orchestration.
            Visible to owners and administrators only — not part of the daily operations workflow.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-4">
          {accountingHealth && <AccountingHealthCard health={accountingHealth} />}
          {accountingPolicyDashboard && (
            <AccountingPolicyCard dashboard={accountingPolicyDashboard} />
          )}
          {accountingRulesDashboard && (
            <AccountingRulesCard dashboard={accountingRulesDashboard} />
          )}
          {businessEventsDashboard && (
            <BusinessEventsCard dashboard={businessEventsDashboard} />
          )}
          {!accountingHealth &&
            !accountingPolicyDashboard &&
            !accountingRulesDashboard &&
            !businessEventsDashboard && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No accounting engine diagnostics are available for this company yet.
                </CardContent>
              </Card>
            )}
        </div>
      )}
    </div>
  );
};

export default PlatformGovernanceSettings;
