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
import { Employee } from '../pages/Employees';
import { Account } from '../pages/ChartOfAccounts';
import { Project } from '../pages/Projects';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { projectsQuery } from '../lib/queries';

const itemSchema = z.object({
  expense_date: z.string().min(1, "Date is required."),
  description: z.string().min(1, "Description is required."),
  amount: z.coerce.number().min(0.01, "Amount must be positive."),
  expense_account_id: z.string().min(1, "Account is required."),
  project_id: z.string().optional(),
});

const schema = z.object({
  employee_id: z.string().min(1, "Employee is required."),
  claim_number: z.string().min(1, "Claim number is required."),
  submission_date: z.string().min(1, "Date is required."),
  description: z.string().optional(),
  items: z.array(itemSchema).min(1, "At least one item is required."),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  claimId?: string;
}

const ExpenseClaimForm = ({ isOpen, setIsOpen, claimId }: Props) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!claimId;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      claim_number: '',
      submission_date: format(new Date(), 'yyyy-MM-dd'),
      employee_id: '',
      description: '',
      items: [{ expense_date: format(new Date(), 'yyyy-MM-dd'), description: '', amount: 0, expense_account_id: '', project_id: '' }],
    },
  });

  const { data: nextNumber } = useQuery({
    queryKey: ['next_claim_number', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('expense-claims', {
        body: { method: 'GET_NEXT_NUMBER', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !isEditing && !!activeCompany,
  });

  const { data: existingClaim } = useQuery({
    queryKey: ['claim_edit', claimId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('expense-claims', {
        body: { method: 'GET_ONE', company_id: activeCompany!.id, claimId },
      });
      if (error) throw error;
      return data;
    },
    enabled: isEditing && isOpen && !!activeCompany,
  });

  useEffect(() => {
    if (nextNumber && !isEditing) {
      form.setValue('claim_number', nextNumber);
    }
  }, [nextNumber, isEditing, form]);

  useEffect(() => {
    if (isEditing && existingClaim) {
      form.reset({
        employee_id: existingClaim.employee_id,
        claim_number: existingClaim.claim_number,
        submission_date: existingClaim.submission_date,
        description: existingClaim.description || '',
        items: existingClaim.expense_claim_items.map((i: any) => ({
          expense_date: i.expense_date,
          description: i.description,
          amount: i.amount,
          expense_account_id: i.expense_account_id,
          project_id: i.project_id || '',
        })),
      });
    }
  }, [existingClaim, isEditing, isOpen, form]);

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const { data: employees } = useQuery<Employee[]>({ 
    queryKey: ['employees', activeCompany?.id],
    queryFn: async () => {
        if (!activeCompany) return [];
        const { data, error } = await supabase.functions.invoke('employees', { body: { method: 'GET', company_id: activeCompany.id } });
        if(error) throw error;
        return data;
    }
  });
  
  const { data: accounts } = useQuery<Account[]>({ queryKey: ['accounts', activeCompany?.id] });
  const { data: projects } = useQuery<Project[]>({ ...projectsQuery(activeCompany?.id!), enabled: !!activeCompany });

  const expenseAccounts = accounts?.filter(a => a.type === 'Expense');

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const method = isEditing ? 'PUT' : 'POST';
      
      const items = values.items.map(item => ({
        ...item,
        project_id: item.project_id || null,
      }));

      const { error } = await supabase.functions.invoke('expense-claims', {
        body: {
          method,
          company_id: activeCompany.id,
          claimId,
          claimData: { ...values, items },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_claims'] });
      showSuccess(`Expense Claim ${isEditing ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => showError(`Error: ${error.message}`),
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  const items = form.watch('items');
  const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Claim' : 'New Expense Claim'}</DialogTitle>
          <DialogDescription>Submit expenses for reimbursement.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="employee_id" render={({ field }) => (<FormItem><FormLabel>Employee</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{employees?.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="claim_number" render={({ field }) => (<FormItem><FormLabel>Claim #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="submission_date" render={({ field }) => (<FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Memo</FormLabel><FormControl><Input placeholder="e.g. Travel to Client Site" {...field} /></FormControl><FormMessage /></FormItem>)} />
            
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-2">Date</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-2">Account</div>
                <div className="col-span-2">Project</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <FormField control={form.control} name={`items.${index}.expense_date`} render={({ field }) => (<FormItem className="col-span-2"><FormControl><Input type="date" {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="col-span-3"><FormControl><Input placeholder="Desc" {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name={`items.${index}.expense_account_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Acc" /></SelectTrigger></FormControl><SelectContent>{expenseAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                  <FormField control={form.control} name={`items.${index}.project_id`} render={({ field }) => (<FormItem className="col-span-2"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="-" /></SelectTrigger></FormControl><SelectContent><SelectItem value="">None</SelectItem>{projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></FormItem>)} />
                  <FormField control={form.control} name={`items.${index}.amount`} render={({ field }) => (<FormItem className="col-span-2"><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl></FormItem>)} />
                  <div className="col-span-1 pt-1 flex justify-end"><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ expense_date: format(new Date(), 'yyyy-MM-dd'), description: '', amount: 0, expense_account_id: '', project_id: '' })}>Add Line</Button>
            </div>

            <div className="flex justify-end pt-2 border-t">
               <span className="text-lg font-bold">Total: {formatCurrency(totalAmount)}</span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Claim'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseClaimForm;