import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { FormDialog } from '../../components/ui/form-dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';

export type ActionField = {
  name: string;
  label: string;
  type: 'date' | 'text' | 'textarea';
  required?: boolean;
  minLength?: number;
  max?: string;
  help?: string;
  initial?: string;
};

/**
 * A small confirm-with-details dialog for obligation actions. Guards typed
 * text with FormDialog, locks against double submission, and keeps the
 * dialog open with the server's message when an action is refused.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  submitLabel,
  destructive,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  fields: ActionField[];
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
}) {
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? '']));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [openedFor, setOpenedFor] = useState(false);

  // Start clean on each opening edge only (never on a re-render).
  if (open && !openedFor) {
    setOpenedFor(true);
    setValues(initial());
    setError(null);
  } else if (!open && openedFor) {
    setOpenedFor(false);
  }

  const dirty = fields.some((f) => (values[f.name] ?? '') !== (f.initial ?? ''));

  const submit = async () => {
    if (lock.current) return;
    for (const f of fields) {
      const v = (values[f.name] ?? '').trim();
      if (f.required && !v) return setError(`${f.label} is required.`);
      if (f.minLength && v && v.length < f.minLength) return setError(`${f.label} needs at least ${f.minLength} characters.`);
    }
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      await onSubmit(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])));
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action could not be completed.');
    } finally {
      lock.current = false;
      setPending(false);
    }
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} dirty={dirty && !pending}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {fields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={`action-${f.name}`}>
                {f.label}
                {f.required ? '' : ' (optional)'}
              </Label>
              {f.type === 'textarea' ? (
                <Textarea
                  id={`action-${f.name}`}
                  value={values[f.name] ?? ''}
                  maxLength={1000}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : (
                <Input
                  id={`action-${f.name}`}
                  type={f.type}
                  max={f.max}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
              {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
            </div>
          ))}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </FormDialog>
  );
}
