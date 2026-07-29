import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { showError, showSuccess } from '../../utils/toast';
import { payrollRunRuleConfigQuery } from '../../lib/queries';
import { invokePayroll } from '../../lib/payrollOperations';
import { PAYROLL_RULE_CATALOG } from '../../lib/payrollRulesEngine/catalogue';
import { Settings2, AlertCircle, ChevronDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { cn } from '../../lib/utils';

type Props = {
  runId: string;
  runStatus: string;
  onSaved?: () => void;
};

type CatalogRule = {
  id: string;
  name: string;
  category: string;
  company_configurable?: boolean;
  enabled_by_default?: boolean;
};

type RuleConfig = Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;

type DisplayRule = CatalogRule & {
  effective: boolean | undefined;
  companyDefault: boolean | undefined;
  hasOverride: boolean;
};

const fallbackCatalog: CatalogRule[] = PAYROLL_RULE_CATALOG.map((r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  company_configurable: r.companyConfigurable,
  enabled_by_default: r.enabledByDefault,
}));

const RULE_SECTIONS: { id: string; label: string; ruleIds: string[] }[] = [
  {
    id: 'statutory',
    label: 'Statutory Deductions',
    ruleIds: ['paye', 'uif', 'uif_employer', 'sdl'],
  },
  {
    id: 'retirement',
    label: 'Retirement',
    ruleIds: ['pension', 'provident_fund'],
  },
  {
    id: 'medical',
    label: 'Medical',
    ruleIds: ['medical_aid'],
  },
  {
    id: 'employer',
    label: 'Employer Contributions',
    ruleIds: ['custom_employer_contribution'],
  },
  {
    id: 'other',
    label: 'Other',
    ruleIds: ['union_fees', 'garnishee', 'custom_deduction'],
  },
];

function RuleRow({
  rule,
  isEditable,
  checked,
  onToggle,
}: {
  rule: DisplayRule;
  isEditable: boolean;
  checked: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium">{rule.name}</span>
        <Badge
          variant={rule.companyDefault ? 'default' : 'secondary'}
          className="text-[10px] px-1.5 py-0"
        >
          {rule.companyDefault ? 'Enabled' : 'Disabled'}
        </Badge>
        {rule.hasOverride ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-700 dark:text-amber-400">
            Override
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
            Company Default
          </Badge>
        )}
      </div>
      <Switch
        checked={checked}
        disabled={!isEditable}
        onCheckedChange={onToggle}
        className="shrink-0"
      />
    </div>
  );
}

