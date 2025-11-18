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
import { showError, showSuccess } from '../utils/toast';
import { TaxRate } from '../pages/TaxRates';

const taxRateSchema = z.object({
  name: z.string().min(1, 'Tax rate name is required.'),
  rate: z.coerce.number().min(0, 'Rate must be a positive number.'),
});

type TaxRateFormValues = z.infer<typeof taxRateSchema>;

interface TaxRateFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  taxRate?: TaxRate;
}

const TaxRateForm = ({ isOpen, setIsOpen, taxRate }: TaxRateFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<TaxRateFormValues>({
    resolver: zodResolver(taxRateSchema),
  });

  useEffect(() => {
    if (taxRate) {
      form.reset({
        name: taxRate.name,
        rate: taxRate.rate,
      });
    } else {
      form.reset({
        name: '',
        rate: 0,
      });
    }
  }, [taxRate, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (values: TaxRateFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const method = taxRate ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        taxRateData: values,
        ...(taxRate && { taxRateId: taxRate.id }),
      };

      const { error } = await supabase.functions.invoke('tax-rates', { body });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax_rates', activeCompany?.id] });
      showSuccess(`Tax rate ${taxRate ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: TaxRateFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{taxRate ? 'Edit Tax Rate' : 'Add New Tax Rate'}</DialogTitle>
          <DialogDescription>Enter the details for the tax rate below.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Rate Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., VAT" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rate (%)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="e.g., 15" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Tax Rate'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default TaxRateForm;