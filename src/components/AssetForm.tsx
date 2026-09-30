import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { DialogClose, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { FormDialog } from './ui/form-dialog';
import { draftKey, useFormPersistence } from '../hooks/useFormPersistence';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Vendor } from '../pages/Vendors';
import { Account } from '../pages/ChartOfAccounts';
import { Employee } from '../pages/Employees';
import { EmployeeSelector } from './hr/EmployeeSelector';
import { useDialogFormReset } from '../hooks/useDialogFormReset';
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
import { SmartSelect, type SmartSelectOption } from './cotf/SmartSelect';
import { assetCategoryCreateConfig } from './cotf/entityCreateConfigs';

const assetSchema = z
  .object({
    // 'edit' updates the descriptive fields of an existing asset; the
    // acquisition fields (cost, dates, accounts) belong to the posted
    // acquisition journal and are not editable here.
    mode: z.enum(['new', 'edit']).default('new'),
    asset_code: z.string().optional(),
    description: z.string().min(1, 'Description is required.'),
    category_id: z.string().min(1, 'Category is required.'),
    purchase_date: z.string().optional(),
    purchase_cost: z.coerce.number().optional(),
    vendor_id: z.string().optional(),
    location: z.string().optional(),
    assigned_to_employee_id: z.string().optional(),
    serial_number: z.string().optional(),
    asset_account_id: z.string().optional(),
    payment_account_id: z.string().optional(),
    depreciation_method: z.enum(['straight-line', 'reducing-balance']).optional(),
    useful_life_years: z.coerce.number().int().min(1).optional(),
    residual_value: z.coerce.number().min(0).optional(),
    accumulated_depreciation_account_id: z.string().optional(),
    depreciation_expense_account_id: z.string().optional(),
    next_verification_due: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'edit') return;
    if (!v.purchase_date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purchase_date'], message: 'Purchase date is required.' });
    }
    if (!v.purchase_cost || v.purchase_cost < 0.01) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purchase_cost'], message: 'Cost must be positive.' });
    }
    if (!v.asset_account_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['asset_account_id'], message: 'Asset account is required.' });
    }
    if (!v.payment_account_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payment_account_id'], message: 'Payment account is required.' });
    }
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
      mode: 'new',
      purchase_date: new Date().toISOString().split('T')[0],
      residual_value: 0,
    },
  });

  const [categoryIntel, setCategoryIntel] = useState<CategoryIntelState>({});

  // Editing loads the asset it edits; nothing here ever POSTs twice.
  const { data: existingAsset } = useQuery({
    queryKey: ['fixed_asset_edit', assetId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: { method: 'GET_ONE', company_id: activeCompany!.id, assetId },
      });
      if (error) throw error;
      return data;
    },
    enabled: isEditing && isOpen && !!activeCompany,
  });

  useDialogFormReset(
    isOpen,
    existingAsset ? `edit:${assetId}` : isEditing ? `pending:${assetId}` : 'new',
    () => {
      if (isEditing && existingAsset) {
        form.reset({
          mode: 'edit',
          asset_code: existingAsset.asset_code ?? '',
          description: existingAsset.description ?? '',
          category_id: existingAsset.category_id ?? '',
          location: existingAsset.location ?? '',
          serial_number: existingAsset.serial_number ?? '',
          assigned_to_employee_id: existingAsset.assigned_to_employee_id ?? '',
        });
        setCategoryIntel({});
      } else if (!isEditing) {
        form.reset({ mode: 'new', purchase_date: new Date().toISOString().split('T')[0], residual_value: 0 });
        setCategoryIntel({});
      }
    },
  );

  // Typed work on a NEW asset survives refresh, crash and company switch.
  const draft = useFormPersistence(form, {
    storageKey: !isEditing ? draftKey(activeCompany?.id, 'asset') : null,
    active: isOpen,
  });

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

  // Create-on-the-Fly: a company with no asset categories is no longer a
  // dead-end — the category can be created right here.
  const companyId = activeCompany?.id ?? '';
  const categoryOptions = useMemo<SmartSelectOption[]>(
    () => (categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );
  const categoryCreate = useMemo(() => assetCategoryCreateConfig({ companyId }), [companyId]);

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
    // A residual value the user typed wins over the category's default —
    // this used to be overwritten on every purchase-cost keystroke.
    if (form.getFieldState('residual_value').isDirty) return;
    const defaults = categoryDefaultsForAsset(cat, Number(purchaseCost) || 0);
    if (defaults.residual_value != null) {
      form.setValue('residual_value', defaults.residual_value);
    }
  }, [purchaseCost, categoryId, categoryById, form, isEditing]);

  const mutation = useMutation({
    mutationFn: async (values: AssetFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');

      if (isEditing && assetId) {
        // Descriptive update only — the acquisition journal is untouched.
        const { error } = await supabase.functions.invoke('fixed-assets', {
          body: {
            method: 'PATCH_METADATA',
            company_id: activeCompany.id,
            assetId,
            patch: {
              description: values.description,
              category_id: values.category_id,
              location: values.location || null,
              serial_number: values.serial_number || null,
              assigned_to_employee_id: values.assigned_to_employee_id || null,
            },
          },
        });
        if (error) throw error;
        return;
      }

      const { asset_code: _omit, mode: _mode, ...rest } = values;
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
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset_register'] });
      queryClient.invalidateQueries({ queryKey: ['asset_register_facets'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      if (isEditing) queryClient.invalidateQueries({ queryKey: ['fixed_asset_edit', assetId] });
      showSuccess(`Asset ${isEditing ? 'updated' : 'acquired'} successfully.`);
      setIsOpen(false);
    },
    onError: (error: Error) => showError(error.message),
  });

  const submitLock = useRef(false);
  // Two rapid clicks can both pass async validation before isPending
  // re-renders; the ref closes that window so one submit posts one document.
  const onSubmit = (values: AssetFormValues) => {
    if (submitLock.current) return;
    submitLock.current = true;
    mutation.mutate(values, { onSettled: () => { submitLock.current = false; } });
  };

  return (
    <FormDialog open={isOpen} onOpenChange={setIsOpen} dirty={form.formState.isDirty || mutation.isPending} onDiscard={draft.clear}>
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
                        readOnly
                        className="bg-muted font-mono"
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
                    <SmartSelect
                      entityLabel="asset category"
                      options={categoryOptions}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        applyCategoryDefaults(v);
                      }}
                      recentScope={`asset-category:${companyId}`}
                      createConfig={categoryCreate}
                      invalidateKeys={[['asset_categories', companyId]]}
                    />
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

            {!isEditing && (
            <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Acquisition & Accounting</legend>
              <FormField control={form.control} name="purchase_date" render={({ field }) => (<FormItem><FormLabel>Purchase Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="purchase_cost" render={({ field }) => (<FormItem><FormLabel>Purchase Cost</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="vendor_id" render={({ field }) => (<FormItem><FormLabel>Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="asset_account_id" render={({ field }) => (<FormItem><FormLabel>Asset Account (Debit)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="payment_account_id" render={({ field }) => (<FormItem><FormLabel>Paid From (Credit)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Bank or A/P..." /></SelectTrigger></FormControl><SelectContent>{paymentAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </fieldset>
            )}

            {!isEditing && (
            <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Depreciation Details (Optional)</legend>
              <FormField control={form.control} name="depreciation_method" render={({ field }) => (<FormItem><FormLabel>Method</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="straight-line">Straight-Line</SelectItem><SelectItem value="reducing-balance">Reducing Balance</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="useful_life_years" render={({ field }) => (<FormItem><FormLabel>Useful Life (Years)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="residual_value" render={({ field }) => (<FormItem><FormLabel>Residual Value</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="accumulated_depreciation_account_id" render={({ field }) => (<FormItem><FormLabel>Accum. Depr. Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="depreciation_expense_account_id" render={({ field }) => (<FormItem><FormLabel>Depr. Expense Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{expenseAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            </fieldset>
            )}

            {isEditing && (
              <p className="text-xs text-muted-foreground">
                Cost, dates and accounts come from the posted acquisition journal and cannot be
                changed here. To correct them, dispose the asset or post a correcting journal.
              </p>
            )}

            <DialogFooter className="pt-4">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Asset'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </FormDialog>
  );
};

export default AssetForm;
