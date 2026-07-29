import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { showError, showSuccess } from '../utils/toast';
import { payrollSettingsQuery } from '../lib/queries';
import { invokePayroll } from '../lib/payrollOperations';
import { PAYROLL_RULE_CATALOG } from '../lib/payrollRulesEngine/catalogue';

type CatalogRule = {
  id: string;
  name: string;
  category: string;
  enabled_by_default: boolean;
  company_configurable: boolean;
  payslip_label: string;
  description?: string;
};

type EffectiveRules = Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;

const CATEGORY_LABELS: Record<string, string> = {
  earning: 'Earnings',
  statutory: 'Statutory',
  benefit: 'Benefits',
  deduction: 'Deductions',
  employer_contribution: 'Employer',
  custom: 'Custom',
};

const PayrollSettings = () => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [localRules, setLocalRules] = useState<EffectiveRules>({});

  const { data, isLoading } = useQuery({
    ...payrollSettingsQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });

  const catalog: CatalogRule[] = useMemo(() => {
    if (data?.catalog?.length) return data.catalog;
    return PAYROLL_RULE_CATALOG.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      enabled_by_default: r.enabledByDefault,
      company_configurable: r.companyConfigurable,
      payslip_label: r.payslipLabel,
      description: r.description,
    }));
  }, [data]);

  useEffect(() => {
    if (data?.effective_rules) {
      setLocalRules(data.effective_rules);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company selected');
      const settings = catalog
        .filter((r) => r.company_configurable)
        .map((r) => ({
          rule_id: r.id,
          enabled: localRules[r.id]?.enabled ?? r.enabled_by_default,
          config: localRules[r.id]?.config ?? {},
        }));
      return invokePayroll({
        method: 'UPDATE_PAYROLL_SETTINGS',
        company_id: activeCompany.id,
        settings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll_settings', activeCompany?.id] });
      showSuccess('Payroll rule settings saved.');
    },
    onError: (err: Error) => showError(err.message),
  });

  const grouped = useMemo(() => {
    const groups: Record<string, CatalogRule[]> = {};
    for (const rule of catalog) {
      if (!groups[rule.category]) groups[rule.category] = [];
      groups[rule.category].push(rule);
    }
    return groups;
  }, [catalog]);

  const toggleRule = (ruleId: string, enabled: boolean) => {
    setLocalRules((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], enabled },
    }));
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payroll Rules</CardTitle>
        <CardDescription>
          Configure which calculation rules apply by default to all payroll runs.
          Individual runs can override these settings before processing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(grouped).map(([category, rules]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {CATEGORY_LABELS[category] ?? category}
            </h3>
            <div className="divide-y rounded-lg border">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      {!rule.company_configurable && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                    )}
                  </div>
                  <Switch
                    checked={localRules[rule.id]?.enabled ?? rule.enabled_by_default}
                    disabled={!rule.company_configurable}
                    onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save Payroll Settings'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default PayrollSettings;
