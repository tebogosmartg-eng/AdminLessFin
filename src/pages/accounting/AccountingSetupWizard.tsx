import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Landmark,
  Receipt,
  Building2,
  Scale,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  accountingReadinessQuery,
  accountsQuery,
  bankAccountsQuery,
  taxRatesQuery,
} from '../../lib/queries';
import { accountingReadinessService } from '@/governance/domains/accountingReadiness/service';
import type { SetupStepKey } from '@/governance/domains/accountingReadiness/model';
import {
  CONTROL_ACCOUNT_LABELS,
  SETUP_STEP_ORDER,
  SETUP_STEP_LABELS,
} from '@/governance/domains/accountingReadiness/model';
import CoaOnboarding from '../../components/accounting/CoaOnboarding';
import FinancialYearSettings from '../../components/FinancialYearSettings';
import BankAccountForm from '../../components/BankAccountForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { showError, showSuccess } from '../../utils/toast';
import { cn } from '../../lib/utils';
import { SETUP_STEP_GUIDANCE } from '../../lib/onboarding/copy';
import { useAccountingSetupAnalytics } from '../../lib/analytics/useAccountingSetupAnalytics';

const STEP_ICONS: Record<SetupStepKey, typeof CalendarDays> = {
  financial_calendar: CalendarDays,
  chart_of_accounts: Landmark,
  tax_configuration: Receipt,
  bank_accounts: Building2,
  opening_balances: Scale,
  validation: ShieldCheck,
};

/**
 * Phase 1B — Wizard is a guide. The Validation Engine derives step completion
 * and Accounting Ready from enterprise master data. No manual "mark complete".
 */
