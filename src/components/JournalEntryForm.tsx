import { useEffect, useState } from 'react';
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
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackFirstUsageEvent } from '@/lib/analytics/productAnalytics';
import { Account } from '../pages/ChartOfAccounts';
import { Vendor } from '../pages/Vendors';
import { Customer } from '../pages/Customers';
import { Trash2, X, Sparkles, Loader2 } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { accountsQuery, customersQuery, vendorsQuery } from '../lib/queries';

const journalEntryItemSchema = z.object({
  account_id: z.string().min(1, "Account is required."),
  type: z.enum(['debit', 'credit']),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
});

const journalEntrySchema = z.object({
  entry_date: z.string().min(1, "Date is required."),
  description: z.string().optional(),
  vendor_id: z.string().optional(),
  customer_id: z.string().optional(),
  items: z.array(journalEntryItemSchema).min(2, "At least two accounts are required."),
}).refine(data => {
  const debits = data.items.filter(i => i.type === 'debit').reduce((sum, i) => sum + i.amount, 0);
  const credits = data.items.filter(i => i.type === 'credit').reduce((sum, i) => sum + i.amount, 0);
  return Math.abs(debits - credits) < 0.001;
}, {
  message: "Total debits must equal total credits.",
  path: ["items"],
});

type JournalEntryFormValues = z.infer<typeof journalEntrySchema>;

interface JournalEntryFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  entryId?: string;
}

