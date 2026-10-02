import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual Deno module in Node, substituting only its external
// Supabase client and environment. No network or administrator credentials.
function platform(options: { user?: string | null; quota?: boolean; quotaError?: boolean; key?: string } = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: options.quotaError ? null : { allowed: options.quota ?? true, retry_after_seconds: 42 },
    error: options.quotaError ? { message: 'unavailable' } : null,
  });
  const createClient = vi.fn(() => ({
    rpc,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: options.user ? { id: options.user } : null }, error: null }) },
  }));
  const env: Record<string, string> = { SUPABASE_SERVICE_ROLE_KEY: options.key ?? 'test-service-key', EDGE_REQUESTS_PER_MINUTE: '2' };
  const evaluate = (file: string, require: (name: string) => unknown) => {
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(code, {
      module, exports: module.exports, require, Request, Response, Headers, Error, crypto,
      console: { log: vi.fn(), error: vi.fn() }, Deno: { env: { get: (name: string) => env[name] } },
    });
    return module.exports;
  };
  const errorModule = evaluate('supabase/functions/_shared/platformError.ts', () => { throw new Error('Unexpected import'); });
  const exported = evaluate('supabase/functions/_shared/enterpriseEdgePlatform.ts', (name) => {
    if (name.startsWith('https://esm.sh/')) return { createClient };
    if (name === './platformError.ts') return errorModule;
    throw new Error(`Unexpected import ${name}`);
  }) as {
    withEnterprisePlatform: (name: string, mode: string, handler: () => Promise<Response>) => (req: Request) => Promise<Response>;
    bootstrapSystemRequest: (req: Request, ctx: Record<string, unknown>) => unknown;
  };
  return { ...exported, rpc, createClient };
}
const request = (token?: string, method = 'POST') => new Request('https://example.test/function', {
  method, headers: token ? { Authorization: token } : {},
});

describe('edge security boundary', () => {
  it.each(['system', 'service'])('denies missing, invalid and malformed %s credentials before handler or quota access', async (mode) => {
    for (const token of [undefined, 'Bearer user-jwt', 'test-service-key']) {
      const p = platform();
      const handler = vi.fn().mockResolvedValue(new Response('{}'));
      const response = await p.withEnterprisePlatform('job', mode, handler)(request(token));
      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
      expect(p.createClient).not.toHaveBeenCalled();
    }
  });
  it('rejects a missing configured service key', async () => {
    const p = platform({ key: '' });
    const handler = vi.fn();
    expect((await p.withEnterprisePlatform('job', 'system', handler)(request('Bearer test-service-key'))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
  it('allows service requests after distributed quota approval', async () => {
    const p = platform();
    const handler = vi.fn().mockResolvedValue(new Response('{}'));
    expect((await p.withEnterprisePlatform('job', 'system', handler)(request('Bearer test-service-key'))).status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(p.rpc).toHaveBeenCalledWith('consume_edge_request_quota', { p_bucket: 'job:service', p_limit: 2 });
  });
  it('preserves both tenant and scheduler authentication on mixed recurring APIs', async () => {
    for (const [options, token] of [
      [{}, 'Bearer test-service-key'],
      [{ user: 'verified-user' }, 'Bearer user-jwt'],
    ] as const) {
      const p = platform(options);
      const handler = vi.fn().mockResolvedValue(new Response('{}'));
      const response = await p.withEnterprisePlatform('recurring-bills', 'tenant-or-service', handler)(request(token));
      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    }
    const p = platform();
    const handler = vi.fn();
    expect((await p.withEnterprisePlatform('recurring-bills', 'tenant-or-service', handler)(request())).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
  it('denies anonymous tenant calls before handler execution', async () => {
    const p = platform();
    const handler = vi.fn();
    expect((await p.withEnterprisePlatform('invoices', 'tenant', handler)(request('Bearer bogus'))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(p.rpc).not.toHaveBeenCalled();
  });
  it('keys tenant quotas by verified user, never by attacker-controlled company or token', async () => {
    const p = platform({ user: 'verified-user' });
    const handler = vi.fn().mockResolvedValue(new Response('{}'));
    await p.withEnterprisePlatform('invoices', 'tenant', handler)(request('Bearer user-jwt'));
    expect(p.rpc).toHaveBeenCalledWith('consume_edge_request_quota', { p_bucket: 'invoices:verified-user', p_limit: 2 });
  });
  it('returns 429 and Retry-After without executing the handler when quota is exhausted', async () => {
    const p = platform({ user: 'verified-user', quota: false });
    const handler = vi.fn();
    const response = await p.withEnterprisePlatform('invoices', 'tenant', handler)(request('Bearer user-jwt'));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(handler).not.toHaveBeenCalled();
  });
  it('fails closed with 503 when quota storage is unavailable', async () => {
    const p = platform({ quotaError: true });
    const handler = vi.fn();
    const response = await p.withEnterprisePlatform('job', 'system', handler)(request('Bearer test-service-key'));
    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });
  it('preserves public OPTIONS without authentication or database access', async () => {
    const p = platform();
    const handler = vi.fn();
    expect((await p.withEnterprisePlatform('job', 'system', handler)(request(undefined, 'OPTIONS'))).status).toBe(200);
    expect(handler).not.toHaveBeenCalled();
    expect(p.createClient).not.toHaveBeenCalled();
  });
  it('the system bootstrap cannot swallow an invalid service token', () => {
    const p = platform();
    expect(() => p.bootstrapSystemRequest(request('Bearer user-jwt'), {})).toThrow('not authenticated');
    expect(p.createClient).not.toHaveBeenCalled();
  });
});
