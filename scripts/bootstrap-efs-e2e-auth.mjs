/**
 * Bootstrap E2E auth for Financial Statements certification.
 * Creates (or reuses) a dedicated cert user and attaches to first company.
 * Writes E2E_EMAIL / E2E_PASSWORD into .env (local only — never commit).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
  return envPath;
}

function getServiceRoleKey(projectRef) {
  const raw = execSync(
    `npx supabase projects api-keys --project-ref ${projectRef} -o json`,
    { encoding: 'utf8' },
  );
  const keys = JSON.parse(raw);
  const service = keys.find(
    (k) => k.name === 'service_role' || k.id === 'service_role',
  );
  if (!service?.api_key) throw new Error('service_role key not found');
  return service.api_key;
}

async function main() {
  const envPath = loadEnv();
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

  const ref = new URL(url).hostname.split('.')[0];
  const service = getServiceRoleKey(ref);
  process.env.SUPABASE_SERVICE_ROLE_KEY = service;

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = process.env.E2E_EMAIL || 'efs.certification.v6102@adminless.local';
  const password =
    process.env.E2E_PASSWORD ||
    `Cert-V6102-${Math.random().toString(36).slice(2, 10)}Aa1!`;

  // Try existing credentials first if provided
  if (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) {
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      console.log(JSON.stringify({ ok: true, mode: 'existing_login', email, userId: data.user.id }));
      return;
    }
    console.log(JSON.stringify({ step: 'existing_login_failed', error: error?.message }));
  }

  // Find or create user
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = listed?.users?.find((u) => u.email === email);
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: 'efs_v6102_certification' },
    });
    if (created.error) throw new Error(`CREATE_USER: ${created.error.message}`);
    user = created.data.user;
    console.log(JSON.stringify({ step: 'USER_CREATED', userId: user.id, email }));
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (updated.error) throw new Error(`UPDATE_USER: ${updated.error.message}`);
    console.log(JSON.stringify({ step: 'USER_PASSWORD_RESET', userId: user.id, email }));
  }

  const { data: companies, error: cErr } = await admin
    .from('companies')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(5);
  if (cErr) throw cErr;
  if (!companies?.length) throw new Error('No companies found — cannot attach membership');

  const company = companies[0];
  const { data: existingMem } = await admin
    .from('company_users')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('company_id', company.id)
    .maybeSingle();

  if (!existingMem) {
    const { error: memErr } = await admin.from('company_users').insert({
      user_id: user.id,
      company_id: company.id,
      role: 'owner',
    });
    if (memErr) throw memErr;
    console.log(JSON.stringify({ step: 'MEMBERSHIP_CREATED', companyId: company.id, companyName: company.name }));
  } else {
    console.log(JSON.stringify({ step: 'MEMBERSHIP_EXISTS', companyId: company.id, role: existingMem.role }));
  }

  // Ensure profile has active_company_id if profiles table exists
  await admin
    .from('profiles')
    .upsert(
      {
        id: user.id,
        active_company_id: company.id,
        full_name: 'EFS Certification Board',
      },
      { onConflict: 'id' },
    );

  // Verify login with anon key
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !authData.session) {
    throw new Error(`LOGIN_VERIFY_FAIL: ${authError?.message || 'no session'}`);
  }

  // Persist credentials into .env
  let envContent = readFileSync(envPath, 'utf8');
  const setKey = (content, key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) return content.replace(re, `${key}=${value}`);
    return `${content.trimEnd()}\n${key}=${value}\n`;
  };
  envContent = setKey(envContent, 'E2E_EMAIL', email);
  envContent = setKey(envContent, 'E2E_PASSWORD', password);
  writeFileSync(envPath, envContent);

  console.log(
    JSON.stringify({
      ok: true,
      mode: 'provisioned',
      email,
      userId: user.id,
      companyId: company.id,
      companyName: company.name,
      envUpdated: true,
    }),
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
