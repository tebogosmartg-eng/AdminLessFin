import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';

type Profile = {
  full_name: string;
  avatar_url: string;
  role: string;
  financial_year_end_month: number | null;
  financial_year_end_day: number | null;
  current_financial_year_start: string | null;
  active_company_id: string | null;
};

type Company = {
  id: string;
  name: string;
  owner_id: string;
  address: string | null;
  logo_url: string | null;
  tax_id: string | null;
  default_invoice_notes: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  companies: Company[] | null;
  activeCompany: Company | null;
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
  const [loading, setLoading] = useState(true);
  const lastFetchUserId = useRef<string | null>(null);

  const fetchUserAndCompanyData = async (currentUser: User | null, force = false) => {
    try {
      if (!currentUser) {
        setProfile(null);
        setCompanies(null);
        setActiveCompany(null);
        lastFetchUserId.current = null;
        return;
      }

      // Avoid redundant fetches for the same user unless forced
      if (!force && lastFetchUserId.current === currentUser.id) {
        return;
      }

      const { data, error } = await supabase.functions.invoke('user-session', {
        body: { method: 'GET' },
      });

      if (error) throw error;

      setProfile(data.profile);
      setCompanies(data.companies);
      setActiveCompany(data.activeCompany);
      lastFetchUserId.current = currentUser.id;

    } catch (error) {
      console.error('[AuthContext] Error fetching user data:', error);
      setProfile(null);
      setCompanies(null);
      setActiveCompany(null);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        await fetchUserAndCompanyData(initialSession.user);
      }
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

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    await fetchUserAndCompanyData(user, true);
  };

  const switchCompany = async (companyId: string) => {
    if (user) {
      const { error } = await supabase.functions.invoke('settings', {
        body: {
          method: 'SWITCH_COMPANY',
          company_id: companyId, // Fixed key name mismatch in settings function call
          target_company_id: companyId,
        },
      });
      if (error) throw error;
      await refreshProfile();
    }
  };

  const value = {
    session,
    user,
    profile,
    companies,
    activeCompany,
    loading,
    signOut,
    refreshProfile,
    switchCompany,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};