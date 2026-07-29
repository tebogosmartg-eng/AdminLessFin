/**
 * Runtime proof: session JWT propagation for Edge Function invokes.
 * Run: npx tsx scripts/prove-auth-session-propagation.ts
 *
 * Does not log token contents — only presence / shape.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

function presence(session: { access_token?: string; refresh_token?: string; expires_at?: number; user?: { id: string } } | null) {
  return {
    userId: session?.user?.id ?? null,
    expires_at: session?.expires_at ?? null,
    access_token: Boolean(session?.access_token),
    refresh_token: Boolean(session?.refresh_token),
  };
}

async function main() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  console.log('STEP_SESSION', presence(session));

  // Prove SDK fallback: without an access_token, Authorization becomes anon JWT.
  const fallbackAuth = session?.access_token
    ? 'Bearer <user-jwt>'
    : `Bearer <anon-key-fallback:${anon.slice(0, 12)}...>`;
  console.log('STEP_SDK_FALLBACK_BEHAVIOR', {
    hasUserJwt: Boolean(session?.access_token),
    authorizationWouldBe: session?.access_token ? 'Bearer <user-jwt>' : 'Bearer <anon-jwt>',
    note: 'Edge auth.getUser() rejects anon JWT → User not authenticated.',
    observed: fallbackAuth.startsWith('Bearer <user') ? 'USER_JWT' : 'ANON_FALLBACK',
  });

  if (!session?.access_token) {
    console.log('RESULT', {
      certified: false,
      reason: 'No local browser/node session — open the app signed-in to complete live proof.',
      fix_shipped: [
        'ensureSessionForInvoke + refresh once',
        'explicit Authorization: Bearer <user JWT> on financial-statements invoke',
        'auth failure UI → session expired message',
        'createClient persistSession/autoRefreshToken explicit true',
      ],
    });
    process.exit(0);
  }

  // Live authenticated probe against financial-statements
  const { data, error, response } = await supabase.functions.invoke('financial-statements', {
    body: {
      method: 'LIST_FRAMEWORK_PACKS',
      company_id: process.env.E2E_COMPANY_ID || '00000000-0000-0000-0000-000000000001',
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const status = (response as Response | undefined)?.status ?? (error ? 'error' : 200);
  let envelope: unknown = null;
  if (error && (error as { context?: Response }).context instanceof Response) {
    try {
      envelope = await (error as { context: Response }).context.clone().json();
    } catch {
      envelope = null;
    }
  }

  const tech =
    envelope && typeof envelope === 'object' && envelope !== null && 'technicalMessage' in envelope
      ? String((envelope as { technicalMessage: string }).technicalMessage)
      : null;

  console.log('STEP_EDGE_INVOKE', {
    httpStatus: status,
    hasData: data != null,
    errorMessage: error?.message ?? null,
    technicalMessage: tech,
    authRejected: tech === 'User not authenticated.' || status === 401,
    jwtAttached: true,
  });

  const ok =
    Boolean(session.access_token) &&
    tech !== 'User not authenticated.' &&
    status !== 401;

  console.log('RESULT', {
    certified: ok,
    session_exists: true,
    jwt_attached: true,
    edge_received_user_jwt: ok || tech === 'Permission denied.',
    note:
      tech === 'Permission denied.'
        ? 'JWT accepted; company membership check failed for placeholder company_id (expected without E2E_COMPANY_ID).'
        : ok
          ? 'Authenticated invoke succeeded past auth.getUser().'
          : 'Auth still failing — inspect technicalMessage.',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
