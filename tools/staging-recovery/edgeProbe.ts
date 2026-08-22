/**
 * Shared live-probe helper for the staging recovery work.
 *
 * supabase-js collapses every non-2xx edge response into the opaque message
 * "Edge Function returned a non-2xx status code" and hides the real body on
 * `error.context`. Every diagnosis in this exercise depends on that body, so
 * this helper always unwraps it.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

export type Probe = {
  fn: string;
  method: string;
  status: number | null;
  ok: boolean;
  body: unknown;
  error: string | null;
};

export async function invoke(
  s: SupabaseClient,
  fn: string,
  body: Record<string, unknown>,
): Promise<Probe> {
  const r = await s.functions.invoke(fn, { body });
  if (!r.error) {
    return { fn, method: String(body.method ?? ''), status: 200, ok: true, body: r.data, error: null };
  }
  const ctx = (r.error as { context?: unknown }).context;
  let status: number | null = null;
  let payload: unknown = null;
  if (ctx instanceof Response) {
    status = ctx.status;
    const text = await ctx.clone().text().catch(() => '');
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return { fn, method: String(body.method ?? ''), status, ok: false, body: payload, error: r.error.message };
}

export function tech(p: Probe): string {
  return (p.body as { technicalMessage?: string })?.technicalMessage ?? '';
}

/** Signs in as the staging E2E user and resolves the requested company. */
export async function connect(targetCompany = 'Spaceman') {
  const env = loadE2EEnv();
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const auth = await supabase.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (auth.error || !auth.data.session) {
    throw new Error(`Auth failed: ${auth.error?.message || 'no session'}`);
  }
  const sess = await supabase.functions.invoke('user-session', { body: { method: 'GET' } });
  const companies = (sess.data?.companies ?? []) as Array<{ id: string; name: string }>;
  const company =
    companies.find((c) => c.name === targetCompany) ??
    companies.find((c) => c.name.includes(targetCompany)) ??
    companies[0];
  if (!company) throw new Error('No company available for the staging user.');
  return { supabase, company, companies, env };
}
