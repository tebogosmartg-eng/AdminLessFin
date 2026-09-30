import { useEffect, useRef, useState } from 'react';

/**
 * A local draft of a server record that follows the server ONLY while the
 * user has not edited it.
 *
 * The pattern it replaces — an effect copying query data into local state on
 * every arrival — wipes unsaved edits whenever the query refetches: a stale
 * re-observe, a reconnect, another module's save invalidating a shared key.
 * The draft takes the server copy while pristine; after the first local edit
 * it holds; after this record's own save, `saved()` lets the next server
 * copy through again (so the saved values rebase the draft).
 */
export function useServerDraft<T>(server: T | undefined, fallback: T) {
  const [draft, setDraft] = useState<T>(server ?? fallback);
  const dirty = useRef(false);
  useEffect(() => {
    if (server !== undefined && !dirty.current) setDraft(server ?? fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);
  const update: typeof setDraft = (value) => {
    dirty.current = true;
    setDraft(value);
  };
  const saved = () => {
    dirty.current = false;
  };
  return [draft, update, saved] as const;
}
