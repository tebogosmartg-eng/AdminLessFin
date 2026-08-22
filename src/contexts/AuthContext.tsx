import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';
import {
  authorizationHeaderFromSession,
  ensureSessionForInvoke,
} from '../lib/auth/ensureSessionForInvoke';
import {
  isAuthHydrating,
  sameAccessToken,
  sameUserId,
  shouldClearSession,
  shouldFetchCompany,
  type AuthLifecycle,
} from '../lib/auth/authLifecycle';
import { AnalyticsEvents } from '../lib/analytics/events';
import { trackEvent, flushEvents } from '../lib/analytics/productAnalytics';
import {
  markRegistrationTracked,
  wasRegistrationTracked,
} from '../lib/analytics/session';

type Profile = {
  id: string;
  full_name: string;
  avatar_url: string;
  role: string; // Global app role
  active_company_id: string | null;
  /**
   * COMPATIBILITY-ONLY (legacy Settings write path).
   * These fields are persisted when Settings → Financials saves year-end /
   * active-year config, then materialised into `financial_years`.
   * They MUST NEVER be read as the reporting authority.
   * Authority: Settings → financialCalendarService → ReportingPeriodContext.
   */
  financial_year_end_month?: number | null;
  financial_year_end_day?: number | null;
  current_financial_year_start?: string | null;
};

type Company = {
  id: string;
  name: string;
  owner_id: string;
  address: string | null;
  logo_url: string | null;
  tax_id: string | null;
  default_invoice_notes?: string | null;
  user_role?: 'owner' | 'admin' | 'member'; // Added company-specific role
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  companies: Company[] | null;
  activeCompany: Company | null;
  role: 'owner' | 'admin' | 'member';
  loading: boolean;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function sameCompany(a: Company | null | undefined, b: Company | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.user_role === b.user_role &&
    a.logo_url === b.logo_url &&
    a.default_invoice_notes === b.default_invoice_notes
  );
}

