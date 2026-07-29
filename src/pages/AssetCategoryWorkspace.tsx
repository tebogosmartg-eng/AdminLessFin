import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { accountsQuery, assetCategoriesQuery } from '../lib/queries';
import { Account } from './ChartOfAccounts';
import { AssetCategoryIntelligence } from '../lib/assets/eamTypes';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Skeleton } from '../components/ui/skeleton';
import { showError, showSuccess } from '../utils/toast';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  useful_life_years: z.coerce.number().int().min(1).default(5),
  residual_value_pct: z.coerce.number().min(0).max(100).default(0),
  depreciation_method: z.enum(['straight-line', 'reducing-balance']),
  capitalisation_threshold: z.coerce.number().min(0).default(0),
  component_accounting_enabled: z.boolean().default(false),
  default_verification_frequency_months: z.coerce.number().int().min(1).default(12),
  gl_asset_account_id: z.string().optional().nullable(),
  accumulated_depreciation_account_id: z.string().optional().nullable(),
  depreciation_expense_account_id: z.string().optional().nullable(),
  disposal_account_id: z.string().optional().nullable(),
  revaluation_reserve_account_id: z.string().optional().nullable(),
  impairment_account_id: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

const NONE = '__none__';

const AssetCategoryWorkspace = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery<AssetCategoryIntelligence[]>({
    ...assetCategoriesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const category = categories?.find((c) => c.id === id);
  useDocumentTitle(category ? `${category.name} · Category` : 'Category Workspace');

  const { data: accounts } = useQuery<Account[]>({
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const assetAccounts = accounts?.filter((a) => a.type === 'Asset') ?? [];
  const expenseAccounts = accounts?.filter((a) => a.type === 'Expense') ?? [];
  const equityAccounts = accounts?.filter((a) => a.type === 'Equity') ?? [];
  const incomeExpense = [
    ...(accounts?.filter((a) => a.type === 'Income') ?? []),
    ...expenseAccounts,
  ];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      useful_life_years: 5,
      residual_value_pct: 0,
      depreciation_method: 'straight-line',
      capitalisation_threshold: 0,
      component_accounting_enabled: false,
      default_verification_frequency_months: 12,
    },
  });

  useEffect(() => {
    if (!category) return;
    form.reset({
      name: category.name,
      useful_life_years: category.useful_life_years ?? 5,
      residual_value_pct: Number(category.residual_value_pct ?? 0),
      depreciation_method:
        (category.depreciation_method as FormValues['depreciation_method']) || 'straight-line',
      capitalisation_threshold: Number(category.capitalisation_threshold ?? 0),
      component_accounting_enabled: !!category.component_accounting_enabled,
      default_verification_frequency_months: category.default_verification_frequency_months ?? 12,
      gl_asset_account_id: category.gl_asset_account_id ?? null,
      accumulated_depreciation_account_id: category.accumulated_depreciation_account_id ?? null,
      depreciation_expense_account_id: category.depreciation_expense_account_id ?? null,
      disposal_account_id: category.disposal_account_id ?? null,
      revaluation_reserve_account_id: category.revaluation_reserve_account_id ?? null,
      impairment_account_id: category.impairment_account_id ?? null,
    });
  }, [category, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeCompany || !id) throw new Error('Missing context');
      const categoryData = {
        ...values,
        gl_asset_account_id: values.gl_asset_account_id || null,
        accumulated_depreciation_account_id: values.accumulated_depreciation_account_id || null,
        depreciation_expense_account_id: values.depreciation_expense_account_id || null,
        disposal_account_id: values.disposal_account_id || null,
        revaluation_reserve_account_id: values.revaluation_reserve_account_id || null,
        impairment_account_id: values.impairment_account_id || null,
      };
      const { error } = await supabase.functions.invoke('asset-categories', {
        body: {
          method: 'PUT',
          company_id: activeCompany.id,
          categoryId: id,
          categoryData,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset_categories', activeCompany?.id] });
      showSuccess('Category intelligence updated.');
    },
    onError: (e: Error) => showError(e.message),
  });

  const AccountSelect = ({
    name,
    label,
    options,
    hint,
  }: {
    name: keyof FormValues;
    label: string;
    options: Account[];
    hint?: string;
  }) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={(field.value as string) || NONE}
            onValueChange={(v) => field.onChange(v === NONE ? null : v)}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE}>None (use asset-level)</SelectItem>
              {options.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.account_number} · {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!category) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Category not found</CardTitle>
          <CardDescription>
            <Link to="/asset-categories" className="underline">
              Back to categories
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/asset-categories">
          <ArrowLeft className="mr-2 h-4 w-4" /> Asset Categories
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Category workspace</CardTitle>
          <CardDescription>
            Defaults apply to new assets in this category. Existing asset journals are unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="useful_life_years"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Useful life (years)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Default: 5</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="residual_value_pct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Residual value %</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={100} step="0.01" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Default: 0%</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="depreciation_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Depreciation method</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="straight-line">Straight-line</SelectItem>
                          <SelectItem value="reducing-balance">Reducing balance</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Default: straight-line</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capitalisation_threshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capitalisation threshold</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Default: 0</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="default_verification_frequency_months"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification frequency (months)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Default: 12</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="component_accounting_enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                      <div>
                        <FormLabel>Component accounting</FormLabel>
                        <p className="text-xs text-muted-foreground">Default: off</p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Default GL accounts</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <AccountSelect
                    name="gl_asset_account_id"
                    label="Asset account"
                    options={assetAccounts}
                  />
                  <AccountSelect
                    name="accumulated_depreciation_account_id"
                    label="Accumulated depreciation"
                    options={assetAccounts}
                  />
                  <AccountSelect
                    name="depreciation_expense_account_id"
                    label="Depreciation expense"
                    options={expenseAccounts}
                  />
                  <AccountSelect
                    name="disposal_account_id"
                    label="Disposal / gain-loss"
                    options={incomeExpense}
                  />
                  <AccountSelect
                    name="revaluation_reserve_account_id"
                    label="Revaluation reserve"
                    options={equityAccounts}
                  />
                  <AccountSelect
                    name="impairment_account_id"
                    label="Impairment"
                    options={expenseAccounts}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saving…' : 'Save category'}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link to="/asset-categories">Cancel</Link>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetCategoryWorkspace;
