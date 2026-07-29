import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { accountsQuery } from '../lib/queries';
import { Account } from '../pages/ChartOfAccounts';
import { BankStatementLine } from '../lib/banking/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatCurrency } from '../lib/utils';
import { showSuccess, showPlatformError } from '../utils/toast';

const schema = z.object({
  contra_account_id: z.string().min(1, 'Choose the other side of the entry.'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

type StatementLineAdjustmentDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  line: BankStatementLine | null;
};

const StatementLineAdjustmentDialog = ({ isOpen, setIsOpen, line }: StatementLineAdjustmentDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const { data: glAccounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany && isOpen });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { contra_account_id: '', description: '' } });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeCompany || !line) throw new Error('Missing context');
      const { error } = await supabase.functions.invoke('banking', {
        body: {
          method: 'POST_STATEMENT_ADJUSTMENT', company_id: activeCompany.id,
          statementLineId: line.id, contraAccountId: values.contra_account_id, description: values.description || null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_statement_lines', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank_outstanding_lines', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions', activeCompany?.id] });
      showSuccess('Adjustment posted.');
      setIsOpen(false);
      form.reset();
    },
    onError: (error: unknown) => showPlatformError(error, { onRetry: () => form.handleSubmit(onSubmit)() }),
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post Reconciliation Adjustment</DialogTitle>
          <DialogDescription>
            {line && <>{line.line_date} — {line.description || 'No description'} — <span className="font-mono">{formatCurrency(line.amount)}</span></>}
            <br />For bank charges, interest, or errors found on the statement with no matching GL entry — posts through the Posting Engine and resolves this line.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="contra_account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Contra Account</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="e.g. Bank Charges" /></SelectTrigger></FormControl>
                  <SelectContent>{(glAccounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.account_number} — {a.name}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Posting…' : 'Post Adjustment'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default StatementLineAdjustmentDialog;
