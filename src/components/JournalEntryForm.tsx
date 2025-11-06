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
import { Account } from '../pages/ChartOfAccounts';
import { Vendor } from '../pages/Vendors';
import { Customer } from '../pages/Customers';
import { Trash2, X } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

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
      const { data, error } = await supabase
        .from('journal_entries')
        .select('entry_date, description, attachment_url, vendor_id, customer_id, journal_entry_items(account_id, type, amount)')
        .eq('id', entryId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: isEditing && isOpen,
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
  }, [entryToEdit, isEditing, isOpen, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: accounts } = useQuery<Account[]>({ 
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
        if (!activeCompany) return [];
        const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('company_id', activeCompany.id).order('name');
        if (error) throw error;
        return data;
    },
    enabled: !!activeCompany
  });
  const { data: vendors } = useQuery<Vendor[]>({ 
    queryKey: ['vendors', activeCompany?.id],
    queryFn: async () => {
        if (!activeCompany) return [];
        const { data, error } = await supabase.from('vendors').select('*').eq('company_id', activeCompany.id).order('name');
        if (error) throw error;
        return data;
    },
    enabled: !!activeCompany
  });
  const { data: customers } = useQuery<Customer[]>({ 
    queryKey: ['customers', activeCompany?.id],
    queryFn: async () => {
        if (!activeCompany) return [];
        const { data, error } = await supabase.from('customers').select('*').eq('company_id', activeCompany.id).order('name');
        if (error) throw error;
        return data;
    },
    enabled: !!activeCompany
  });

  const mutation = useMutation({
    mutationFn: async (values: JournalEntryFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');

      // 1. Upsert the core journal entry data (without attachment URL)
      let upsertedEntryId: string;
      const entryCoreData = {
        entry_date: values.entry_date,
        description: values.description,
        vendor_id: values.vendor_id || null,
        customer_id: values.customer_id || null,
      };

      if (isEditing) {
        upsertedEntryId = entryId!;
        const { error } = await supabase.from('journal_entries').update(entryCoreData).eq('id', upsertedEntryId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('journal_entries').insert({ ...entryCoreData, company_id: activeCompany.id }).select('id').single();
        if (error) throw error;
        upsertedEntryId = data.id;
      }

      // 2. Sync the journal entry items
      await supabase.from('journal_entry_items').delete().eq('journal_entry_id', upsertedEntryId);
      const itemsToInsert = values.items.map(item => ({ ...item, journal_entry_id: upsertedEntryId }));
      const { error: itemsError } = await supabase.from('journal_entry_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // 3. Handle the attachment file logic
      let newAttachmentUrl: string | null = existingAttachmentUrl;
      let needsUrlUpdate = false;

      if (removeAttachment && existingAttachmentUrl) {
        const oldFilePath = existingAttachmentUrl.split('/attachments/')[1];
        await supabase.storage.from('attachments').remove([oldFilePath]);
        newAttachmentUrl = null;
        needsUrlUpdate = true;
      }

      if (attachmentFile) {
        if (existingAttachmentUrl) {
          const oldFilePath = existingAttachmentUrl.split('/attachments/')[1];
          await supabase.storage.from('attachments').remove([oldFilePath]);
        }
        const fileExt = attachmentFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${upsertedEntryId}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, attachmentFile);
        if (uploadError) throw new Error(`Storage Error: ${uploadError.message}`);
        
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        newAttachmentUrl = urlData.publicUrl;
        needsUrlUpdate = true;
      }

      // 4. If the attachment URL has changed, update the journal entry
      if (needsUrlUpdate) {
        const { error } = await supabase.from('journal_entries').update({ attachment_url: newAttachmentUrl }).eq('id', upsertedEntryId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      queryClient.invalidateQueries({ queryKey: ['journal_entry_detail', entryId] });
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Journal Entry' : 'New Journal Entry'}</DialogTitle>
          <DialogDescription>Record a financial transaction. Ensure debits equal credits.</DialogDescription>
        </DialogHeader>
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