const JournalEntryForm = ({ isOpen, setIsOpen, entryId }: JournalEntryFormProps) => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!entryId;
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [existingAttachmentUrl, setExistingAttachmentUrl] = useState<string | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  
  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);

  const form = useForm<JournalEntryFormValues>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      entry_date: new Date().toISOString().split('T')[0],
      description: '',
      vendor_id: '',
      customer_id: '',
      items: [
        { account_id: '', type: 'debit', amount: 0 },
        { account_id: '', type: 'credit', amount: 0 },
      ],
    },
  });

  const { data: entryToEdit } = useQuery({
    queryKey: ['journal_entry_edit', entryId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('journal-entries', {
        body: {
          method: 'GET',
          company_id: activeCompany!.id,
          select: 'entry_date, description, attachment_url, vendor_id, customer_id, journal_entry_items(account_id, type, amount)',
          filters: { id: entryId },
        }
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: isEditing && isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (isEditing && entryToEdit) {
      form.reset({
        entry_date: entryToEdit.entry_date,
        description: entryToEdit.description || '',
        vendor_id: entryToEdit.vendor_id || '',
        customer_id: entryToEdit.customer_id || '',
        items: entryToEdit.journal_entry_items,
      });
      setExistingAttachmentUrl(entryToEdit.attachment_url);
    } else if (!isEditing) {
      form.reset({
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        vendor_id: '',
        customer_id: '',
        items: [
          { account_id: '', type: 'debit', amount: 0 },
          { account_id: '', type: 'credit', amount: 0 },
        ],
      });
      setExistingAttachmentUrl(null);
    }
    setAttachmentFile(null);
    setRemoveAttachment(false);
    setAiPrompt('');
  }, [entryToEdit, isEditing, isOpen, form]);

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: vendors } = useQuery<Vendor[]>({ ...vendorsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: customers } = useQuery<Customer[]>({ ...customersQuery(activeCompany!.id), enabled: !!activeCompany });

  const handleMagicFill = async () => {
    if (!aiPrompt.trim()) return;
    setIsMagicLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-copilot', {
        body: {
          method: 'JOURNAL_ENTRY',
          company_id: activeCompany!.id,
          prompt: aiPrompt,
        }
      });

      if (error) throw new Error(error.message);
      
      if (data && data.items) {
        replace(data.items);
        if (data.description) {
          form.setValue('description', data.description);
        }
        showSuccess("Magic Fill applied!");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate journal suggestion';
      showError(message.includes('OPENAI') ? 'AI is not configured yet. Set OPENAI_API_KEY.' : message);
    } finally {
      setIsMagicLoading(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: JournalEntryFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');

      let finalAttachmentUrl = existingAttachmentUrl;

      if (removeAttachment && existingAttachmentUrl) {
        const oldFilePath = existingAttachmentUrl.split('/attachments/')[1];
        await supabase.storage.from('attachments').remove([oldFilePath]);
        finalAttachmentUrl = null;
      }

      if (attachmentFile) {
        if (existingAttachmentUrl) {
          const oldFilePath = existingAttachmentUrl.split('/attachments/')[1];
          await supabase.storage.from('attachments').remove([oldFilePath]);
        }
        const fileExt = attachmentFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const tempEntryId = entryId || crypto.randomUUID();
        const filePath = `${user.id}/${tempEntryId}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, attachmentFile);
        if (uploadError) throw new Error(`Storage Error: ${uploadError.message}`);
        
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        finalAttachmentUrl = urlData.publicUrl;
      }

      const method = isEditing ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        entryData: { ...values, attachment_url: finalAttachmentUrl },
        ...(isEditing && { entryId: entryId }),
      };

      const { error } = await supabase.functions.invoke('journal-entries', { body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entry_detail', entryId] });
      if (!isEditing && activeCompany) {
        trackFirstUsageEvent(activeCompany.id, AnalyticsEvents.USAGE_FIRST_JOURNAL, 'journal');
      }
      showSuccess(`Journal entry ${isEditing ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: JournalEntryFormValues) => mutation.mutate(values);
  const debits = form.watch('items').filter(i => i.type === 'debit').reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const credits = form.watch('items').filter(i => i.type === 'credit').reduce((sum, i) => sum + Number(i.amount || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Journal Entry' : 'New Journal Entry'}</DialogTitle>
          <DialogDescription>Record a financial transaction. Ensure debits equal credits.</DialogDescription>
        </DialogHeader>

        {!isEditing && (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 p-4 rounded-lg border border-indigo-100 dark:border-indigo-900 mb-2">
            <label className="text-indigo-800 dark:text-indigo-300 text-sm font-semibold flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4" /> AI Copilot
            </label>
            <div className="flex gap-2">
              <Input 
                placeholder="E.g., Bought $1,200 MacBook Pro using Checking account" 
                value={aiPrompt} 
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleMagicFill(); } }}
                className="bg-white/80 dark:bg-black/20 border-indigo-200 dark:border-indigo-800"
              />
              <Button onClick={handleMagicFill} disabled={isMagicLoading || !aiPrompt.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                 {isMagicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Magic Fill'}
              </Button>
            </div>
            <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70 mt-2">Just type what happened. The AI will perfectly categorize the debits and credits.</p>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="entry_date" render={({ field }) => (
                <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div />
              <FormField control={form.control} name="vendor_id" render={({ field }) => (
                <FormItem><FormLabel>Vendor (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a vendor" /></SelectTrigger></FormControl>
                    <SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="customer_id" render={({ field }) => (
                <FormItem><FormLabel>Customer (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger></FormControl>
                    <SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
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

            <FormItem>
              <FormLabel>Attachment (Optional)</FormLabel>
              {existingAttachmentUrl && !attachmentFile && !removeAttachment && (
                <div className="flex items-center justify-between p-2 border rounded-md">
                  <a href={existingAttachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline truncate">
                    {existingAttachmentUrl.split('/').pop()}
                  </a>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRemoveAttachment(true)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {removeAttachment && (
                <div className="text-sm text-muted-foreground p-2 border rounded-md border-dashed">
                  Attachment will be removed. <Button type="button" variant="link" className="p-0 h-auto" onClick={() => setRemoveAttachment(false)}>Undo</Button>
                </div>
              )}
              <FormControl>
                <Input 
                  type="file" 
                  onChange={(e) => {
                    setAttachmentFile(e.target.files?.[0] || null);
                    setRemoveAttachment(false);
                  }} 
                />
              </FormControl>
            </FormItem>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : (isEditing ? 'Update Entry' : 'Save Entry')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryForm;