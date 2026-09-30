import { useCallback, useEffect, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

/**
 * Typed work survives everything except a deliberate discard.
 *
 * A transaction form used to live only in component state: a page refresh, a
 * crash, a company switch from another tab, or the browser closing took the
 * half-captured invoice with it. This hook keeps the form's values in
 * localStorage while the user types, restores them the next time the same
 * form is opened, and warns before the page unloads with unsaved work.
 *
 * The draft is:
 *  - written (debounced) on every change while the form is open and dirty;
 *  - flushed synchronously when the form unmounts or the page unloads;
 *  - restored on the next open, announced with a toast that offers to
 *    start fresh instead;
 *  - cleared by the form on successful save, or by "start fresh";
 *  - dropped automatically once it is a week old.
 *
 * Drafts are kept for NEW records only. An edit form's truth is the server;
 * restoring a stale local copy over it would be worse than the loss.
 */

const PREFIX = 'adminless.formdraft.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 600;

type Stored = { savedAt: number; values: unknown };

/** One draft slot per company + form. */
export function draftKey(companyId: string | undefined | null, formName: string): string | null {
  return companyId ? `${PREFIX}:${companyId}:${formName}` : null;
}

function read(key: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.values) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function write(key: string, values: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), values }));
  } catch {
    /* Storage full or blocked: the in-memory form still has the values. */
  }
}

export function useFormPersistence<T extends FieldValues>(
  form: UseFormReturn<T>,
  opts: {
    /** Where the draft lives; null disables the hook (e.g. while editing). */
    storageKey: string | null;
    /** True while the form is open in front of the user. */
    active: boolean;
  },
): { clear: () => void } {
  const { storageKey, active } = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleared = useRef(false);
  const formRef = useRef(form);
  formRef.current = form;

  const clear = useCallback(() => {
    cleared.current = true;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (storageKey) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* nothing to do */
      }
    }
  }, [storageKey]);

  // Restore once, on the opening edge — after the form's own open-reset
  // effects (this hook must be called after them), and only over a pristine
  // form, so it never fights an edit load.
  useEffect(() => {
    if (!active || !storageKey) return;
    cleared.current = false;
    const stored = read(storageKey);
    if (!stored) return;
    const f = formRef.current;
    if (f.formState.isDirty) return;
    f.reset(stored.values as T, { keepDefaultValues: true });
    toast.info('Restored your unsaved work.', {
      description: 'This was kept on this device when the form last closed without saving.',
      action: {
        label: 'Start fresh',
        onClick: () => {
          clear();
          formRef.current.reset();
        },
      },
      duration: 10000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, storageKey]);

  // Write while typing; flush on unmount/close so the last keystrokes are
  // never the ones that are lost.
  useEffect(() => {
    if (!active || !storageKey) return;
    const flush = () => {
      if (cleared.current) return;
      const f = formRef.current;
      if (!f.formState.isDirty) return;
      write(storageKey, f.getValues());
    };
    const subscription = form.watch(() => {
      if (cleared.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, WRITE_DELAY_MS);
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (formRef.current.formState.isDirty && !cleared.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', beforeUnload);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      flush();
    };
  }, [active, storageKey, form]);

  return { clear };
}
