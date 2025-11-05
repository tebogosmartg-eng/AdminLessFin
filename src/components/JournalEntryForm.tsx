import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Textarea } from './ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { Trash2 } from 'lucide-react';

const journalEntryItemSchema = z.object({
  account_id: z.string().min(1, "Account is required."),
  type: z.enum(['debit', 'credit']),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
});

const journalEntrySchema = z.object({
  entry_date: z.string().min(1, "Date is required."),
  description: z.string().optional(),
  items: z.array(journalEntryItemSchema).min(2, "At least two accounts are required."),
}).refine(data => {
  const debits = data.items.filter(i => i.type === 'debit').reduce((sum, i) => sum + i.amount, 0);
  const credits = data.items.filter(i => i.type === 'credit').reduce((sum, i) => sum + i.amount, 0);
  return Math.abs(debits - credits) < 0.001; // Use a tolerance for float comparison
}, {
  message: "Total debits must equal total credits.",
  path: ["items"],
});

type JournalEntryFormValues = z.infer<typeof journalEntrySchema>;

const JournalEntryForm = ({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (isOpen: boolean) => void; }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<JournalEntryFormValues>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      entry_date: new Date().toISOString().split('T')[0],
      description: '',
      items: [
        { account_id: '', type: 'debit', amount: 0 },
        { account_id: '', type: 'credit', amount: 0 },
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
  });

  const mutation = useMutation({
    mutationFn: async (values: JournalEntryFormValues) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: user.id,
          entry_date: values.entry_date,
          description: values.description,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const itemsToInsert = values.items.map(item => ({
        journal_entry_id: entry.id,
        account_id: item.account_id,
        type: item.type,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('journal_entry_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Journal entry created successfully.');
      setIsOpen(false);
      form.reset();
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: JournalEntryFormValues) => {
    mutation.mutate(values);
  };

  const debits = form.watch('items').filter(i => i.type === 'debit').reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const credits = form.watch('items').filter(i => i.type === 'credit').reduce((sum, i) => sum + Number(i.amount || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
          <DialogDescription>Record a new financial transaction. Ensure debits equal credits.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="entry_date" render={({ field }) => (
                <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="e.g., Paid monthly office rent" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            
            <div className="space-y-2">
              <FormLabel>Accounts</FormLabel>
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <FormField control={form.control} name={`items.${index}.account_id`} render={({ field }) => (
                    <FormItem className="flex-1"><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger></FormControl><SelectContent>{accounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select></FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.type`} render={({ field }) => (
                    <FormItem><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="debit">Debit</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></FormItem>
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
              <span>Total Debits: ${debits.toFixed(2)}</span>
              <span>Total Credits: ${credits.toFixed(2)}</span>
            </div>

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