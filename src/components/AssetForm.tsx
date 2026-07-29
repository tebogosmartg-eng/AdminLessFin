import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Vendor } from '../pages/Vendors';
import { Account } from '../pages/ChartOfAccounts';
import { Employee } from '../pages/Employees';
import { EmployeeSelector } from './hr/EmployeeSelector';
import {
  accountsQuery,
  assetCategoriesQuery,
  employeesQuery,
  peekNextAssetCodeQuery,
  vendorsQuery,
} from '../lib/queries';
import {
  categoryDefaultsForAsset,
  nextVerificationDueFromFrequency,
} from '../lib/assets/categoryDefaults';
import type { AssetCategoryIntelligence } from '../lib/assets/eamTypes';

const assetSchema = z.object({
  asset_code: z.string().optional(),
  description: z.string().min(1, 'Description is required.'),
  category_id: z.string().min(1, 'Category is required.'),
  purchase_date: z.string().min(1, 'Purchase date is required.'),
  purchase_cost: z.coerce.number().min(0.01, 'Cost must be positive.'),
  vendor_id: z.string().optional(),
  location: z.string().optional(),
  assigned_to_employee_id: z.string().optional(),
  serial_number: z.string().optional(),
  asset_account_id: z.string().min(1, 'Asset account is required.'),
  payment_account_id: z.string().min(1, 'Payment account is required.'),
  depreciation_method: z.enum(['straight-line', 'reducing-balance']).optional(),
  useful_life_years: z.coerce.number().int().min(1).optional(),
  residual_value: z.coerce.number().min(0).optional(),
  accumulated_depreciation_account_id: z.string().optional(),
  depreciation_expense_account_id: z.string().optional(),
  next_verification_due: z.string().optional(),
});

type AssetFormValues = z.infer<typeof assetSchema>;

type CategoryIntelState = {
  capitalisation_threshold?: number;
  component_accounting_enabled?: boolean;
  verification_frequency_months?: number;
};

interface AssetFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  assetId?: string;
}

const AssetForm = ({ isOpen, setIsOpen, assetId }: AssetFormProps) => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!assetId;

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      purchase_date: new Date().toISOString().split('T')[0],
      residual_value: 0,
    },
  });

  const [categoryIntel, setCategoryIntel] = useState<CategoryIntelState>({});

  useEffect(() => {
    if (!isOpen) {
      form.reset({ purchase_date: new Date().toISOString().split('T')[0], residual_value: 0 });
      setCategoryIntel({});
    }
  }, [isOpen, form]);

  const { data: vendors } = useQuery<Vendor[]>({ ...vendorsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: employees } = useQuery<Employee[]>({ ...employeesQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: categories } = useQuery<AssetCategoryIntelligence[]>({
    ...assetCategoriesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });
  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: nextCode } = useQuery({
    ...peekNextAssetCodeQuery(activeCompany!.id, isOpen && !isEditing),
    enabled: !!activeCompany && isOpen && !isEditing,
  });

  const assetAccounts = accounts?.filter((a) => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter((a) => a.type === 'Liability');
  const expenseAccounts = accounts?.filter((a) => a.type === 'Expense');
  const paymentAccounts = [...(assetAccounts || []), ...(liabilityAccounts || [])];

  const categoryById = useMemo(() => {
    const map = new Map<string, AssetCategoryIntelligence>();
    categories?.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const applyCategoryDefaults = (categoryId: string) => {
    const cat = categoryById.get(categoryId);
    const cost = Number(form.getValues('purchase_cost')) || 0;
    const defaults = categoryDefaultsForAsset(cat, cost);
    if (defaults.useful_life_years != null) {
      form.setValue('useful_life_years', defaults.useful_life_years);
    }
    if (defaults.residual_value != null) {
      form.setValue('residual_value', defaults.residual_value);
    }
    if (defaults.depreciation_method) {
      form.setValue('depreciation_method', defaults.depreciation_method);
    }
    if (defaults.asset_account_id) {
      form.setValue('asset_account_id', defaults.asset_account_id);
    }
    if (defaults.accumulated_depreciation_account_id) {
      form.setValue('accumulated_depreciation_account_id', defaults.accumulated_depreciation_account_id);
    }
    if (defaults.depreciation_expense_account_id) {
      form.setValue('depreciation_expense_account_id', defaults.depreciation_expense_account_id);
    }
    const purchaseDate = form.getValues('purchase_date');
    const due = nextVerificationDueFromFrequency(
      purchaseDate,
      defaults.default_verification_frequency_months,
    );
    if (due) form.setValue('next_verification_due', due);
    setCategoryIntel({
      capitalisation_threshold: defaults.capitalisation_threshold,
      component_accounting_enabled: defaults.component_accounting_enabled,
      verification_frequency_months: defaults.default_verification_frequency_months,
    });
  };

  const purchaseCost = form.watch('purchase_cost');
  const categoryId = form.watch('category_id');
  useEffect(() => {
    if (!categoryId || isEditing) return;
    const cat = categoryById.get(categoryId);
    if (!cat) return;
    const defaults = categoryDefaultsForAsset(cat, Number(purchaseCost) || 0);
    if (defaults.residual_value != null) {
      form.setValue('residual_value', defaults.residual_value);
    }
  }, [purchaseCost, categoryId, categoryById, form, isEditing]);

  const mutation = useMutation({
    mutationFn: async (values: AssetFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');
      const { asset_code: _omit, ...rest } = values;
      const payload = {
        ...rest,
        ...(values.asset_code?.trim() ? { asset_code: values.asset_code.trim() } : {}),
      };

      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'POST',
          company_id: activeCompany.id,
          assetData: payload,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset_register'] });
      queryClient.invalidateQueries({ queryKey: ['asset_register_facets'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess(`Asset ${isEditing ? 'updated' : 'acquired'} successfully.`);
      setIsOpen(false);
    },
    onError: (error: Error) => showError(error.message),
  });

  const onSubmit = (values: AssetFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Asset' : 'Acquire New Asset'}</DialogTitle>
          <DialogDescription>Enter the details for the asset below.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-6">
            <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Asset Details</legend>
              <FormField
                control={form.control}
                name="asset_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ''}
                        placeholder={nextCode || 'Auto-generated on save'}
                        readOnly={!isEditing}
                        className={!isEditing ? 'bg-muted font-mono' : 'font-mono'}
                      />
                    </FormControl>
                    {!isEditing && (
                      <FormDescription className="text-xs">
                        Next: <span className="font-mono">{nextCode || 'AST-YYYY-NNNNNN'}</span>
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="description" render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Description</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        applyCategoryDefaults(v);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {categoryIntel.capitalisation_threshold != null && (
                      <FormDescription className="text-xs">
                        Capitalisation threshold: {categoryIntel.capitalisation_threshold}
                        {categoryIntel.verification_frequency_months != null &&
                          ` · Verify every ${categoryIntel.verification_frequency_months} mo`}
                        {categoryIntel.component_accounting_enabled && ' · Component accounting'}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="location" render={({ field }) => (<FormItem><FormLabel>Location</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="serial_number" render={({ field }) => (<FormItem><FormLabel>Serial Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="assigned_to_employee_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Assigned To</FormLabel>
                  <FormControl>
                    <EmployeeSelector
                      employees={employees ?? []}
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      placeholder="Search employee to assign…"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </fieldset>

            <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Acquisition & Accounting</legend>
              <FormField control={form.control} name="purchase_date" render={({ field }) => (<FormItem><FormLabel>Purchase Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="purchase_cost" render={({ field }) => (<FormItem><FormLabel>Purchase Cost</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="vendor_id" render={({ field }) => (<FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="asset_account_id" render={({ field }) => (<FormItem><FormLabel>Asset Account (Debit)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="payment_account_id" render={({ field }) => (<FormItem><FormLabel>Paid From (Credit)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Bank or A/P..." /></SelectTrigger></FormControl><SelectContent>{paymentAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </fieldset>

            <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Depreciation Details (Optional)</legend>
              <FormField control={form.control} name="depreciation_method" render={({ field }) => (<FormItem><FormLabel>Method</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="straight-line">Straight-Line</SelectItem><SelectItem value="reducing-balance">Reducing Balance</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="useful_life_years" render={({ field }) => (<FormItem><FormLabel>Useful Life (Years)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="residual_value" render={({ field }) => (<FormItem><FormLabel>Residual Value</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accumulated_depreciation_account_id" render={({ field }) => (<FormItem><FormLabel>Accum. Depr. Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="depreciation_expense_account_id" render={({ field }) => (<FormItem><FormLabel>Depr. Expense Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{expenseAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </fieldset>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Asset'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AssetForm;
