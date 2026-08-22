import { describe, it, expect, vi } from 'vitest';
import { installEdgeErrorResolution } from '../../src/integrations/supabase/resolveEdgeErrors';
import { installReadCoalescing } from '../../src/integrations/supabase/coalesceReads';

/**
 * The opaque message supabase-js attaches to EVERY non-2xx edge response.
 * A form that shows `error.message` shows this, whatever actually went wrong.
 */
const OPAQUE = 'Edge Function returned a non-2xx status code';

/** Builds the FunctionsHttpError shape: fixed message, real body on `context`. */
function edgeError(body: unknown, status = 400) {
  const error = new Error(OPAQUE);
  (error as unknown as { context: Response }).context = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return error;
}

/** Enterprise edge platform envelope. */
function envelope(over: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    code: 'VALIDATION_FAILED',
    category: 'ValidationError',
    severity: 'error',
    businessMessage: 'Unable to post invoice: Accounts Receivable account is required.',
    technicalMessage: 'control account trade_receivable is not mapped',
    recoverySuggestion: 'Map the control account in Accounting Setup.',
    correlationId: 'edge:abc-123',
    timestamp: new Date().toISOString(),
    retryable: false,
    error: 'Unable to post invoice: Accounts Receivable account is required.',
    ...over,
  };
}

/** Reproduces the real client: `functions` is a getter returning a NEW client. */
function makeGetterClient(result: () => Promise<{ data: unknown; error: unknown }>) {
  const invoke = vi.fn(result);
  class FakeSupabaseClient {
    get functions() {
      return { invoke, setAuth: () => 'auth-ok' };
    }
  }
  const client = new FakeSupabaseClient();
  return { client, invoke };
}

describe('Edge Function error resolution at the client boundary', () => {
  it('replaces the opaque transport message with the server business message', async () => {
    const { client } = makeGetterClient(async () => ({ data: null, error: edgeError(envelope()) }));
    installEdgeErrorResolution(client as never);

    const { error } = await (client as never as { functions: { invoke: (f: string, o?: unknown) => Promise<{ error: Error }> } })
      .functions.invoke('invoices', { body: { method: 'POST' } });

    expect(error.message).toBe('Unable to post invoice: Accounts Receivable account is required.');
    expect(error.message).not.toContain('non-2xx');
  });

  it('survives a `functions` getter that returns a new client on every access', async () => {
    const { client, invoke } = makeGetterClient(async () => ({ data: null, error: edgeError(envelope()) }));
    installEdgeErrorResolution(client as never);
    const c = client as never as { functions: { invoke: (f: string) => Promise<{ error: Error }> } };

    // Two separate property accesses: a naive method assignment would be lost.
    const first = await c.functions.invoke('bills');
    const second = await c.functions.invoke('bills');

    expect(first.error.message).not.toContain('non-2xx');
    expect(second.error.message).not.toContain('non-2xx');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('preserves error identity, prototype and the unread context Response', async () => {
    const original = edgeError(envelope());
    const { client } = makeGetterClient(async () => ({ data: null, error: original }));
    installEdgeErrorResolution(client as never);

    const { error } = await (client as never as { functions: { invoke: (f: string) => Promise<{ error: Error }> } })
      .functions.invoke('bills');

    expect(error).toBe(original); // same object — nothing is re-thrown or re-wrapped
    expect(error).toBeInstanceOf(Error);
    const ctx = (error as unknown as { context: Response }).context;
    expect(ctx).toBeInstanceOf(Response);
    // The body was read via clone(), so a caller can still read it themselves.
    await expect(ctx.json()).resolves.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('exposes the full envelope for callers that want the category or correlation id', async () => {
    const { client } = makeGetterClient(async () => ({ data: null, error: edgeError(envelope()) }));
    installEdgeErrorResolution(client as never);

    const { error } = await (client as never as { functions: { invoke: (f: string) => Promise<{ error: Error }> } })
      .functions.invoke('bills');

    const env = (error as unknown as { platformEnvelope?: { correlationId: string; category: string } }).platformEnvelope;
    expect(env?.correlationId).toBe('edge:abc-123');
    expect(env?.category).toBe('ValidationError');
  });

  it('falls back to technicalMessage when there is no business message', async () => {
    const { client } = makeGetterClient(async () => ({
      data: null,
      error: edgeError(envelope({ businessMessage: '', error: '' })),
    }));
    installEdgeErrorResolution(client as never);

    const { error } = await (client as never as { functions: { invoke: (f: string) => Promise<{ error: Error }> } })
      .functions.invoke('bills');

    expect(error.message).toBe('control account trade_receivable is not mapped');
  });

  it('uses a plain non-envelope JSON error body rather than the transport string', async () => {
    const { client } = makeGetterClient(async () => ({
      data: null,
      error: edgeError({ error: 'VAT account is not configured.' }),
    }));
    installEdgeErrorResolution(client as never);

    const { error } = await (client as never as { functions: { invoke: (f: string) => Promise<{ error: Error }> } })
      .functions.invoke('bills');

    expect(error.message).toBe('VAT account is not configured.');
  });

  it('leaves an already-specific message untouched', async () => {
    const network = new Error('Failed to send a request to the Edge Function');
    const { client } = makeGetterClient(async () => ({ data: null, error: network }));
    installEdgeErrorResolution(client as never);

    const { error } = await (client as never as { functions: { invoke: (f: string) => Promise<{ error: Error }> } })
      .functions.invoke('bills');

    expect(error.message).toBe('Failed to send a request to the Edge Function');
  });

  it('leaves the message as-is when the body carries nothing usable, and never throws', async () => {
    const { client } = makeGetterClient(async () => ({ data: null, error: edgeError({}) }));
    installEdgeErrorResolution(client as never);

    const { error } = await (client as never as { functions: { invoke: (f: string) => Promise<{ error: Error }> } })
      .functions.invoke('bills');

    expect(error.message).toBe(OPAQUE);
  });

  it('does not disturb successful calls', async () => {
    const { client } = makeGetterClient(async () => ({ data: { ok: true }, error: null }));
    installEdgeErrorResolution(client as never);

    const result = await (client as never as { functions: { invoke: (f: string) => Promise<{ data: unknown; error: unknown }> } })
      .functions.invoke('bills');

    expect(result.data).toEqual({ ok: true });
    expect(result.error).toBeNull();
  });

  it('composes with read coalescing so coalesced reads also report real errors', async () => {
    const { client } = makeGetterClient(async () => ({ data: null, error: edgeError(envelope()) }));
    installReadCoalescing(client as never);
    installEdgeErrorResolution(client as never);

    const { error } = await (client as never as { functions: { invoke: (f: string, o?: unknown) => Promise<{ error: Error }> } })
      .functions.invoke('chart-of-accounts', { body: { method: 'GET' } });

    expect(error.message).not.toContain('non-2xx');
  });
});
