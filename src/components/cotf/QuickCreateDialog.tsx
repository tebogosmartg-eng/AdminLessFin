import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showError, showSuccess } from '@/utils/toast';
import type { SmartSelectOption } from './SmartSelect';

/**
 * Compact create modal for Create-on-the-Fly. Lightweight by design: it asks only
 * for the minimum fields a record needs. Advanced configuration is completed later
 * from the dedicated management page. Driven entirely by a declarative field list
 * so every master-data entity reuses the same modal.
 */

export type QuickCreateField =
  | {
      name: string;
      label: string;
      type: 'text' | 'number';
      required?: boolean;
      placeholder?: string;
      /** Seed this field with the text the user typed in the search box. */
      prefillFromSearch?: boolean;
      step?: string;
    }
  | {
      name: string;
      label: string;
      type: 'select';
      required?: boolean;
      options: { value: string; label: string }[];
      defaultValue?: string;
    };

export interface QuickCreateConfig {
  /** Modal title, e.g. "New Customer". */
  title: string;
  description?: string;
  fields: QuickCreateField[];
  submitLabel?: string;
  /**
   * Persists the record and returns the created option (id + display label). Any
   * accounting-engine coupling (default costing method, control-account wiring)
   * lives inside this function, never in the modal.
   */
  create: (values: Record<string, string>) => Promise<SmartSelectOption>;
}

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: QuickCreateConfig;
  initialName?: string;
  onCreated: (option: SmartSelectOption) => void;
}

function buildSchema(fields: QuickCreateField[]): z.ZodType<Record<string, string>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (field.type === 'number') {
      const base = z
        .string()
        .refine((v) => v === '' || !Number.isNaN(Number(v)), `${field.label} must be a number.`);
      shape[field.name] = field.required
        ? base.refine((v) => v !== '', `${field.label} is required.`)
        : base;
    } else {
      const base = z.string();
      shape[field.name] = field.required ? base.min(1, `${field.label} is required.`) : base;
    }
  }
  return z.object(shape) as z.ZodType<Record<string, string>>;
}

function defaultValuesFor(fields: QuickCreateField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.name] = field.type === 'select' ? (field.defaultValue ?? '') : '';
  }
  return values;
}

export function QuickCreateDialog({
  open,
  onOpenChange,
  config,
  initialName,
  onCreated,
}: QuickCreateDialogProps) {
  const schema = React.useMemo(() => buildSchema(config.fields), [config.fields]);

  const form = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValuesFor(config.fields),
  });

  // Reset on open so a reused modal never shows the previous entity's input, and
  // seed the "prefillFromSearch" field with whatever the user was searching for.
  React.useEffect(() => {
    if (!open) return;
    const values = defaultValuesFor(config.fields);
    for (const field of config.fields) {
      if (field.type !== 'select' && field.prefillFromSearch && initialName) {
        values[field.name] = initialName;
      }
    }
    form.reset(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName]);

  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) => config.create(values),
    onSuccess: (option) => {
      showSuccess(`${option.label} created.`);
      onCreated(option);
    },
    onError: (error: unknown) => showError(error instanceof Error ? error.message : 'Could not create record.'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
            {config.description ?? 'Enter the essentials now — you can add the rest later.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            {config.fields.map((field) => (
              <FormField
                key={field.name}
                control={form.control}
                name={field.name}
                render={({ field: rhf }) => (
                  <FormItem>
                    <FormLabel>
                      {field.label}
                      {field.required ? <span className="text-destructive"> *</span> : null}
                    </FormLabel>
                    {field.type === 'select' ? (
                      <Select onValueChange={rhf.onChange} value={rhf.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {field.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <Input
                          {...rhf}
                          type={field.type === 'number' ? 'number' : 'text'}
                          step={field.type === 'number' ? (field.step ?? 'any') : undefined}
                          placeholder={field.placeholder}
                          autoFocus={field.prefillFromSearch}
                        />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : (config.submitLabel ?? 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default QuickCreateDialog;
