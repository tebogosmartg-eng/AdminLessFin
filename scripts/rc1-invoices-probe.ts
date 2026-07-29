/**
 * RC1 — Live verification probe for deployed invoices edge function.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch { /* optional */ }
  }
}
loadEnv();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function invokeInvoices(body: Record<string, unknown>) {
  const res = await supabase.functions.invoke('invoices', { body });
  return {
    ok: !res.error,
    status: res.error ? 'error' : 'ok',
    error: res.error?.message ?? null,
    data: res.data,
  };
}

async function main() {
  const results: Record<string, unknown> = { timestamp: new Date().toISOString() };

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (authErr) {
    console.log(JSON.stringify({ ...results, auth: 'FAIL', error: authErr.message }, null, 2));
    process.exit(1);
  }
  results.auth = { email: auth.user?.email, userId: auth.user?.id };

  const { data: session, error: sessErr } = await supabase.functions.invoke('user-session', {
    body: { method: 'GET_SESSION' },
  });
  if (sessErr) {
    console.log(JSON.stringify({ ...results, session: 'FAIL', error: sessErr.message }, null, 2));
    process.exit(1);
  }
  const companyId = session?.activeCompany?.id as string;
  results.companyId = companyId;

  results.GET_ALL = await invokeInvoices({ method: 'GET_ALL', company_id: companyId });
  results.GET_NEXT_INVOICE_NUMBER = await invokeInvoices({
    method: 'GET_NEXT_INVOICE_NUMBER',
    company_id: companyId,
  });

  const failed = Object.entries(results).filter(
    ([k, v]) =>
      typeof v === 'object' &&
      v !== null &&
      'ok' in (v as object) &&
      !(v as { ok: boolean }).ok,
  );
  results.summary = {
    passed: failed.length === 0,
    failedEndpoints: failed.map(([k]) => k),
  };

  console.log(JSON.stringify(results, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
