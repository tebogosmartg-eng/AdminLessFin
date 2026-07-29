import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../integrations/supabase/client';

export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired.\nPlease sign in again.';

const REFRESH_SKEW_SECONDS = 60;

function isExpiredOrMissing(session: Session | null | undefined): boolean {
  if (!session?.access_token) return true;
  if (session.expires_at == null) return false;
  const now = Math.floor(Date.now() / 1000);
  return session.expires_at <= now + REFRESH_SKEW_SECONDS;
}

function logSessionPresence(phase: string, session: Session | null | undefined): void {
  console.info('[auth] session probe', {
    phase,
    userId: session?.user?.id ?? null,
    expires_at: session?.expires_at ?? null,
    access_token: Boolean(session?.access_token),
    refresh_token: Boolean(session?.refresh_token),
    expired_or_missing: isExpiredOrMissing(session),
  });
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname + window.location.search;
  if (path.startsWith('/auth')) return;
  window.location.assign(`/auth?redirect=${encodeURIComponent(path)}`);
}

/**
 * Ensures a user JWT is available before Edge Function invoke.
 *
 * supabase-js falls back to Authorization: Bearer <anon key> when no session
 * access_token exists. Edge handlers that call auth.getUser() then return
 * "User not authenticated." This helper refreshes once and redirects to login
 * if recovery fails.
 */
export async function ensureSessionForInvoke(options?: {
  redirectOnFailure?: boolean;
}): Promise<Session> {
  const redirectOnFailure = options?.redirectOnFailure !== false;

  const { data: initial, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('[auth] getSession failed', { message: sessionError.message });
  }

  let session = initial.session;
  logSessionPresence('getSession', session);

  if (!isExpiredOrMissing(session)) {
    return session!;
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  session = refreshed.session;
  logSessionPresence('refreshSession', session);

  if (refreshError || isExpiredOrMissing(session)) {
    console.error('[auth] session recovery failed', {
      refreshError: refreshError?.message ?? null,
      access_token: Boolean(session?.access_token),
    });
    if (redirectOnFailure) redirectToLogin();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  return session!;
}

/** Authorization header for functions.invoke — always a user JWT, never anon. */
export function authorizationHeaderFromSession(session: Session): Record<string, string> {
  return { Authorization: `Bearer ${session.access_token}` };
}