function RuleSection({
  label,
  rules,
  isEditable,
  overrides,
  onToggle,
  defaultOpen = true,
}: {
  label: string;
  rules: DisplayRule[];
  isEditable: boolean;
  overrides: RuleConfig;
  onToggle: (ruleId: string, enabled: boolean) => void;
  defaultOpen?: boolean;
}) {
  if (rules.length === 0) return null;

  const enabledCount = rules.filter((r) => r.effective).length;

  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-md border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors rounded-md group">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium">{label}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {rules.length}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {enabledCount} enabled
          </span>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y border-t">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              isEditable={isEditable}
              checked={overrides[rule.id]?.enabled ?? rule.companyDefault ?? false}
              onToggle={(enabled) => onToggle(rule.id, enabled)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RulesContent({
  displayRules,
  isEditable,
  overrides,
  onToggle,
  onSave,
  onReset,
  isSaving,
}: {
  displayRules: DisplayRule[];
  isEditable: boolean;
  overrides: RuleConfig;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
}) {
  const rulesById = useMemo(
    () => Object.fromEntries(displayRules.map((r) => [r.id, r])),
    [displayRules],
  );

  const sections = useMemo(
    () =>
      RULE_SECTIONS.map((section) => ({
        ...section,
        rules: section.ruleIds
          .map((id) => rulesById[id])
          .filter((r): r is DisplayRule => r != null),
      })).filter((s) => s.rules.length > 0),
    [rulesById],
  );

  const ungrouped = useMemo(() => {
    const groupedIds = new Set(RULE_SECTIONS.flatMap((s) => s.ruleIds));
    return displayRules.filter((r) => !groupedIds.has(r.id));
  }, [displayRules]);

  return (
    <div className="space-y-2 pt-3">
      {sections.map((section) => (
        <RuleSection
          key={section.id}
          label={section.label}
          rules={section.rules}
          isEditable={isEditable}
          overrides={overrides}
          onToggle={onToggle}
        />
      ))}
      {ungrouped.length > 0 && (
        <RuleSection
          label="Additional"
          rules={ungrouped}
          isEditable={isEditable}
          overrides={overrides}
          onToggle={onToggle}
        />
      )}
      {isEditable && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save Run Rules'}
          </Button>
          <Button size="sm" variant="outline" onClick={onReset}>
            Reset to Company Defaults
          </Button>
        </div>
      )}
    </div>
  );
}

const PayrollRunRulesPanel = ({ runId, runStatus, onSaved }: Props) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [overrides, setOverrides] = useState<RuleConfig>({});
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [shouldRenderRules, setShouldRenderRules] = useState(false);
  const isEditable = runStatus === 'draft';

  const { data, isLoading, isError, error } = useQuery({
    ...payrollRunRuleConfigQuery(activeCompany?.id ?? '', runId),
    enabled: !!activeCompany && !!runId,
  });

  const catalog = useMemo<CatalogRule[]>(() => {
    if (data?.catalog?.length) return data.catalog;
    return fallbackCatalog;
  }, [data?.catalog]);

  const companyDefaults = useMemo<RuleConfig>(() => data?.company_defaults ?? {}, [data?.company_defaults]);

  useEffect(() => {
    const runConfig = data?.run?.rule_config?.rules ?? data?.run?.rule_config ?? {};
    setOverrides(runConfig);
  }, [data]);

  const displayRules = useMemo(() => {
    const effectiveRules: RuleConfig = data?.effective_rules ?? {};
    return catalog
      .filter((r) => r.id !== 'basic_salary')
      .map((rule) => {
        const hasOverride = overrides[rule.id]?.enabled != null;
        const effective =
          effectiveRules[rule.id]?.enabled ??
          companyDefaults[rule.id]?.enabled ??
          rule.enabled_by_default;
        const companyDefault = companyDefaults[rule.id]?.enabled ?? rule.enabled_by_default;
        return { ...rule, effective, companyDefault, hasOverride };
      });
  }, [catalog, overrides, data?.effective_rules, companyDefaults]);

  const summary = useMemo(() => {
    const total = displayRules.length;
    const enabled = displayRules.filter((r) => r.effective).length;
    const disabled = total - enabled;
    const overrideCount = displayRules.filter((r) => r.hasOverride).length;
    return { total, enabled, disabled, overrideCount };
  }, [displayRules]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company selected');
      const rule_config = { rules: overrides };
      return invokePayroll({
        method: 'UPDATE_RUN_RULE_CONFIG',
        company_id: activeCompany.id,
        runId,
        rule_config,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll_run_rule_config', runId] });
      showSuccess('Payroll run rule configuration saved.');
      onSaved?.();
    },
    onError: (err: Error) => showError(err.message),
  });

  const toggleOverride = (ruleId: string, enabled: boolean) => {
    setOverrides((prev) => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], enabled },
    }));
  };

  const resetToDefaults = () => {
    setOverrides({});
  };

  const handlePanelOpenChange = (open: boolean) => {
    setPanelExpanded(open);
    if (open) {
      setShouldRenderRules(true);
    } else {
      window.setTimeout(() => setShouldRenderRules(false), 200);
    }
  };

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Could not load payroll rules</AlertTitle>
        <AlertDescription>
          {(error as Error)?.message ?? 'The payroll edge function returned an error.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <Collapsible open={panelExpanded} onOpenChange={handlePanelOpenChange}>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2 min-w-0">
              <Settings2 className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
              <div className="min-w-0">
                <CardTitle className="text-base">Payroll Run Rules</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Override company defaults for this payroll run.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Badge variant="secondary" className="text-xs">
                {summary.total} Rules
              </Badge>
              <Badge variant="default" className="text-xs">
                {summary.enabled} Enabled
              </Badge>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      panelExpanded && 'rotate-180',
                    )}
                  />
                  {panelExpanded ? 'Hide Rules' : 'Show Rules'}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Company Defaults</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 text-xs">
              <div>
                <span className="text-muted-foreground">Rules configured: </span>
                <span className="font-medium">{summary.total}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Enabled: </span>
                <span className="font-medium text-green-700 dark:text-green-400">{summary.enabled}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Disabled: </span>
                <span className="font-medium">{summary.disabled}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Overrides: </span>
                <span className="font-medium text-amber-700 dark:text-amber-400">{summary.overrideCount}</span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            {shouldRenderRules && (
              <RulesContent
                displayRules={displayRules}
                isEditable={isEditable}
                overrides={overrides}
                onToggle={toggleOverride}
                onSave={() => saveMutation.mutate()}
                onReset={resetToDefaults}
                isSaving={saveMutation.isPending}
              />
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default PayrollRunRulesPanel;
