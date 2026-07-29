import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Account } from '../pages/ChartOfAccounts';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { Alert, AlertDescription } from './ui/alert';
import { useAuth } from '../contexts/AuthContext';
import { accountsQuery } from '../lib/queries';

const disposalSchema = z.object({
  disposal_date: z.string().min(1, "Disposal date is required."),
  proceeds: z.coerce.number().min(0, "Proceeds cannot be negative."),
  cash_account_id: z.string().min(1, "Cash/Bank account is required."),
  gain_loss_account_id: z.string().min(1, "Gain/Loss account is required."),
});

type DisposalFormValues = z.infer<typeof disposalSchema>;

interface AssetDisposalFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  asset: {
    id: string;
    description: string;
    purchase_cost: number;
    accumulated_depreciation: number;
  };
}

const AssetDisposalForm = ({ isOpen, setIsOpen, asset }: AssetDisposalFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<DisposalFormValues>({
    resolver: zodResolver(disposalSchema),
    defaultValues: {
      disposal_date: format(new Date(), 'yyyy-MM-dd'),
      proceeds: 0,
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        disposal_date: format(new Date(), 'yyyy-MM-dd'),
        proceeds: 0,
        cash_account_id: '',
        gain_loss_account_id: '',
      });
    }
  }, [isOpen, form]);

  const { data: accounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const assetAccounts = accounts?.filter(a => a.type === 'Asset');
  const incomeExpenseAccounts = accounts?.filter(a => ['Income', 'Expense'].includes(a.type));

  const mutation = useMutation({
    mutationFn: async (values: DisposalFormValues) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'DISPOSE',
          company_id: activeCompany.id,
          asset_id: asset.id,
          disposal_date: values.disposal_date,
          proceeds: values.proceeds,
          cash_account_id: values.cash_account_id,
          gain_loss_account_id: values.gain_loss_account_id,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixed_assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset_detail', asset.id] });
      queryClient.invalidateQueries({ queryKey: ['journal_entries'] });
      showSuccess('Asset disposed successfully.');
      setIsOpen(false);
    },
    onError: (error: any) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: DisposalFormValues) => mutation.mutate(values);

  const proceeds = form.watch('proceeds');
  const netBookValue = asset.purchase_cost - asset.accumulated_depreciation;
  const gainOrLoss = useMemo(() => proceeds - netBookValue, [proceeds, netBookValue]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dispose Asset</DialogTitle>
          <DialogDescription>{asset.description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="disposal_date" render={({ field }) => (<FormItem><FormLabel>Disposal Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="proceeds" render={({ field }) => (<FormItem><FormLabel>Proceeds from Sale</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="cash_account_id" render={({ field }) => (<FormItem><FormLabel>Deposit Proceeds To</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a cash/bank account" /></SelectTrigger></FormControl><SelectContent>{assetAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="gain_loss_account_id" render={({ field }) => (<FormItem><FormLabel>Gain/Loss Account</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select an income/expense account" /></SelectTrigger></FormControl><SelectContent>{incomeExpenseAccounts?.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
            
            <Alert>
              <AlertDescription className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Net Book Value:</span> <span className="font-mono">{formatCurrency(netBookValue)}</span></div>
                <div className="flex justify-between"><span>Proceeds:</span> <span className="font-mono">{formatCurrency(proceeds)}</span></div>
                <div className="flex justify-between font-semibold">
                  <span>{gainOrLoss >= 0 ? 'Gain on Disposal:' : 'Loss on Disposal:'}</span>
                  <span className="font-mono">{formatCurrency(Math.abs(gainOrLoss))}</span>
                </div>
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Processing...' : 'Record Disposal'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AssetDisposalForm;