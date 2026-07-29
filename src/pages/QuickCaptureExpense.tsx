import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { bankAccountsQuery } from '../lib/queries';
import { showPlatformError, showSuccess } from '../utils/toast';

function parseFunctionResult<T>(data: T | null, error: Error | null): T {
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { parseReceiptText, type ReceiptExtraction } from '../lib/quickCapture/parseReceiptText';

const LOW_CONFIDENCE = 0.6;

const schema = z
  .object({
    description: z.string().optional(),
    vendor_name: z.string().optional(),
    amount: z.coerce.number().positive('Amount must be greater than zero.'),
    expense_date: z.string().min(1, 'Date is required.'),
    payment_source_kind: z.enum(['bank_account', 'owner_paid']),
    bank_account_id: z.string().optional(),
    category_id: z.string().min(1, 'Category is required.'),
  })
  .superRefine((values, ctx) => {
    if (values.payment_source_kind === 'bank_account' && !values.bank_account_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a payment account.', path: ['bank_account_id'] });
    }
  });

type FormValues = z.infer<typeof schema>;

type Category = {
  id: string;
  label: string;
  expense_account_id: string;
};

const QuickCaptureExpense = () => {
  useDocumentTitle('Quick Capture Expense');
  const navigate = useNavigate();
  const { activeCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<ReceiptExtraction | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const { data: bankAccounts } = useQuery({
    ...bankAccountsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['quick_expense_categories', activeCompany?.id],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('quick-capture-expense', {
        body: { method: 'GET_CATEGORIES', company_id: activeCompany!.id },
      });
      let rows = parseFunctionResult<Category[]>(data, error) ?? [];
      if (rows.length === 0) {
        await supabase.functions.invoke('quick-capture-expense', {
          body: { method: 'SEED_CATEGORIES', company_id: activeCompany!.id },
        });
        const seeded = await supabase.functions.invoke('quick-capture-expense', {
          body: { method: 'GET_CATEGORIES', company_id: activeCompany!.id },
        });
        rows = parseFunctionResult<Category[]>(seeded.data, seeded.error) ?? [];
      }
      return rows;
    },
  });

  const activeBankAccounts = useMemo(
    () => (bankAccounts ?? []).filter((a) => a.status === 'active'),
    [bankAccounts]
  );
  const defaultBankId =
    activeBankAccounts.find((a) => a.is_default)?.id ?? activeBankAccounts[0]?.id ?? '';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: '',
      vendor_name: '',
      amount: 0,
      expense_date: new Date().toISOString().split('T')[0],
      payment_source_kind: 'bank_account',
      bank_account_id: '',
      category_id: '',
    },
  });

  useEffect(() => {
    if (defaultBankId && !form.getValues('bank_account_id')) {
      form.setValue('bank_account_id', defaultBankId);
    }
  }, [defaultBankId, form]);

  useEffect(() => {
    if (categories?.length && !form.getValues('category_id')) {
      form.setValue('category_id', categories[0].id);
    }
  }, [categories, form]);

  const paymentSource = form.watch('payment_source_kind');
  const vendorName = form.watch('vendor_name');
  const description = form.watch('description');

  // Phase 5: frequency-based category suggestion (pre-select, one-tap changeable).
  useEffect(() => {
    if (!activeCompany || (!vendorName && !description)) return;
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke('quick-capture-expense', {
        body: {
          method: 'SUGGEST_CATEGORY',
          company_id: activeCompany.id,
          vendor_name: vendorName || null,
          description: description || null,
        },
      });
      if (error) return;
      const suggestion = parseFunctionResult<{ category_id: string } | null>(data, error);
      if (suggestion?.category_id) {
        form.setValue('category_id', suggestion.category_id);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [activeCompany, vendorName, description, form]);

  const lowConfidenceFields = useMemo(() => {
    const conf = extraction?.confidence ?? {};
    return Object.entries(conf)
      .filter(([, score]) => typeof score === 'number' && score < LOW_CONFIDENCE)
      .map(([field]) => field);
  }, [extraction]);

  const uploadAttachment = async (captureOrTxnKey: string) => {
    if (!attachmentFile || !activeCompany) return null;
    const fileExt = attachmentFile.name.split('.').pop() || 'jpg';
    const filePath = `${activeCompany.id}/quick-capture/${captureOrTxnKey}/receipt.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, attachmentFile, { upsert: true });
    if (uploadError) throw new Error(`Storage Error: ${uploadError.message}`);
    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!activeCompany || !user) throw new Error('No active company');
      const category = categories?.find((c) => c.id === values.category_id);
      if (!category) throw new Error('Category not found');

      // Upload first with a staging key, then CAPTURE stores the URL on the right row.
      const stagingKey = crypto.randomUUID();
      const attachmentUrl = await uploadAttachment(stagingKey);

      // Branching: owner_paid → record_owner_paid_expense_atomic;
      // bank_account → record_bank_transaction_atomic (withdrawal) + capture metadata.
      const { data, error } = await supabase.functions.invoke('quick-capture-expense', {
        body: {
          method: 'CAPTURE',
          company_id: activeCompany.id,
          payment_source_kind: values.payment_source_kind,
          bank_account_id: values.payment_source_kind === 'bank_account' ? values.bank_account_id : null,
          expense_account_id: category.expense_account_id,
          category_id: values.category_id,
          amount: values.amount,
          expense_date: values.expense_date,
          description: values.description || null,
          vendor_name: values.vendor_name || null,
          attachment_url: attachmentUrl,
        },
      });
      return parseFunctionResult(data, error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank_transactions', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['quick_expense_captures', activeCompany?.id] });
      showSuccess('Expense captured.');
      navigate('/purchases');
    },
    onError: (error: unknown) => showPlatformError(error),
  });

  const runOcr = async (file: File) => {
    if (!activeCompany) return;
    setOcrLoading(true);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Prefer OpenAI vision via edge function when configured; else local Tesseract.
      const { data, error } = await supabase.functions.invoke('quick-capture-expense', {
        body: {
          method: 'EXTRACT_RECEIPT',
          company_id: activeCompany.id,
          image_base64: base64,
        },
      });

      let extracted: ReceiptExtraction | null = null;
      if (!error && data && !(data as { unavailable?: boolean }).unavailable) {
        const remote = data as ReceiptExtraction & { unavailable?: boolean };
        extracted = {
          provider: 'openai-gpt-4o-mini',
          vendor_name: remote.vendor_name ?? null,
          amount: remote.amount ?? null,
          expense_date: remote.expense_date ?? null,
          description: remote.description ?? null,
          confidence: remote.confidence ?? {
            vendor_name: 0.5,
            amount: 0.5,
            expense_date: 0.5,
            description: 0.5,
          },
        };
      } else {
        const Tesseract = await import('tesseract.js');
        const result = await Tesseract.recognize(file, 'eng');
        const mean = (result.data.confidence ?? 0) / 100;
        extracted = parseReceiptText(result.data.text || '', mean, 'tesseract.js');
      }

      setExtraction(extracted);
      if (extracted?.vendor_name) form.setValue('vendor_name', extracted.vendor_name);
      if (extracted?.amount) form.setValue('amount', extracted.amount);
      if (extracted?.expense_date) form.setValue('expense_date', extracted.expense_date);
      if (extracted?.description) form.setValue('description', extracted.description);
      showSuccess(`Receipt scanned via ${extracted.provider} — confirm values before submitting.`);
    } catch (err) {
      showPlatformError(err);
    } finally {
      setOcrLoading(false);
    }
  };

  const onFileChange = async (file: File | null) => {
    setAttachmentFile(file);
    setExtraction(null);
    if (file) await runOcr(file);
  };

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  const fieldNeedsReview = (field: string) => lowConfidenceFields.includes(field);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/purchases')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quick Capture Expense</h1>
          <p className="text-muted-foreground text-sm">
            Record a paid expense without creating a supplier bill.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense details</CardTitle>
          <CardDescription>
            Photo is optional. Confirm any scanned values before submit — nothing posts automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <FormLabel>Receipt photo</FormLabel>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  />
                  {ocrLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Camera className="h-4 w-4 text-muted-foreground" />
                </div>
                {lowConfidenceFields.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      Low-confidence scan fields need your review:{' '}
                      {lowConfidenceFields.map((f) => (
                        <Badge key={f} variant="outline" className="mr-1 border-amber-400">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="vendor_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={fieldNeedsReview('vendor_name') ? 'text-amber-700' : undefined}>
                      Vendor name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional"
                        className={fieldNeedsReview('vendor_name') ? 'border-amber-400' : undefined}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={fieldNeedsReview('description') ? 'text-amber-700' : undefined}>
                      Description
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional if photo or vendor is captured"
                        className={fieldNeedsReview('description') ? 'border-amber-400' : undefined}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={fieldNeedsReview('amount') ? 'text-amber-700' : undefined}>
                        Amount
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          className={fieldNeedsReview('amount') ? 'border-amber-400' : undefined}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expense_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={fieldNeedsReview('expense_date') ? 'text-amber-700' : undefined}>
                        Date
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          className={fieldNeedsReview('expense_date') ? 'border-amber-400' : undefined}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="payment_source_kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment source</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bank_account">Bank / cash / petty cash</SelectItem>
                        <SelectItem value="owner_paid">I paid personally</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {paymentSource === 'bank_account' && (
                <FormField
                  control={form.control}
                  name="bank_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From account</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeBankAccounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} ({a.account_type})
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
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={categoriesLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Capture expense
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuickCaptureExpense;