const AccountingSetupWizard = () => {
  useDocumentTitle('Accounting Setup');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [bankFormOpen, setBankFormOpen] = useState(false);
  const [selectedStep, setSelectedStep] = useState<SetupStepKey | null>(null);

  const { data: readiness, isFetching, isError, error, refetch } = useQuery({
    ...accountingReadinessQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: accounts = [] } = useQuery({
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: taxRates = [] } = useQuery({
    ...taxRatesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: bankAccounts = [] } = useQuery({
    ...bankAccountsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const derivedActiveStep = useMemo<SetupStepKey>(() => {
    if (!readiness) return 'financial_calendar';
    const incomplete = SETUP_STEP_ORDER.find((key) => !readiness.steps[key]?.complete);
    return incomplete ?? 'validation';
  }, [readiness]);

  const activeStep = selectedStep ?? derivedActiveStep;

  useAccountingSetupAnalytics(activeCompany?.id, readiness, activeStep);

  useEffect(() => {
    // Keep selected step in sync when validation advances past it
    if (selectedStep && readiness?.steps[selectedStep]?.complete) {
      const next = SETUP_STEP_ORDER.find((key) => !readiness.steps[key]?.complete);
      if (next) setSelectedStep(next);
    }
  }, [readiness, selectedStep]);

  const refreshMasterData = () => {
    queryClient.invalidateQueries({ queryKey: ['accountingReadiness', activeCompany?.id] });
    queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
    queryClient.invalidateQueries({ queryKey: ['tax_rates', activeCompany?.id] });
    queryClient.invalidateQueries({ queryKey: ['bank_accounts', activeCompany?.id] });
  };

  const intentMutation = useMutation({
    mutationFn: async (input: Parameters<typeof accountingReadinessService.updateIntent>[1]) => {
      if (!activeCompany) throw new Error('No active company');
      const result = await accountingReadinessService.updateIntent(activeCompany.id, input);
      if (!result.success) throw new Error(result.error || 'Could not update setup intent.');
      return result.snapshot;
    },
    onSuccess: () => {
      refreshMasterData();
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  if (!activeCompany) return null;

  if (!readiness) {
    if (isError) {
      return (
        <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Accounting setup status could not be loaded
            {error instanceof Error ? `: ${error.message}` : '.'}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const StepIcon = STEP_ICONS[activeStep];
  const stepPassed = readiness.steps[activeStep]?.complete;
  const stepGuidance = SETUP_STEP_GUIDANCE[activeStep];
  const stepIndex = SETUP_STEP_ORDER.indexOf(activeStep);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Step 3 of 5 · Accounting Setup
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Accounting Setup</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure your financial foundation. Each step is validated automatically — you cannot
              skip ahead by marking steps complete manually.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/onboarding-guide">
                <BookOpen className="mr-2 h-4 w-4" />
                Onboarding guide
              </Link>
            </Button>
            <Badge variant="outline" className="capitalize">
              {readiness.status.replaceAll('_', ' ').toLowerCase()}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refreshMasterData();
                void refetch();
                showSuccess('Validation refreshed from master data.');
              }}
              disabled={isFetching}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Accounting Setup</span>
            <span>{readiness.progressPercent}%</span>
          </div>
          <Progress value={readiness.progressPercent} className="h-2" />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Steps</CardTitle>
            <CardDescription className="text-xs">Derived by Validation Engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {SETUP_STEP_ORDER.map((key) => {
              const Icon = STEP_ICONS[key];
              const complete = readiness.steps[key]?.complete;
              const isActive = key === activeStep;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedStep(key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/70',
                    isActive && 'bg-muted font-medium',
                  )}
                >
                  {complete ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={complete ? 'text-muted-foreground' : undefined}>
                    {SETUP_STEP_LABELS[key]}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <StepIcon className="h-5 w-5" />
                  {SETUP_STEP_LABELS[activeStep]}
                </CardTitle>
                <CardDescription>
                  Step {stepIndex + 1} of {SETUP_STEP_ORDER.length}
                  {stepPassed ? ' · Complete' : ' · In progress'}
                </CardDescription>
              </div>
              <Badge variant={stepPassed ? 'outline' : 'secondary'}>
                {stepPassed ? 'Complete' : 'Pending'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>Why this step matters</AlertTitle>
              <AlertDescription>{stepGuidance.why}</AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground">{stepGuidance.action}</p>

            {activeStep === 'financial_calendar' && (
              <>
                <FinancialYearSettings />
                <Alert>
                  <AlertTitle>Automatic validation</AlertTitle>
                  <AlertDescription>
                    Status: {readiness.validation.activeFinancialYear ? 'Active financial year detected.' : 'No active financial year yet.'}
                  </AlertDescription>
                </Alert>
              </>
            )}

            {activeStep === 'chart_of_accounts' && (
              <>
                {accounts.length === 0 ? (
                  <CoaOnboarding
                    onCreateManually={() => {
                      navigate('/chart-of-accounts');
                    }}
                  />
                ) : (
                  <Alert>
                    <AlertTitle>Chart of Accounts detected</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>{accounts.length} accounts configured.</p>
                      <p className="text-xs text-muted-foreground">
                        Control accounts: {readiness.validation.mandatoryControlAccounts ? 'PASS' : 'FAIL'}
                        {' · '}
                        Integrity: {readiness.validation.coaIntegrity ? 'PASS' : 'FAIL'}
                      </p>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/chart-of-accounts">Review Chart of Accounts</Link>
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label htmlFor="inventory-enabled">Inventory module</Label>
                    <Switch
                      id="inventory-enabled"
                      checked={readiness.inventoryEnabled}
                      onCheckedChange={(checked) =>
                        intentMutation.mutate({ inventoryEnabled: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label htmlFor="fixed-assets-enabled">Fixed assets module</Label>
                    <Switch
                      id="fixed-assets-enabled"
                      checked={readiness.fixedAssetsEnabled}
                      onCheckedChange={(checked) =>
                        intentMutation.mutate({ fixedAssetsEnabled: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <Label htmlFor="payroll-enabled">Payroll module</Label>
                    <Switch
                      id="payroll-enabled"
                      checked={readiness.payrollEnabled}
                      onCheckedChange={(checked) =>
                        intentMutation.mutate({ payrollEnabled: checked })
                      }
                    />
                  </div>
                </div>
              </>
            )}

            {activeStep === 'tax_configuration' && (
              <>
                <Alert variant={readiness.validation.taxConfigurationExists ? 'default' : 'destructive'}>
                  <AlertTitle>
                    {readiness.validation.taxConfigurationExists
                      ? 'Tax rate configured'
                      : 'At least one tax rate required'}
                  </AlertTitle>
                  <AlertDescription>
                    Add a tax rate for VAT or other taxes used on invoices and bills. For South
                    African businesses, start with <strong>VAT at 15%</strong>. You can add
                    zero-rated and exempt rates later.
                  </AlertDescription>
                </Alert>
                <div className="rounded-md border p-4 text-sm">
                  <p className="font-medium">Configured tax rates: {taxRates.length}</p>
                  {taxRates.length > 0 && (
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      {taxRates.map((rate) => (
                        <li key={rate.id}>
                          {rate.name} — {rate.rate}%
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link to="/tax-rates">
                        {taxRates.length === 0 ? 'Add your first tax rate' : 'Manage tax rates'}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </>
            )}

            {activeStep === 'bank_accounts' && (
              <>
                <div className="rounded-md border p-4 text-sm">
                  <p className="font-medium">Bank accounts: {bankAccounts.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Validation: {readiness.validation.bankAccountOrSkipped ? 'PASS' : 'PENDING'}
                    {readiness.bankAccountsSkipped ? ' (banking skipped)' : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setBankFormOpen(true)}
                    >
                      Add bank account
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/banking/accounts">Open banking workspace</Link>
                    </Button>
                  </div>
                </div>
                {!readiness.bankAccountsSkipped && bankAccounts.length === 0 && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      intentMutation.mutate({ bankAccountsSkipped: true })
                    }
                    disabled={intentMutation.isPending}
                  >
                    Skip banking for now
                  </Button>
                )}
              </>
            )}

            {activeStep === 'opening_balances' && (
              <>
                <Alert>
                  <AlertTitle>Starting from zero?</AlertTitle>
                  <AlertDescription>
                    If this is a new company with no prior balances, click{' '}
                    <strong>Confirm opening balances are zero</strong> below. If you are migrating
                    from another system, post opening balances on each bank account first.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2 rounded-md border p-4 text-sm">
                  {bankAccounts.length === 0 ? (
                    <p>
                      No bank accounts configured
                      {readiness.bankAccountsSkipped ? ' (banking skipped).' : '.'}
                    </p>
                  ) : (
                    bankAccounts.map((bank) => (
                      <div key={bank.id} className="flex items-center justify-between gap-3">
                        <span>{bank.name}</span>
                        <Badge variant={bank.opening_balance_posted ? 'outline' : 'secondary'}>
                          {bank.opening_balance_posted
                            ? 'Posted'
                            : bank.opening_balance === 0
                              ? 'Zero'
                              : 'Pending'}
                        </Badge>
                      </div>
                    ))
                  )}
                  <p className="text-xs text-muted-foreground">
                    Validation: {readiness.validation.openingBalancesComplete ? 'PASS' : 'PENDING'}
                  </p>
                </div>
                {!readiness.openingBalancesZeroIntentional && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      intentMutation.mutate({ openingBalancesZeroIntentional: true })
                    }
                    disabled={intentMutation.isPending}
                  >
                    Confirm opening balances are zero
                  </Button>
                )}
              </>
            )}

            {activeStep === 'validation' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Review each check below. Any failure must be resolved before Accounting Ready is
                  granted and operational modules unlock.
                </p>
                <div className="grid gap-2 text-sm">
                  {[
                    ['Active Financial Year', readiness.validation.activeFinancialYear],
                    ['Chart of Accounts', readiness.validation.chartOfAccountsExists],
                    ['Mandatory Control Accounts', readiness.validation.mandatoryControlAccounts],
                    ['COA Integrity', readiness.validation.coaIntegrity],
                    ['Tax Configuration', readiness.validation.taxConfigurationExists],
                    ['Banking', readiness.validation.bankAccountOrSkipped],
                    ['Opening Balances', readiness.validation.openingBalancesComplete],
                  ].map(([label, ok]) => (
                    <div key={String(label)} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span>{label}</span>
                      <Badge variant={ok ? 'outline' : 'destructive'}>{ok ? 'PASS' : 'FAIL'}</Badge>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 text-sm">
                  {Object.entries(readiness.validation.controlAccounts).map(([role, ok]) => (
                    <div key={role} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span>{CONTROL_ACCOUNT_LABELS[role as keyof typeof CONTROL_ACCOUNT_LABELS]}</span>
                      <Badge variant={ok ? 'outline' : 'destructive'}>{ok ? 'OK' : 'Missing'}</Badge>
                    </div>
                  ))}
                </div>
                {readiness.validation.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>Validation issues</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {readiness.validation.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {!stepPassed && activeStep !== 'validation' && (
              <p className="border-t pt-4 text-xs text-muted-foreground">
                <strong>What happens next:</strong> {stepGuidance.next}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {readiness.accountingReady && (
        <Alert className="border-emerald-200/70 bg-emerald-50/30 dark:border-emerald-900/40">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>Accounting Ready — you are all set</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              All validation rules passed. You can now create invoices, post journals, and generate
              financial statements.
            </span>
            <Button asChild size="sm">
              <Link to="/">Go to dashboard</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/onboarding-guide">First-day checklist</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <BankAccountForm
        isOpen={bankFormOpen}
        setIsOpen={(open) => {
          setBankFormOpen(open);
          if (!open) refreshMasterData();
        }}
      />
    </div>
  );
};

export default AccountingSetupWizard;