function sameProfile(a: Profile | null | undefined, b: Profile | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.full_name === b.full_name &&
    a.avatar_url === b.avatar_url &&
    a.role === b.role &&
    a.active_company_id === b.active_company_id
  );
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [lifecycle, setLifecycle] = useState<AuthLifecycle>('BOOTING');
  const lastFetchUserId = useRef<string | null>(null);
  /** Shared in-flight bootstrap so init + SIGNED_IN do not race-wipe company role. */
  const inFlightBootstrap = useRef<Promise<void> | null>(null);
  const lifecycleRef = useRef<AuthLifecycle>('BOOTING');
  lifecycleRef.current = lifecycle;

  const applySession = useCallback((next: Session | null) => {
    setSession((prev) => (sameAccessToken(prev, next) ? prev : next));
    setUser((prev) => {
      const nextUser = next?.user ?? null;
      return sameUserId(prev, nextUser) ? prev : nextUser;
    });
  }, []);

  const fetchUserAndCompanyData = useCallback(async (
    currentUser: User | null,
    options?: { force?: boolean; session?: Session | null },
  ) => {
    const force = options?.force === true;

    if (!currentUser) {
      inFlightBootstrap.current = null;
      setProfile(null);
      setCompanies(null);
      setActiveCompany(null);
      setRole('member');
      lastFetchUserId.current = null;
      return;
    }

    if (!force && lastFetchUserId.current === currentUser.id) return;

    if (inFlightBootstrap.current) {
      await inFlightBootstrap.current;
      if (!force && lastFetchUserId.current === currentUser.id) return;
    }

    const bootstrap = (async () => {
      try {
        // Prefer the session from the auth event so we never call getSession()
        // or refreshSession() inside onAuthStateChange (supabase-js deadlock).
        const invokeSession =
          options?.session && !options.force
            ? options.session
            : await ensureSessionForInvoke({ redirectOnFailure: false });
        const headers = authorizationHeaderFromSession(invokeSession);

        let data = null;
        let error = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const result = await supabase.functions.invoke('user-session', {
            body: { method: 'GET' },
            headers,
          });
          data = result.data;
          error = result.error;
          if (!error) break;
          const transient =
            error?.name === 'FunctionsFetchError' ||
            /Failed to send a request/i.test(String(error?.message || error));
          if (!transient || attempt === 1) break;
          await new Promise((r) => setTimeout(r, 250));
        }

        if (error) throw error;

        setProfile((prev) => (sameProfile(prev, data.profile) ? prev : data.profile));
        setCompanies(data.companies);
        setActiveCompany((prev) => (sameCompany(prev, data.activeCompany) ? prev : data.activeCompany));
        setRole(data.role);
        lastFetchUserId.current = currentUser.id;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[AuthContext] Error fetching user data:', error);
        }
        const message = error instanceof Error ? error.message : String(error);
        const authExpired = /session has expired|not authenticated/i.test(message);

        // Do not demote an already-bootstrapped owner/admin session when a racing
        // invoke fails (FunctionsFetchError). That was redirecting AFS via the gate.
        if (!authExpired && lastFetchUserId.current === currentUser.id) {
          return;
        }

        // Last-resort: direct fetch — supabase.functions.invoke can throw
        // FunctionsFetchError even when the edge request completed (abort/race).
        try {
          const recoverSession = await ensureSessionForInvoke({ redirectOnFailure: false });
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-session`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                Authorization: `Bearer ${recoverSession.access_token}`,
              },
              body: JSON.stringify({ method: 'GET' }),
            },
          );
          if (res.ok) {
            const payload = await res.json();
            setProfile((prev) => (sameProfile(prev, payload.profile) ? prev : payload.profile));
            setCompanies(payload.companies);
            setActiveCompany((prev) =>
              sameCompany(prev, payload.activeCompany) ? prev : payload.activeCompany,
            );
            setRole(payload.role);
            lastFetchUserId.current = currentUser.id;
            return;
          }
        } catch {
          /* fall through */
        }

        // Keep an already-hydrated company. Wiping it sends ProtectedRoute to
        // /create-company and back, which unmounts every form.
        if (lastFetchUserId.current === currentUser.id) {
          return;
        }

        setProfile(null);
        setCompanies(null);
        setActiveCompany(null);
        setRole('member');
        lastFetchUserId.current = null;
        if (authExpired) {
          await supabase.auth.signOut();
        }
        throw error;
      } finally {
        inFlightBootstrap.current = null;
      }
    })();

    inFlightBootstrap.current = bootstrap;
    await bootstrap;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const handleAuthEvent = (event: string, currentSession: Session | null) => {
      if (cancelled) return;

      // Token refresh must not re-bootstrap profile/company or flip loading.
      if (event === 'TOKEN_REFRESHED') {
        if (currentSession) applySession(currentSession);
        return;
      }

      if (shouldClearSession(event, Boolean(currentSession?.user))) {
        applySession(null);
        void fetchUserAndCompanyData(null);
        if (!cancelled) setLifecycle('AUTH_REQUIRED');
        return;
      }

      if (!currentSession?.user || !shouldFetchCompany(event, currentSession.user.id)) {
        if (currentSession) applySession(currentSession);
        return;
      }

      applySession(currentSession);

      if (event === 'SIGNED_IN' && currentSession.user) {
        const createdAt = new Date(currentSession.user.created_at).getTime();
        const isRecentRegistration = Date.now() - createdAt < 5 * 60 * 1000;
        if (isRecentRegistration && !wasRegistrationTracked(currentSession.user.id)) {
          markRegistrationTracked(currentSession.user.id);
          trackEvent({
            eventName: AnalyticsEvents.AUTH_REGISTRATION,
            userId: currentSession.user.id,
          });
        }
        trackEvent({
          eventName: AnalyticsEvents.AUTH_LOGIN,
          userId: currentSession.user.id,
          properties: { auth_event: event },
        });
      }

      // Stay in BOOTING until company hydration finishes. Never paint the
      // shell with session && !activeCompany (that redirected to create-company).
      if (lifecycleRef.current !== 'APPLICATION_READY') {
        setLifecycle('BOOTING');
      }

      void (async () => {
        try {
          await fetchUserAndCompanyData(currentSession.user, { session: currentSession });
          if (!cancelled) setLifecycle('APPLICATION_READY');
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[AuthContext] Auth state change handling failed:', error);
          }
          if (cancelled) return;
          // Preserve a working session; only first-boot failure is ERROR.
          setLifecycle((prev) => (prev === 'APPLICATION_READY' ? prev : 'ERROR'));
        }
      })();
    };

    // Do not use an async listener: supabase-js holds an auth lock while the
    // callback runs. getSession/refreshSession/invoke inside it deadlocks and
    // can loop TOKEN_REFRESHED.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, currentSession) => {
      // setTimeout(0) is the supported way to leave the supabase-js auth lock.
      // Calling getSession/invoke inside the listener deadlocks the client and
      // prevents the Auth UI from ever painting email/password fields.
      setTimeout(() => handleAuthEvent(event, currentSession), 0);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [applySession, fetchUserAndCompanyData]);

  const signOut = useCallback(async () => {
    trackEvent({ eventName: AnalyticsEvents.AUTH_LOGOUT });
    await flushEvents();
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await fetchUserAndCompanyData(user, { force: true });
  }, [user, fetchUserAndCompanyData]);

  const switchCompany = useCallback(async (companyId: string) => {
    if (!user) return;
    const { error } = await supabase.functions.invoke('settings', {
      body: { method: 'SWITCH_COMPANY', company_id: companyId, target_company_id: companyId },
    });
    if (error) throw error;
    trackEvent({
      eventName: AnalyticsEvents.COMPANY_SWITCHED,
      companyId,
      userId: user.id,
      properties: { target_company_id: companyId },
    });
    await fetchUserAndCompanyData(user, { force: true });
  }, [user, fetchUserAndCompanyData]);

  const loading = isAuthHydrating(lifecycle);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      profile,
      companies,
      activeCompany,
      role,
      loading,
      signOut,
      refreshProfile,
      switchCompany,
    }),
    [
      session,
      user,
      profile,
      companies,
      activeCompany,
      role,
      loading,
      signOut,
      refreshProfile,
      switchCompany,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
