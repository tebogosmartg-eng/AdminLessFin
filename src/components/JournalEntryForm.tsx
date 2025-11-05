import { useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { showError, showSuccess } from '@/utils/toast';
import { Account } from '@/pages/ChartOfAccounts';
import { PlusCircle, Trash2 } from 'lucide-react';

const journalItemSchema = z.object({
  account_id: z.string().min(1, "Account is required."),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
}).refine(data => data.debit === 0 || data.credit === 0, {
  message: "Enter either a debit or a credit, not both.",
  path: ["debit"],
});

const journalEntrySchema = z.object({
  entry_date: z.string().min(1, "Date is required."),
  description: z.string().optional(),
  items: z.array(journalItemSchema).min(2, "At least two accounts are required."),
}).refine(data => {
  const totalDebits = data.items.reduce((sum, item) => sum + item.debit, 0);
  const totalCredits = data.items.reduce((sum, item) => sum + item.credit, 0);
  return totalDebits === totalCredits;
}, {
  message: "Total debits must equal total credits.",
  path: ["items"],
}).refine(data => {
    const totalDebits = data.items.reduce((sum, item) => sum + item.debit, 0);
    return totalDebits > 0;
}, {
    message: "Total transaction amount must be greater than zero.",
    path: ["items"],
});

type JournalEntryFormValues = z.infer<typeof journalEntrySchema>;

interface JournalEntryFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const JournalEntryForm = ({ isOpen, setIsOpen }: JournalEntryFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<JournalEntryFormValues>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      entry_date: new Date().toISOString().split('T')[0],
      description: '',
      items: [
        { account_id: '', debit: 0, credit: 0 },
        { account_id: '', debit: 0, credit: 0 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*');
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: isOpen,
  });

  const mutation = useMutation({
    mutationFn: async (values: JournalEntryFormValues) => {
      if (!user) throw new Error('User not authenticated');

      const { data: entryData, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: user.id,
          entry_date: values.entry_date,
          description: values.description,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const itemsToInsert = values.items
        .filter(item => item.debit > 0 || item.credit > 0)
        .map(item => ({
          journal_entry_id: entryData.id,
          account_id: item.account_id,
          type: item.debit > 0 ? 'debit' : 'credit',
          amount: item.debit > 0 ? item.debit : item.credit,
        }));

      const { error: itemsError } = await supabase.from('journal_entry_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Journal entry created successfully.');
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  const onSubmit = (values: JournalEntryFormValues) => {
    mutation.mutate(values);
  };

  const totalDebits = form.watch('items').reduce((sum, item) => sum + (item.debit || 0), 0);
  const totalCredits = form.watch('items').reduce((sum, item) => sum + (item.credit || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="entry_date" render={({ field }) => (
                <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="e.g., Paid monthly rent" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            
            <div>
              <div className="grid grid-cols-12 gap-2 font-medium mb-2">
                <div className="col-span-6">Account</div>
                <div className="col-span-2 text-right">Debit</div>
                <div className="col-span-2 text-right">Credit</div>
                <div className="col-span-2"></div>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start mb-2">
                  <Controller
                    control={form.control}
                    name={`items.${index}.account_id`}
                    render={({ field }) => (
                      <FormItem className="col-span-6">
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger></FormControl>
                          <SelectContent>{accounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField control={form.control} name={`items.${index}.debit`} render={({ field }) => (
                    <FormItem className="col-span-2"><FormControl><Input type="number" className="text-right" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.credit`} render={({ field }) => (
                    <FormItem className="col-span-2"><FormControl><Input type="number" className="text-right" {...field} /></FormControl></FormItem>
                  )} />
                  <div className="col-span-2 flex items-center justify-end">
                    {fields.length > 2 && <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ account_id: '', debit: 0, credit: 0 })}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Line
              </Button>
            </div>

            <div className="grid grid-cols-12 gap-2 font-bold border-t pt-2">
                <div className="col-span-6 text-right">Totals</div>
                <div className="col-span-2 text-right">${totalDebits.toFixed(2)}</div>
                <div className="col-span-2 text-right">${totalCredits.toFixed(2)}</div>
                <div className="col-span-2"></div>
            </div>
            {form.formState.errors.items && <p className="text-sm font-medium text-destructive">{form.formState.errors.items.message}</p>}


            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Entry'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryForm;