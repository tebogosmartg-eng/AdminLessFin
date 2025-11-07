import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';

const recurringItemSchema = z.object({
  account_id: z.string().min(1, "Account is required."),
  type: z.enum(['debit', 'credit']),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
});

const recurringEntrySchema = z.object({
  description: z.string().min(1, "Description is required."),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  start_date: z.string().min(1, "Start date is required."),
  end_date: z.string().optional(),
  items: z.array(recurringItemSchema).min(2, "At least two accounts are required."),
}).refine(data => {
  const debits = data.items.filter(i => i.type === 'debit').reduce((sum, i) => sum + i.amount, 0);
  const credits = data.items.filter(i => i.type === 'credit').reduce((sum, i) => sum + i.amount, 0);
  return Math.abs(debits - credits) < 0.001;
}, {
  message: "Total debits must equal total credits.",
  path: ["items"],
});

type RecurringEntryFormValues = z.infer<typeof recurringEntrySchema>;

interface RecurringEntryFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  entryId?: string;
}

const RecurringEntryForm = ({ isOpen, setIsOpen, entryId }: RecurringEntryFormProps) => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!entryId;

  const form = useForm<RecurringEntryFormValues>({
    resolver: zodResolver(recurringEntrySchema),
    defaultValues: {
      description: '',
      frequency: 'monthly',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      items: [
        { account_id: '', type: 'debit', amount: 0 },
        { account_id: '', type: 'credit', amount: 0 },
      ],
    },
  });

  const { data: entryToEdit } = useQuery({
    queryKey: ['recurring_entry_edit', entryId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('recurring-entries', {
        body: {
          method: 'GET_ONE',
          company_id: activeCompany!.id,
          entryId: entryId,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: isEditing && isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (isEditing && entryToEdit) {
      form.reset({
        description: entryToEdit.description,
        frequency: entryToEdit.frequency as any,
        start_date: entryToEdit.start_date,
        end_date: entryToEdit.end_date || '',
        items: entryToEdit.recurring_journal_entry_items.map(({ account_id, type, amount }: any) => ({ account_id, type, amount })),
      });
    } else {
      form.reset({
        description: '',
        frequency: 'monthly',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: '',
        items: [
          { account_id: '', type: 'debit', amount: 0 },
          { account_id: '', type: 'credit', amount: 0 },
        ],
      });
    }
  }, [entryToEdit, isEditing, isOpen, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const { data: accounts } = useQuery<Account[]>({ 
    queryKey: ['accounts', activeCompany?.id], 
    queryFn: async () => {
        if (!activeCompany) return [];
        const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
          body: {
            method: 'GET',
            company_id: activeCompany.id,
          },
        });
        if (error) throw new Error(error.message);
        return data;
    },
    enabled: !!activeCompany
  });

  const mutation = useMutation({
    mutationFn: async (values: RecurringEntryFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');
      
      const entryPayload = {
        description: values.description,
        frequency: values.frequency,
        start_date: values.start_date,
        end_date: values.end_date || null,
        next_run_date: values.start_date,
      };

      const method = isEditing ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        entryData: { ...entryPayload, items: values.items },
        ...(isEditing && { entryId: entryId }),
      };

      const { error } = await supabase.functions.invoke('recurring-entries', { body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_entries', activeCompany?.id] });
      showSuccess(`Recurring entry ${isEditing ? 'updated' : 'created'}.`);
      setIsOpen(false);
    },
    onError: (error) => { showError(`Error: ${error.message}`); },
  });

  const onSubmit = (values: RecurringEntryFormValues) => mutation.mutate(values);
  const debits = form.watch('items').filter(i => i.type === 'debit').reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const credits = form.watch('items').filter(i => i.type === 'credit').reduce((sum, i) => sum + Number(i.amount || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'New'} Recurring Entry</DialogTitle>
          <DialogDescription>Set up an automated transaction. Debits must equal credits.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="e.g., Monthly Office Rent" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="frequency" render={({ field }) => (
                <FormItem><FormLabel>Frequency</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="start_date" render={({ field }) => (
                <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="end_date" render={({ field }) => (
                <FormItem><FormLabel>End Date (Optional)</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="space-y-2">
              <FormLabel>Transaction Template</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <FormField control={form.control} name={`items.${index}.account_id`} render={({ field }) => (
                    <FormItem className="flex-1"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger></FormControl><SelectContent>{accounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.account_number} - {acc.name}</SelectItem>)}</SelectContent></Select></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.type`} render={({ field }) => (
                    <FormItem><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="debit">Debit</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.amount`} render={({ field }) => (
                    <FormItem><FormControl><Input type="number" step="0.01" placeholder="Amount" {...field} /></FormControl></FormItem>
                  )} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 2}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ account_id: '', type: 'debit', amount: 0 })}>Add Line</Button>
            </div>
            {form.formState.errors.items && <p className="text-sm font-medium text-destructive">{form.formState.errors.items.message}</p>}
            <div className="flex justify-between font-mono text-sm pt-2 border-t">
              <span>Total Debits: {formatCurrency(debits)}</span>
              <span>Total Credits: {formatCurrency(credits)}</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Template'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default RecurringEntryForm;