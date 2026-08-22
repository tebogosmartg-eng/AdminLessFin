import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, PlusCircle } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import type { CoaRow } from '@/governance/domains/accountingReadiness/validation';
import type { ControlAccountRole } from '@/governance/domains/accountingReadiness/model';
import {
  CONTROL_ACCOUNT_LABELS,
  CONTROL_ACCOUNT_WHY,
} from '@/governance/domains/accountingReadiness/model';
import {
  analyseControlAccountMappings,
  accountRoleForControl,
  buildRecommendedAccount,
  compatibleAccountsForRole,
  type ControlMappingRow,
} from '@/governance/domains/accountingReadiness/controlAccountMapping';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { showError, showSuccess } from '../../utils/toast';
import { countAccountsRequiringClassification } from '@/lib/accounting/accountClassification';

type CoaControlMappingProps = {
  accounts: CoaRow[];
  inventoryEnabled: boolean;
  fixedAssetsEnabled: boolean;
  payrollEnabled: boolean;
  bankAccountsCount: number;
  bankAccountsSkipped: boolean;
  mappingsComplete: boolean;
  missingControlAccounts: ControlAccountRole[];
};

function formatAccount(account: {
  accountNumber?: number | null;
  accountCode?: string | null;
  name: string;
}): string {
  const code = account.accountCode || (account.accountNumber != null ? String(account.accountNumber) : '');
  return code ? `${code} — ${account.name}` : account.name;
}

