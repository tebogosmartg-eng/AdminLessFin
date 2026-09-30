/**
 * Compliance & Governance — live security probe (run after deploying).
 *
 *   npx tsx tools/compliance/probe-compliance-live.ts
 *
 * Signs in as the E2E user from .env (E2E_EMAIL / E2E_PASSWORD) with the
 * public anon key, and checks the properties ADR-0004 promises on the real
 * stack. It only READS, apart from one attempted direct insert that must be
 * refused. Exit code 1 if any check fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { ...out, ...(process.env as Record<string, string>) };
}

type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const e = env();
  const url = e.VITE_SUPABASE_URL;
  const anon = e.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !e.E2E_EMAIL || !e.E2E_PASSWORD) throw new Error('Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, E2E_PASSWORD.');
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await sb.auth.signInWithPassword({ email: e.E2E_EMAIL, password: e.E2E_PASSWORD });
  if (authError || !auth.session) throw new Error(`Sign-in failed: ${authError?.message}`);
  const token = auth.session.access_token;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const call = async (body: Record<string, unknown>, bearer: string | null = token) => {
    const res = await fetch(`${url}/functions/v1/compliance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
    });
    let json: { obligations?: unknown; events?: unknown } | null = null;
    try {
      json = await res.json();
    } catch {
      /* not JSON */
    }
    return { status: res.status, json };
  };

  const memberships = await sb.from('company_users').select('company_id, role').eq('user_id', auth.user!.id);
  const rows = (memberships.data ?? []) as Array<{ company_id: string; role: string }>;
  const owned = rows.find((r) => r.role === 'owner' || r.role === 'admin');
  const memberOf = rows.find((r) => r.role === 'member');

  if (owned) {
    const r = await call({ method: 'GET_OVERVIEW', company_id: owned.company_id });
    check('owner/admin can read the overview', r.status === 200 && Array.isArray(r.json?.obligations), `HTTP ${r.status}`);
    check('overview never contains rule conditions', !JSON.stringify(r.json ?? {}).includes('"condition"'), 'no "condition" key');
    const cal = await call({ method: 'GET_CALENDAR', company_id: owned.company_id, start_date: '2026-01-01', end_date: '2027-12-31' });
    check('owner/admin can read compliance calendar events', cal.status === 200 && Array.isArray(cal.json?.events), `HTTP ${cal.status}`);
    const bad = await call({ method: 'NOT_A_METHOD', company_id: owned.company_id });
    check('an unknown method is a 400, not a 500', bad.status === 400, `HTTP ${bad.status}`);

    const insert = await sb.from('compliance_obligations').insert({
      id: randomUUID(),
      company_id: owned.company_id,
      rule_code: 'PROBE',
      rule_version_id: randomUUID(),
      applicability: 'applicable',
      evaluated_applicability: 'applicable',
    });
    check('a direct REST insert into a compliance table is refused', !!insert.error, insert.error?.message ?? 'INSERTED — FAIL');
    const rpc = await sb.rpc('compliance_apply_plan', { p_company_id: owned.company_id, p_expected_state: 0, p_plan: {} });
    check('the plan RPC cannot be called by a user', !!rpc.error, rpc.error?.message ?? 'CALLED — FAIL');
  } else {
    check('E2E user owns or administers a company', false, 'no owner/admin membership found');
  }

  const rules = await sb.from('compliance_rule_versions').select('id, condition').limit(5);
  check('rule conditions are not readable through REST', !rules.error ? (rules.data ?? []).length === 0 : true, rules.error?.message ?? `${rules.data?.length ?? 0} rows`);

  const foreign = await call({ method: 'GET_OVERVIEW', company_id: randomUUID() });
  check('a company the user does not belong to is refused (403)', foreign.status === 403, `HTTP ${foreign.status}`);

  if (memberOf) {
    const m = await call({ method: 'GET_OVERVIEW', company_id: memberOf.company_id });
    check('a member (not owner/admin) is refused (403)', m.status === 403, `HTTP ${m.status}`);
  } else {
    check('a member is refused (403)', true, 'SKIPPED: the E2E user is not a plain member anywhere; covered by unit/integration tests');
  }

  const anonCall = await call({ method: 'GET_OVERVIEW', company_id: owned?.company_id ?? randomUUID() }, null);
  check('no session is refused (401)', anonCall.status === 401, `HTTP ${anonCall.status}`);

  const list = await sb.storage.from('compliance-evidence').list(owned?.company_id ?? '', { limit: 5 });
  check('the evidence bucket cannot be listed by a user', !!list.error || (list.data ?? []).length === 0, list.error?.message ?? `${list.data?.length ?? 0} objects`);
  const publicUrl = sb.storage.from('compliance-evidence').getPublicUrl(`${owned?.company_id}/x/y`).data.publicUrl;
  const pub = await fetch(publicUrl);
  check('the evidence bucket is not public', pub.status >= 400, `HTTP ${pub.status}`);

  await sb.auth.signOut();
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
