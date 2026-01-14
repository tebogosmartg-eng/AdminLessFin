import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';

type Profile = {
  full_name: string;
  avatar_url: string;
  role: string; // Global app role
  active_company_id: string | null;
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

  const fetchUserAndCompanyData = async (currentUser: User | null, force = false) => {
    try {
      if (!currentUser) {
        setProfile(null);
        setCompanies(null);
        setActiveCompany(null);
        setRole('member');
        lastFetchUserId.current = null;
        return;
      }

      if (!force && lastFetchUserId.current === currentUser.id) return;

      const { data, error } = await supabase.functions.invoke('user-session', {
        body: { method: 'GET' },
      });

      if (error) throw error;

      setProfile(data.profile);
      setCompanies(data.companies);
      setActiveCompany(data.activeCompany);
      setRole(data.role);
      lastFetchUserId.current = currentUser.id;

    } catch (error) {
      console.error('[AuthContext] Error fetching user data:', error);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) await fetchUserAndCompanyData(initialSession.user);
      setLoading(false);
    };

    initSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await fetchUserAndCompanyData(currentSession?.user ?? null);
        } else if (event === 'SIGNED_OUT') {
          fetchUserAndCompanyData(null);
        }
        setLoading(false);
      }
    );

    return () => authListener.subscription.unsubscribe();
  }, []);

  const signOut = async () => await supabase.auth.signOut();
  const refreshProfile = async () => await fetchUserAndCompanyData(user, true);
  const switchCompany = async (companyId: string) => {
    if (user) {
      const { error } = await supabase.functions.invoke('settings', {
        body: { method: 'SWITCH_COMPANY', company_id: companyId, target_company_id: companyId },
      });
      if (error) throw error;
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