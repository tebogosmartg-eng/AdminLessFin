import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { showError, showSuccess } from '../utils/toast';
import { Vendor } from '../pages/Vendors';
import { Account } from '../pages/ChartOfAccounts';

const loanSchema = z.object({
  lender_id: z.string().min(1, 'Lender is required.'),
  principal_amount: z.coerce.number().min(0.01, 'Principal amount must be positive.'),
  interest_rate: z.coerce.number().min(0, 'Interest rate cannot be negative.'),
  term_months: z.coerce.number().int().min(1, 'Term must be at least 1 month.'),
  repayment_frequency: z.enum(['monthly', 'quarterly', 'annually']),
  start_date: z.string().min(1, 'Start date is required.'),
  deposit_account_id: z.string().min(1, 'Deposit account is required.'),
  liability_account_id: z.string().min(1, 'Liability account is required.'),
});

type LoanFormValues = z.infer<typeof loanSchema>;

interface LoanFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  loanId?: string;
}

const LoanForm = ({ isOpen, setIsOpen, loanId }: LoanFormProps) => {
  const { user, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!loanId;
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      repayment_frequency: 'monthly',
      start_date: new Date().toISOString().split('T')[0],
    },
  });

  useEffect(() => {
    if (!isOpen) {
      form.reset({
        repayment_frequency: 'monthly',
        start_date: new Date().toISOString().split('T')[0],
      });
      setAttachmentFile(null);
    }
  }, [isOpen, form]);

  const { data: vendors } = useQuery<Vendor[]>({ queryKey: ['vendors', activeCompany?.id], enabled: !!activeCompany });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts', activeCompany?.id], enabled: !!activeCompany });
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability');

  const mutation = useMutation({
    mutationFn: async (values: LoanFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');

      const { deposit_account_id, ...loanData } = values;
      const lender_name = vendors?.find(v => v.id === values.lender_id)?.name || 'Lender';

      const { data: newLoan, error } = await supabase.functions.invoke('loans', {
        body: {
          method: 'POST',
          company_id: activeCompany.id,
          loanData,
          deposit_account_id,
          lender_name,
        },
      });

      if (error) throw error;

      // Handle file upload after successful loan creation
      if (attachmentFile) {
        const fileExt = attachmentFile.name.split('.').pop();
        const fileName = `agreement.${fileExt}`;
        const filePath = `${activeCompany.id}/loans/${newLoan.id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, attachmentFile, { upsert: true });
        if (uploadError) throw new Error(`Storage Error: ${uploadError.message}`);
        
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        
        const { error: updateError } = await supabase.from('loans').update({ loan_agreement_url: urlData.publicUrl }).eq('id', newLoan.id);
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries', activeCompany?.id] });
      showSuccess(`Loan ${isEditing ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: LoanFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Loan' : 'Add New Loan'}</DialogTitle>
          <DialogDescription>Enter the details of the loan agreement.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <fieldset className="grid grid-cols-2 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Loan Terms</legend>
              <FormField control={form.control} name="lender_id" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Lender</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a lender" /></SelectTrigger></FormControl><SelectContent>{vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="principal_amount" render={({ field }) => (
                <FormItem><FormLabel>Principal Amount</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="interest_rate" render={({ field }) => (
                <FormItem><FormLabel>Interest Rate (%)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="term_months" render={({ field }) => (
                <FormItem><FormLabel>Term (Months)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="start_date" render={({ field }) => (
                <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="repayment_frequency" render={({ field }) => (
                <FormItem className="col-span-2"><FormLabel>Repayment Frequency</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="annually">Annually</SelectItem></SelectContent></Select><FormMessage /></FormItem>
              )} />
            </fieldset>

            <fieldset className="grid grid-cols-2 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1 -mb-2">Accounting</legend>
              <FormField control={form.control} name="deposit_account_id" render={({ field }) => (
                <FormItem><FormLabel>Deposit To</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select asset account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="liability_account_id" render={({ field }) => (
                <FormItem><FormLabel>Loan Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select liability account" /></SelectTrigger></FormControl><SelectContent>{liabilityAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
            </fieldset>

            <FormItem>
              <FormLabel>Loan Agreement (Optional)</FormLabel>
              <FormControl><Input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} /></FormControl>
            </FormItem>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Loan'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default LoanForm;