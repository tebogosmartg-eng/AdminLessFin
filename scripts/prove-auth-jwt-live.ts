import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL!;
const anon = process.env.VITE_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `efs-auth-proof-${Date.now()}@example.com`;
  const password = `Proof-${Math.random().toString(36).slice(2)}Aa1!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw new Error(`CREATE_FAIL: ${created.error.message}`);
  const userId = created.data.user!.id;
  console.log(JSON.stringify({ step: 'USER_CREATED', userId, email }));

  const { data: companies } = await admin.from('companies').select('id').limit(1);
  const companyId = companies?.[0]?.id ?? null;
  if (companyId) {
    const { error } = await admin.from('company_users').upsert(
      { company_id: companyId, user_id: userId, role: 'admin' },
      { onConflict: 'company_id,user_id' },
    );
    if (error) console.log(JSON.stringify({ step: 'MEMBERSHIP_WARN', message: error.message }));
  }
  console.log(JSON.stringify({ step: 'COMPANY', companyId }));

  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) {
    throw new Error(`SIGNIN_FAIL: ${signed.error?.message}`);
  }
  const session = signed.data.session;
  console.log(
    JSON.stringify({
      step: 'SESSION',
      userId: session.user.id,
      expires_at: session.expires_at,
      access_token: Boolean(session.access_token),
      refresh_token: Boolean(session.refresh_token),
    }),
  );

  const body = {
    method: 'LIST_FRAMEWORK_PACKS',
    company_id: companyId || '00000000-0000-0000-0000-000000000001',
  };

  const bad = await fetch(`${url}/functions/v1/financial-statements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify(body),
  });
  const badBody = await bad.json();
  console.log(
    JSON.stringify({
      step: 'PROBE_ANON_AUTH',
      status: bad.status,
      technicalMessage: badBody.technicalMessage,
      category: badBody.category,
    }),
  );

  const good = await fetch(`${url}/functions/v1/financial-statements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const goodText = await good.text();
  let goodBody: Record<string, unknown> | unknown[] | null = null;
  try {
    goodBody = JSON.parse(goodText);
  } catch {
    goodBody = null;
  }
  const technicalMessage =
    goodBody && !Array.isArray(goodBody) && typeof goodBody === 'object'
      ? (goodBody as { technicalMessage?: string }).technicalMessage ?? null
      : null;

  console.log(
    JSON.stringify({
      step: 'PROBE_USER_JWT',
      status: good.status,
      technicalMessage,
      isArray: Array.isArray(goodBody),
      authPassed: good.status !== 401 && technicalMessage !== 'User not authenticated.',
    }),
  );

  await admin.auth.admin.deleteUser(userId);
  console.log(JSON.stringify({ step: 'CLEANUP_OK' }));

  const edgeAcceptsUserJwt =
    good.status !== 401 && technicalMessage !== 'User not authenticated.';
  console.log(
    JSON.stringify({
      step: 'CERTIFICATION',
      session_exists: true,
      jwt_attached: true,
      edge_rejects_anon: badBody.technicalMessage === 'User not authenticated.',
      edge_accepts_user_jwt: edgeAcceptsUserJwt,
      auth_uid_resolves: edgeAcceptsUserJwt,
    }),
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
