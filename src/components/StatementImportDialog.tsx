import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Trash2, Plus, ClipboardPaste } from 'lucide-react';
import { showSuccess, showPlatformError } from '../utils/toast';

const lineSchema = z.object({
  line_date: z.string().min(1),
  description: z.string().optional(),
  amount: z.coerce.number(),
  external_reference: z.string().optional(),
});

const importSchema = z.object({
  bank_account_id: z.string().min(1, 'Choose an account.'),
  file_name: z.string().optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  opening_balance: z.coerce.number().optional(),
  closing_balance: z.coerce.number().optional(),
  lines: z.array(lineSchema).min(1, 'Add at least one statement line.'),
});
type ImportFormValues = z.infer<typeof importSchema>;

type StatementImportDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  bankAccountId: string;
};

const StatementImportDialog = ({ isOpen, setIsOpen, bankAccountId }: StatementImportDialogProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [pasteText, setPasteText] = useState('');

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
    defaultValues: {
      bank_account_id: bankAccountId, file_name: '', period_start: '', period_end: '',
      opening_balance: undefined, closing_balance: undefined,
      lines: [{ line_date: new Date().toISOString().split('T')[0], description: '', amount: 0, external_reference: '' }],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'lines' });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        bank_account_id: bankAccountId, file_name: '', period_start: '', period_end: '',
        opening_balance: undefined, closing_balance: undefined,
        lines: [{ line_date: new Date().toISOString().split('T')[0], description: '', amount: 0, external_reference: '' }],
      });
      setPasteText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bankAccountId]);

  const parsePaste = () => {
    // date,description,amount,reference — one line per statement transaction.
    const rows = pasteText
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r.split(','))
      .filter((cols) => cols.length >= 3)
      .map((cols) => ({
        line_date: cols[0]?.trim(),
        description: cols[1]?.trim() ?? '',
        amount: Number(cols[2]?.trim() ?? 0),
        external_reference: cols[3]?.trim() ?? '',
      }));
    if (rows.length === 0) return;
    replace(rows);
  };

  const mutation = useMutation({
    mutationFn: async (values: ImportFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      const { data, error } = await supabase.functions.invoke('banking', {
        body: {
          method: 'IMPORT_STATEMENT', company_id: activeCompany.id,
          statementData: {
            bank_account_id: values.bank_account_id,
            file_name: values.file_name || null,
            period_start: values.period_start || null,
            period_end: values.period_end || null,
            opening_balance: values.opening_balance ?? null,
            closing_balance: values.closing_balance ?? null,
            lines: values.lines,
          },
        },
      });
      if (error) throw error;
      return data as { import_id: string; inserted_count: number; duplicate_count: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bank_statement_lines', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank_outstanding_lines', activeCompany?.id] });
      showSuccess(`Statement imported: ${data.inserted_count} line(s) added, ${data.duplicate_count} duplicate(s) skipped.`);
      setIsOpen(false);
    },
    onError: (error: unknown) => showPlatformError(error, { onRetry: () => form.handleSubmit(onSubmit)() }),
  });

  const onSubmit = (values: ImportFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Bank Statement</DialogTitle>
          <DialogDescription>Lines already imported for this account (matched by reference) are skipped automatically.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="file_name" render={({ field }) => (
                <FormItem><FormLabel>Statement Label (optional)</FormLabel><FormControl><Input placeholder="e.g. June 2025 statement" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="period_start" render={({ field }) => (
                  <FormItem><FormLabel>Period Start</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="period_end" render={({ field }) => (
                  <FormItem><FormLabel>Period End</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="opening_balance" render={({ field }) => (
                <FormItem><FormLabel>Statement Opening Balance</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="closing_balance" render={({ field }) => (
                <FormItem><FormLabel>Statement Closing Balance</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <FormLabel className="text-xs text-muted-foreground">Paste lines (date,description,amount,reference — one per line)</FormLabel>
              <Textarea rows={3} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="2025-06-15,Card payment,-120.50,REF001" />
              <Button type="button" variant="outline" size="sm" onClick={parsePaste}><ClipboardPaste className="mr-2 h-4 w-4" />Parse into table</Button>
            </div>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[130px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[120px] text-right">Amount</TableHead>
                    <TableHead className="w-[140px]">Reference</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((f, i) => (
                    <TableRow key={f.id}>
                      <TableCell><Input type="date" {...form.register(`lines.${i}.line_date`)} /></TableCell>
                      <TableCell><Input {...form.register(`lines.${i}.description`)} /></TableCell>
                      <TableCell><Input type="number" step="0.01" className="text-right" {...form.register(`lines.${i}.amount`)} /></TableCell>
                      <TableCell><Input {...form.register(`lines.${i}.external_reference`)} /></TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-2">
                <Button type="button" variant="outline" size="sm" onClick={() => append({ line_date: new Date().toISOString().split('T')[0], description: '', amount: 0, external_reference: '' })}>
                  <Plus className="mr-2 h-4 w-4" />Add Line
                </Button>
              </div>
            </div>
            {form.formState.errors.lines?.root && <p className="text-sm text-destructive">{form.formState.errors.lines.root.message}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Importing…' : 'Import Statement'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default StatementImportDialog;