const CoaControlMapping = ({
  accounts,
  inventoryEnabled,
  fixedAssetsEnabled,
  payrollEnabled,
  bankAccountsCount,
  bankAccountsSkipped,
  mappingsComplete,
  missingControlAccounts,
}: CoaControlMappingProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const appliedRolesRef = useRef<Set<ControlAccountRole>>(new Set());
  const [pickingRole, setPickingRole] = useState<ControlAccountRole | null>(null);
  const [selectedByRole, setSelectedByRole] = useState<Partial<Record<ControlAccountRole, string>>>({});

  const analysis = useMemo(
    () =>
      analyseControlAccountMappings({
        accounts,
        flags: { inventoryEnabled, fixedAssetsEnabled, payrollEnabled },
        bankAccountsCount,
        bankAccountsSkipped,
      }),
    [
      accounts,
      inventoryEnabled,
      fixedAssetsEnabled,
      payrollEnabled,
      bankAccountsCount,
      bankAccountsSkipped,
    ],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
    queryClient.invalidateQueries({ queryKey: ['accountingReadiness', activeCompany?.id] });
  };

  const mapMutation = useMutation({
    mutationFn: async (input: { accountId: string; accountRole: string }) => {
      if (!activeCompany) throw new Error('No active company');
      const invoke = (method: 'MAP_ROLE' | 'PUT', extra: Record<string, unknown>) =>
        supabase.functions.invoke('chart-of-accounts', {
          body: {
            method,
            company_id: activeCompany.id,
            ...extra,
          },
        });

      const mapped = await invoke('MAP_ROLE', {
        accountId: input.accountId,
        account_role: input.accountRole,
      });
      if (!mapped.error) return;
      const message = mapped.error.message || '';
      if (!/unsupported method/i.test(message)) {
        throw new Error(message);
      }
      const { error } = await invoke('PUT', {
        accountId: input.accountId,
        accountData: { account_role: input.accountRole },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh();
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  const createMutation = useMutation({
    mutationFn: async (role: Exclude<ControlAccountRole, 'profit_loss'>) => {
      if (!activeCompany) throw new Error('No active company');
      const spec = buildRecommendedAccount(role, accounts);
      const { error } = await supabase.functions.invoke('chart-of-accounts', {
        body: {
          method: 'POST',
          company_id: activeCompany.id,
          accountData: spec,
        },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      showSuccess('Required control account created.');
      refresh();
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  useEffect(() => {
    if (!activeCompany || mapMutation.isPending) return;
    const autos = analysis.rows.filter(
      (row) =>
        row.status === 'auto' &&
        row.mappedAccount &&
        row.role !== 'profit_loss' &&
        !appliedRolesRef.current.has(row.role),
    );
    if (autos.length === 0) return;
    for (const row of autos) appliedRolesRef.current.add(row.role);
    void (async () => {
      try {
        for (const row of autos) {
          await mapMutation.mutateAsync({
            accountId: row.mappedAccount!.id,
            accountRole: accountRoleForControl(row.role as Exclude<ControlAccountRole, 'profit_loss'>),
          });
        }
        showSuccess(
          autos.length === 1
            ? 'Recognised the existing control account.'
            : `Recognised ${autos.length} existing control accounts.`,
        );
      } catch {
        for (const row of autos) appliedRolesRef.current.delete(row.role);
      }
    })();
    // Persist unique recognitions once per role.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany, analysis.rows]);

  const configuredCount = analysis.mappedCount;
  const requiredCount = analysis.requiredCount;
  const attentionCount =
    missingControlAccounts.length || analysis.missingCount + analysis.ambiguousCount + analysis.autoCount;

  const applySelection = (row: ControlMappingRow) => {
    const accountId = selectedByRole[row.role] ?? row.mappedAccount?.id;
    if (!accountId || row.role === 'profit_loss') return;
    mapMutation.mutate({
      accountId,
      accountRole: accountRoleForControl(row.role),
    });
    setPickingRole(null);
  };

  const unclassifiedCount = countAccountsRequiringClassification(accounts);

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>Chart of Accounts detected</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Your Chart of Accounts already exists. AdminLess Fin has analysed it and identified the
            following mappings.
          </p>
          <p className="text-sm">
            {analysis.accountCount} accounts configured
            {' · '}
            Control accounts: {configuredCount} / {requiredCount} configured
            {attentionCount > 0 ? ` · ${attentionCount} still need attention` : ''}
          </p>
          <p className="text-sm">
            Classification:{' '}
            {unclassifiedCount === 0 ? (
              <span>all accounts classified</span>
            ) : (
              <>
                <span>
                  {unclassifiedCount} account{unclassifiedCount === 1 ? '' : 's'} require
                  {unclassifiedCount === 1 ? 's' : ''} classification
                </span>
                {' · '}
                <Link className="underline" to="/chart-of-accounts?classification=required">
                  Classify now
                </Link>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Existing accounts are not replaced. Clear matches are recognised automatically;
            ambiguous or missing controls need a choice below.
          </p>
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        {analysis.rows.map((row) => {
          const ok = row.status === 'mapped';
          const picking = pickingRole === row.role || row.status === 'ambiguous';
          const selectable = compatibleAccountsForRole(accounts, row.role);
          return (
            <div key={row.role} className="space-y-2 rounded-md border px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <span className="font-medium">
                      {CONTROL_ACCOUNT_LABELS[row.role]}
                      {row.mappedAccount ? ` → ${formatAccount(row.mappedAccount)}` : ' → Not mapped'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{CONTROL_ACCOUNT_WHY[row.role]}</p>
                  {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
                  {row.status === 'auto' && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      Automatically recognised
                    </p>
                  )}
                </div>
                <Badge variant={ok ? 'outline' : 'secondary'}>
                  {ok ? 'Mapped' : row.status === 'ambiguous' ? 'Choose account' : 'Needs attention'}
                </Badge>
              </div>

              {!ok && row.role !== 'profit_loss' && (
                <div className="flex flex-wrap items-center gap-2">
                  {row.status === 'missing' && (
                    <Button
                      size="sm"
                      onClick={() => createMutation.mutate(row.role as Exclude<ControlAccountRole, 'profit_loss'>)}
                      disabled={createMutation.isPending || mapMutation.isPending}
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <PlusCircle className="mr-2 h-4 w-4" />
                      )}
                      Create recommended account
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPickingRole(row.role)}
                    disabled={mapMutation.isPending}
                  >
                    {row.status === 'auto' ? 'Change account' : 'Select existing account'}
                  </Button>
                </div>
              )}

              {ok && row.role !== 'profit_loss' && (
                <Button size="sm" variant="ghost" onClick={() => setPickingRole(row.role)}>
                  Change account
                </Button>
              )}

              {picking && row.role !== 'profit_loss' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={selectedByRole[row.role] ?? row.mappedAccount?.id ?? ''}
                    onValueChange={(value) =>
                      setSelectedByRole((current) => ({ ...current, [row.role]: value }))
                    }
                  >
                    <SelectTrigger className="w-full sm:w-[360px]">
                      <SelectValue placeholder="Select an existing account" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectable.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {formatAccount({
                            accountNumber: account.account_number,
                            accountCode: account.account_code,
                            name: account.name,
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => applySelection(row)}
                    disabled={
                      (!selectedByRole[row.role] && !row.mappedAccount?.id) || mapMutation.isPending
                    }
                  >
                    {mapMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Use this account'}
                  </Button>
                </div>
              )}

              {row.role === 'profit_loss' && !ok && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/chart-of-accounts">Add income or expense account</Link>
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {mappingsComplete && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          All required control accounts are mapped. Accounting Setup can continue.
        </p>
      )}
    </div>
  );
};

export default CoaControlMapping;
