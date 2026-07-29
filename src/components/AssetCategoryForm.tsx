import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { showError, showSuccess } from '../utils/toast';
import { AssetCategoryIntelligence } from '../lib/assets/eamTypes';

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required.'),
  useful_life_years: z.coerce.number().int().min(1).default(5),
  residual_value_pct: z.coerce.number().min(0).max(100).default(0),
  depreciation_method: z.enum(['straight-line', 'reducing-balance']).default('straight-line'),
  capitalisation_threshold: z.coerce.number().min(0).default(0),
  component_accounting_enabled: z.boolean().default(false),
  default_verification_frequency_months: z.coerce.number().int().min(1).default(12),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface AssetCategoryFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  category?: AssetCategoryIntelligence | { id: string; name: string };
}

const AssetCategoryForm = ({ isOpen, setIsOpen, category }: AssetCategoryFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
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
    if (!isOpen) return;
    if (category) {
      const extended = category as AssetCategoryIntelligence;
      form.reset({
        name: category.name,
        useful_life_years: extended.useful_life_years ?? 5,
        residual_value_pct: Number(extended.residual_value_pct ?? 0),
        depreciation_method:
          (extended.depreciation_method as CategoryFormValues['depreciation_method']) ||
          'straight-line',
        capitalisation_threshold: Number(extended.capitalisation_threshold ?? 0),
        component_accounting_enabled: !!extended.component_accounting_enabled,
        default_verification_frequency_months:
          extended.default_verification_frequency_months ?? 12,
      });
    } else {
      form.reset({
        name: '',
        useful_life_years: 5,
        residual_value_pct: 0,
        depreciation_method: 'straight-line',
        capitalisation_threshold: 0,
        component_accounting_enabled: false,
        default_verification_frequency_months: 12,
      });
    }
  }, [category, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const method = category ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        categoryData: values,
        ...(category && { categoryId: category.id }),
      };

      const { error } = await supabase.functions.invoke('asset-categories', { body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset_categories', activeCompany?.id] });
      showSuccess(`Category ${category ? 'updated' : 'created'}.`);
      setIsOpen(false);
    },
    onError: (error: Error) => showError(error.message),
  });

  const onSubmit = (values: CategoryFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit' : 'New'} Asset Category</DialogTitle>
          <DialogDescription>
            GL account mapping is optional here — configure full defaults in the category workspace.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Office Equipment" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="useful_life_years"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Useful life (years)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="residual_value_pct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Residual %</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} step="0.01" {...field} />
                    </FormControl>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="capitalisation_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cap. threshold</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_verification_frequency_months"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification (months)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="component_accounting_enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-md border p-3 sm:col-span-2">
                    <FormLabel>Component accounting</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Category'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AssetCategoryForm;
