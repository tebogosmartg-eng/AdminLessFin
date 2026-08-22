import { useEffect, useRef } from 'react';

/**
 * Reset a dialog form only when the dialog opens or the edited entity key
 * changes. Parent re-renders, auth token refresh, and react-hook-form object
 * identity must not wipe in-progress typing.
 *
 * `entityKey` should change when async edit data arrives
 * (e.g. `pending:id` → `edit:id`), and stay stable across refetches of the
 * same entity.
 */
export function useDialogFormReset(
  isOpen: boolean,
  entityKey: string,
  applyReset: () => void,
): void {
  const last = useRef<{ open: boolean; key: string }>({ open: false, key: '' });

  useEffect(() => {
    if (!isOpen) {
      last.current.open = false;
      return;
    }
    const opened = !last.current.open;
    const keyChanged = last.current.key !== entityKey;
    last.current = { open: true, key: entityKey };
    if (opened || keyChanged) applyReset();
    // applyReset closes over the current entity snapshot; it must not be a dep
    // or a new function identity would reset the form on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, entityKey]);
}
