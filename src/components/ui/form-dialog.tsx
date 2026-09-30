import { useEffect, useState, type ReactNode } from 'react';
import { Dialog } from './dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

/**
 * A dialog that never throws away typed work by accident.
 *
 * Every data-entry dialog in the app used the plain Radix dialog, which
 * closes — and discards the form — on a click outside, on Escape, and on the
 * X, with no questions asked. One stray click on the page behind the form
 * was enough to lose an invoice mid-capture.
 *
 * This is a drop-in replacement for `Dialog`. While `dirty` is true, any
 * close request that comes through Radix (outside click, Escape, the X, or a
 * `DialogClose` such as a Cancel button) is answered with "Discard unsaved
 * changes?" instead of being obeyed. While `dirty` is false it behaves
 * exactly like `Dialog`, because there is nothing to lose.
 *
 * Forms pass `dirty={form.formState.isDirty}`. A form that does not pass
 * `dirty` gets the old behaviour unchanged.
 */
export function FormDialog({
  open,
  onOpenChange,
  dirty = false,
  onDiscard,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether closing now would lose the user's typing. */
  dirty?: boolean;
  /** Called when the user confirms the discard — e.g. to drop a kept draft. */
  onDiscard?: () => void;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  // A dialog that was closed (saved, or discarded) starts clean next time.
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (dirty) {
      setConfirming(true);
      return;
    }
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {children}
      </Dialog>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent data-testid="discard-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              What you have entered here has not been saved. You can keep
              working on it, or discard it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="discard-keep">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              data-testid="discard-confirm-action"
              onClick={() => {
                setConfirming(false);
                onDiscard?.();
                onOpenChange(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
