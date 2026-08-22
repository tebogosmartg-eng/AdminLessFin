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
import { useDialogFormReset } from '../hooks/useDialogFormReset';
import {
  classificationError,
  classificationsForType,
  subclassificationError,
  subclassificationsForClassification,
} from '../lib/accounting/accountClassification';

const NO_STATEMENT_LINE = '__none__';

// Classification is what the Trial Balance and the financial statements read.
// It is mandatory, and only the classifications valid for the chosen type are
// accepted — the same rules the chart-of-accounts edge function enforces.
const accountSchema = z
  .object({
    name: z.string().min(1, 'Account name is required.'),
    type: z.enum(['Asset', 'Liability', 'Equity', 'Income', 'Expense']),
    category: z.string().min(1, 'Classification is required.'),
    subcategory: z.string().optional(),
    description: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const categoryIssue = classificationError(values.type, values.category);
    if (categoryIssue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['category'], message: categoryIssue });
      return;
    }
    const subIssue = subclassificationError(values.category, values.subcategory);
    if (subIssue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subcategory'], message: subIssue });
    }
  });

type AccountFormValues = z.infer<typeof accountSchema>;

interface AccountFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  account?: Account;
}

const AccountForm = ({ isOpen, setIsOpen, account }: AccountFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const isSystemAccount = !!account?.system_account;
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      type: 'Asset',
      category: '',
      subcategory: '',
      description: '',
    },
  });

  useDialogFormReset(isOpen, account?.id ?? 'new', () => {
    if (account) {
      form.reset({
        name: account.name,
        type: account.type,
        // An existing account with no classification opens blank, so the field
        // is answered rather than silently defaulted on the customer's behalf.
        category: account.category || '',
        subcategory: account.subcategory || '',
        description: account.description || '',
      });
    } else {
      form.reset({
        name: '',
        type: 'Asset',
        category: '',
        subcategory: '',
        description: '',
      });
    }
  });

  const selectedType = form.watch('type');
  const selectedCategory = form.watch('category');
  const classificationOptions = classificationsForType(selectedType);
  const statementLineOptions = subclassificationsForClassification(selectedCategory);

  // This mutation creates or updates data by calling a secure Supabase Edge Function.
  const mutation = useMutation({
    mutationFn: async (values: AccountFormValues & { subcategory: string | null }) => {
      if (!activeCompany) throw new Error('No active company selected');

      const method = account ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        accountData: values,
        ...(account && { accountId: account.id }),
      };

      const { error } = await supabase.functions.invoke('chart-of-accounts', { body });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      showSuccess(`Account ${account ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const handleTypeChange = (nextType: AccountFormValues['type']) => {
    form.setValue('type', nextType, { shouldValidate: false });
    // A classification belongs to exactly one type, so changing the type
    // invalidates it. Clear rather than carry a now-impossible combination.
    form.setValue('category', '', { shouldValidate: false });
    form.setValue('subcategory', '', { shouldValidate: false });
  };

  const handleCategoryChange = (nextCategory: string) => {
    form.setValue('category', nextCategory, { shouldValidate: true });
    form.setValue('subcategory', '', { shouldValidate: false });
  };

  const onSubmit = (values: AccountFormValues) => {
    mutation.mutate({
      ...values,
      subcategory: values.subcategory ? values.subcategory : null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit Account' : 'Add New Account'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Checking Account" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Type</FormLabel>
                  <Select
                    onValueChange={(v) => handleTypeChange(v as AccountFormValues['type'])}
                    value={field.value}
                    disabled={isSystemAccount}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an account type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Asset">Asset</SelectItem>
                      <SelectItem value="Liability">Liability</SelectItem>
                      <SelectItem value="Equity">Equity</SelectItem>
                      <SelectItem value="Income">Income</SelectItem>
                      <SelectItem value="Expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                  {isSystemAccount ? (
                    <p className="text-xs text-muted-foreground">
                      System account type is locked. You can still rename or update the description.
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Classification</FormLabel>
                  <Select onValueChange={handleCategoryChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a classification" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {classificationOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Determines where this account presents in the Trial Balance and the financial
                    statements. Presentation only — it never changes a posted amount.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            {statementLineOptions.length > 0 && (
              <FormField
                control={form.control}
                name="subcategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Statement line (optional)</FormLabel>
                    <Select
                      onValueChange={(v) =>
                        field.onChange(v === NO_STATEMENT_LINE ? '' : v)
                      }
                      value={field.value || NO_STATEMENT_LINE}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No statement line" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_STATEMENT_LINE}>No statement line</SelectItem>
                        {statementLineOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional: A brief description of the account" {...field} />
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
                {mutation.isPending ? 'Saving...' : 'Save Account'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AccountForm;