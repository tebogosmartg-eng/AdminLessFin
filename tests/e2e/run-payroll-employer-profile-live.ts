/**
 * Live check of Payroll Phase 2a (employer details for SARS) against the deployed
 * payroll function and database. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-employer-profile-live.ts
 *
 * Leaves CERT TX with a valid employer profile (later Phase 2 steps need one); if a
 * profile already existed it is restored.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMPANY_NAME = 'CERT TX 1785230675937';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

function loadEnv() {
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* vars may already be set */ }
}

async function invoke<T>(sb: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke('payroll', { body });
  if (error) {
    let payload = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) { try { payload = JSON.stringify(await ctx.clone().json()); } catch { /* keep */ } }
    throw new Error(`${String(body.method)}: ${payload}`);
  }
  return data as T;
}

type Profile = Record<string, unknown> & { updated_at?: string };
type ProfileResponse = { profile: Profile | null; errors: Array<{ field: string; message: string }>; suggested: Record<string, string> };

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const payroll = <T>(body: Record<string, unknown>) => invoke<T>(sb, { company_id: companyId, ...body });

  const before = await payroll<ProfileResponse>({ method: 'GET_EMPLOYER_PROFILE' });
  check('Profile endpoint answers with suggestions for a first-time profile', !!before.suggested && typeof before.suggested.trading_name === 'string', before.suggested);

  // A draft run shows the employer warning while there is no valid profile.
  const run = await payroll<{ id: string }>({
    method: 'CREATE_RUN', additional_run: true,
    runData: { pay_period_start: '2027-06-01', pay_period_end: '2027-06-30', pay_date: '2027-06-30' },
  });
  try {
    if (!before.profile) {
      const detail = await payroll<{ warnings: Array<{ code: string }> }>({ method: 'GET_RUN_DETAIL', runId: run.id });
      check('Without employer details the run warns', detail.warnings.some((w) => w.code === 'EMPLOYER_PROFILE_INCOMPLETE'));
    }

    const valid = {
      trading_name: 'CERT TX Demo Employer', paye_reference: '7230767891', sdl_reference: 'L230767891', uif_reference: 'U230767891',
      contact_first_name: 'Cert', contact_surname: 'Tester', contact_position: 'Payroll Administrator',
      contact_business_phone: '0211234567', contact_email: 'payroll@adminless-fin.test', diplomatic_indemnity: false,
      sic7_code: '69201', address_street_number: '1', address_street_name: 'Test Street', address_suburb: 'Gardens',
      address_city: 'Cape Town', address_postal_code: '8001', address_country: 'ZA',
    };

    // Each SARS rule is enforced by the server, not only the screen.
    const refused = async (name: string, patch: Record<string, unknown>, field: string) => {
      try {
        await payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile: { ...valid, ...patch } });
        check(name, false, 'accepted');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        check(name, /EMPLOYER_PROFILE_INVALID/.test(message) && message.includes(`"field":"${field}"`), message.slice(0, 200));
      }
    };
    await refused('PAYE reference with a wrong check digit is refused', { paye_reference: '7230767892' }, 'paye_reference');
    await refused('SDL reference not matching the PAYE reference is refused', { sdl_reference: 'L667056640' }, 'sdl_reference');
    await refused('UIF number without the U prefix is refused', { uif_reference: '230767891' }, 'uif_reference');
    await refused('A SIC7 code not on the SARS list is refused', { sic7_code: '12345' }, 'sic7_code');
    await refused('Postal code 0000 is refused', { address_postal_code: '0000' }, 'address_postal_code');
    await refused('No business or cell number is refused', { contact_business_phone: '' }, 'contact_business_phone');
    await refused('A comma in the trading name is refused (SARS file rule)', { trading_name: 'Smith, Jones' }, 'trading_name');
    await refused('An e-mail SARS would reject is refused', { contact_email: 'pay..roll@x.co.za' }, 'contact_email');

    const saved = await payroll<ProfileResponse>({ method: 'UPDATE_EMPLOYER_PROFILE', profile: { ...valid, paye_reference: ' 7230 767 891 ', sdl_reference: 'l230767891' } });
    check('A valid profile is saved, normalised', saved.profile?.paye_reference === '7230767891' && saved.profile?.sdl_reference === 'L230767891', saved.profile);
    const reread = await payroll<ProfileResponse>({ method: 'GET_EMPLOYER_PROFILE' });
    check('Saved profile reads back with no SARS errors', reread.errors.length === 0 && reread.profile?.sic7_code === '69201', reread.errors);

    const after = await payroll<{ warnings: Array<{ code: string }> }>({ method: 'GET_RUN_DETAIL', runId: run.id });
    check('With valid employer details the run no longer warns about them', !after.warnings.some((w) => w.code === 'EMPLOYER_PROFILE_INCOMPLETE'));

    const direct = await sb.from('company_payroll_employer_profile').update({ paye_reference: '7000000000' }).eq('company_id', companyId).select('company_id');
    check('The profile cannot be changed directly through the API', !!direct.error || (direct.data ?? []).length === 0, direct.error?.message);
    const read = await sb.from('company_payroll_employer_profile').select('paye_reference').eq('company_id', companyId).single();
    check('Owners and admins can read it directly', read.data?.paye_reference === '7230767891', read.error?.message);
  } finally {
    await payroll({ method: 'DISCARD_RUN', runId: run.id }).catch((e) => console.log('discard failed', e.message));
    if (before.profile) {
      const { updated_at: _u, updated_by: _b, company_id: _c, ...original } = before.profile;
      await payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile: original });
      console.log('Original employer profile restored');
    } else {
      console.log('CERT TX keeps the test employer profile (needed by later Phase 2 checks)');
    }
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
