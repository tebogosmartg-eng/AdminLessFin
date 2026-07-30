import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';
import {
  authorizationHeaderFromSession,
  ensureSessionForInvoke,
} from '../lib/auth/ensureSessionForInvoke';
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [loading, setLoading] = useState(true);
  const lastFetchUserId = useRef<string | null>(null);
  /** Shared in-flight bootstrap so init + SIGNED_IN do not race-wipe company role. */
  const inFlightBootstrap = useRef<Promise<void> | null>(null);

  const fetchUserAndCompanyData = async (currentUser: User | null, force = false) => {
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
        // Propagate a real user JWT (never anon fallback) for session bootstrap.
        const session = await ensureSessionForInvoke({ redirectOnFailure: false });
        const headers = authorizationHeaderFromSession(session);

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

        setProfile(data.profile);
        setCompanies(data.companies);
        setActiveCompany(data.activeCompany);
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
          const session = await ensureSessionForInvoke({ redirectOnFailure: false });
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-session`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ method: 'GET' }),
            },
          );
          if (res.ok) {
            const payload = await res.json();
            setProfile(payload.profile);
            setCompanies(payload.companies);
            setActiveCompany(payload.activeCompany);
            setRole(payload.role);
            lastFetchUserId.current = currentUser.id;
            return;
          }
        } catch {
          /* fall through to wipe */
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
  };

  useEffect(() => {
    // Single bootstrap path. Do not call getSession()+fetch in parallel with
    // onAuthStateChange — INITIAL_SESSION used to set loading=false before
    // company/role hydration, which redirected AFS/ProtectedRoute away.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        try {
          if (event === 'SIGNED_OUT' || !currentSession?.user) {
            if (event === 'SIGNED_OUT') {
              trackEvent({ eventName: AnalyticsEvents.AUTH_LOGOUT });
              void flushEvents();
            }
            await fetchUserAndCompanyData(null);
          } else if (
            event === 'INITIAL_SESSION' ||
            event === 'SIGNED_IN' ||
            event === 'TOKEN_REFRESHED'
          ) {
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
            await fetchUserAndCompanyData(currentSession.user);
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[AuthContext] Auth state change handling failed:', error);
          }
        } finally {
          setLoading(false);
        }
      },
    );

    return () => authListener.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    trackEvent({ eventName: AnalyticsEvents.AUTH_LOGOUT });
    await flushEvents();
    await supabase.auth.signOut();
  };
  const refreshProfile = async () => await fetchUserAndCompanyData(user, true);
  const switchCompany = async (companyId: string) => {
    if (user) {
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
      await refreshProfile();
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, companies, activeCompany, role, loading, signOut, refreshProfile, switchCompany }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};