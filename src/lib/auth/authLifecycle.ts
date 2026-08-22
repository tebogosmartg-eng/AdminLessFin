/**
 * Auth lifecycle helpers — keep bootstrap deterministic and prevent
 * READY → LOADING → READY oscillation from token refresh / session probes.
 */

export type AuthLifecycle =
  | 'BOOTING'
  | 'APPLICATION_READY'
  | 'AUTH_REQUIRED'
  | 'ERROR';

/** ProtectedRoute treats these as "do not paint the app shell yet". */
export function isAuthHydrating(lifecycle: AuthLifecycle): boolean {
  return lifecycle === 'BOOTING';
}

/**
 * Company/profile fetch is required only when a user session is first
 * established. TOKEN_REFRESHED must never re-bootstrap the application tree.
 */
export function shouldFetchCompany(event: string, userId: string | null | undefined): boolean {
  if (!userId) return false;
  return event === 'INITIAL_SESSION' || event === 'SIGNED_IN';
}

/** True when this event means there is no authenticated user. */
export function shouldClearSession(event: string, hasUser: boolean): boolean {
  return event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !hasUser);
}

export function sameAccessToken(
  prev: { access_token?: string } | null | undefined,
  next: { access_token?: string } | null | undefined,
): boolean {
  return (prev?.access_token ?? null) === (next?.access_token ?? null);
}

export function sameUserId(
  prev: { id?: string } | null | undefined,
  next: { id?: string } | null | undefined,
): boolean {
  return (prev?.id ?? null) === (next?.id ?? null);
}
