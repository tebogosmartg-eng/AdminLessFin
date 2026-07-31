import { describe, it, expect, vi } from 'vitest';
import { installReadCoalescing } from '../../src/integrations/supabase/coalesceReads';

/** Minimal stand-in for the Supabase client surface the coalescer wraps. */
function makeClient(impl: (fn: string, options?: { body?: unknown }) => Promise<unknown>) {
  const invoke = vi.fn(async (fn: string, options?: { body?: unknown }) => ({
    data: await impl(fn, options),
    error: null,
  }));
  const client = { functions: { invoke } };
  installReadCoalescing(client as never);
  return { client: client as unknown as { functions: { invoke: typeof invoke } }, invoke };
}

/** A request that stays pending until released, so overlap is deterministic. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * Reproduces the real SupabaseClient shape: `functions` is a getter that
 * returns a BRAND-NEW client on every access. Wrapping the method on one
 * returned instance is a silent no-op, which is exactly the bug this guards.
 */
function makeGetterClient(impl: () => Promise<unknown>) {
  const invoke = vi.fn(async () => ({ data: await impl(), error: null }));
  class FakeSupabaseClient {
    get functions() {
      return { invoke, setAuth: () => 'auth-ok' };
    }
  }
  const client = new FakeSupabaseClient();
  installReadCoalescing(client as never);
  return { client: client as unknown as { functions: { invoke: typeof invoke; setAuth: () => string } }, invoke };
}

describe('Edge Function read coalescing', () => {
  it('survives a `functions` getter that returns a new client each access', async () => {
    const gate = deferred<void>();
    const { client, invoke } = makeGetterClient(async () => {
      await gate.promise;
      return [{ id: 'acc-1' }];
    });

    const body = { method: 'GET', company_id: 'c1' };
    // Two separate property accesses — each yields a different FunctionsClient.
    const a = client.functions.invoke('chart-of-accounts', { body });
    const b = client.functions.invoke('chart-of-accounts', { body });
    gate.resolve();
    await Promise.all([a, b]);

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('leaves other members of the functions client reachable', () => {
    const { client } = makeGetterClient(async () => null);
    expect(client.functions.setAuth()).toBe('auth-ok');
  });

  it('merges two identical reads that are in flight at the same time', async () => {
    const gate = deferred<void>();
    const { client, invoke } = makeClient(async () => {
      await gate.promise;
      return [{ id: 'acc-1' }];
    });

    const body = { method: 'GET', company_id: 'c1' };
    const a = client.functions.invoke('chart-of-accounts', { body });
    const b = client.functions.invoke('chart-of-accounts', { body });

    gate.resolve();
    const [ra, rb] = await Promise.all([a, b]);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(ra.data).toEqual([{ id: 'acc-1' }]);
    expect(rb.data).toEqual([{ id: 'acc-1' }]);
  });

  it('gives each caller an independent copy, so one cannot corrupt the other', async () => {
    const gate = deferred<void>();
    const { client } = makeClient(async () => {
      await gate.promise;
      return { rows: [{ amount: 100 }] };
    });

    const body = { method: 'GET_ALL', company_id: 'c1' };
    const a = client.functions.invoke('customers', { body });
    const b = client.functions.invoke('customers', { body });
    gate.resolve();

    const [ra, rb] = await Promise.all([a, b]);
    (ra.data as { rows: { amount: number }[] }).rows[0].amount = 999;

    expect((rb.data as { rows: { amount: number }[] }).rows[0].amount).toBe(100);
  });

  it('never merges writes, even when two identical ones overlap', async () => {
    const gate = deferred<void>();
    const { client, invoke } = makeClient(async () => {
      await gate.promise;
      return { ok: true };
    });

    // Two identical postings must both reach the server: merging them would
    // silently drop a journal entry.
    const body = { method: 'CREATE', company_id: 'c1', amount: 250 };
    const a = client.functions.invoke('journal-entries', { body });
    const b = client.functions.invoke('journal-entries', { body });
    gate.resolve();
    await Promise.all([a, b]);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('does not merge an unrecognised verb', async () => {
    const gate = deferred<void>();
    const { client, invoke } = makeClient(async () => {
      await gate.promise;
      return null;
    });

    const body = { method: 'RECALCULATE_DEPRECIATION', company_id: 'c1' };
    const a = client.functions.invoke('fixed-assets', { body });
    const b = client.functions.invoke('fixed-assets', { body });
    gate.resolve();
    await Promise.all([a, b]);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('does not merge reads with different bodies', async () => {
    const gate = deferred<void>();
    const { client, invoke } = makeClient(async () => {
      await gate.promise;
      return [];
    });

    const a = client.functions.invoke('banking', { body: { method: 'GET_TRANSACTIONS', company_id: 'c1' } });
    const b = client.functions.invoke('banking', { body: { method: 'GET_TRANSACTIONS', company_id: 'c2' } });
    gate.resolve();
    await Promise.all([a, b]);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('caches nothing: a read issued after the first settles hits the network again', async () => {
    const { client, invoke } = makeClient(async () => [{ id: 1 }]);
    const body = { method: 'GET', company_id: 'c1' };

    await client.functions.invoke('chart-of-accounts', { body });
    await client.functions.invoke('chart-of-accounts', { body });

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('does not retain a failed request', async () => {
    let calls = 0;
    const invoke = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('network down');
      return { data: 'recovered', error: null };
    });
    const client = { functions: { invoke } };
    installReadCoalescing(client as never);
    const c = client as unknown as { functions: { invoke: typeof invoke } };

    const body = { method: 'GET', company_id: 'c1' };
    await expect(c.functions.invoke('customers', { body })).rejects.toThrow('network down');

    const second = await c.functions.invoke('customers', { body });
    expect(second).toEqual({ data: 'recovered', error: null });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
