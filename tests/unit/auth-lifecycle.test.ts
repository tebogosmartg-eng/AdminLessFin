import { describe, expect, it } from 'vitest';
import {
  isAuthHydrating,
  sameAccessToken,
  sameUserId,
  shouldClearSession,
  shouldFetchCompany,
} from '../../src/lib/auth/authLifecycle';

describe('auth lifecycle', () => {
  it('treats only BOOTING as hydrating so TOKEN_REFRESHED cannot flash the shell', () => {
    expect(isAuthHydrating('BOOTING')).toBe(true);
    expect(isAuthHydrating('APPLICATION_READY')).toBe(false);
    expect(isAuthHydrating('AUTH_REQUIRED')).toBe(false);
    expect(isAuthHydrating('ERROR')).toBe(false);
  });

  it('fetches company only on first session establishment', () => {
    expect(shouldFetchCompany('INITIAL_SESSION', 'user-1')).toBe(true);
    expect(shouldFetchCompany('SIGNED_IN', 'user-1')).toBe(true);
    expect(shouldFetchCompany('TOKEN_REFRESHED', 'user-1')).toBe(false);
    expect(shouldFetchCompany('USER_UPDATED', 'user-1')).toBe(false);
    expect(shouldFetchCompany('INITIAL_SESSION', null)).toBe(false);
  });

  it('clears session on sign-out and on a confirmed empty initial session', () => {
    expect(shouldClearSession('SIGNED_OUT', false)).toBe(true);
    expect(shouldClearSession('INITIAL_SESSION', false)).toBe(true);
    expect(shouldClearSession('INITIAL_SESSION', true)).toBe(false);
    expect(shouldClearSession('TOKEN_REFRESHED', true)).toBe(false);
    expect(shouldClearSession('SIGNED_IN', true)).toBe(false);
  });

  it('treats identical access tokens as unchanged so setState can no-op', () => {
    expect(sameAccessToken({ access_token: 'abc' }, { access_token: 'abc' })).toBe(true);
    expect(sameAccessToken({ access_token: 'abc' }, { access_token: 'xyz' })).toBe(false);
    expect(sameUserId({ id: '1' }, { id: '1' })).toBe(true);
    expect(sameUserId({ id: '1' }, { id: '2' })).toBe(false);
  });
});
