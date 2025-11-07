import { createContext, useContext, useEffect, useState } from 'react';
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

  const fetchUserAndCompanyData = async (user: User | null) => {
    try {
      if (!user) {
        setProfile(null);
        setCompanies(null);
        setActiveCompany(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke('user-session', {
        body: { method: 'GET' },
      });

      if (error) {
        throw new Error(`Failed to fetch user session: ${error.message}`);
      }

      setProfile(data.profile);
      setCompanies(data.companies);
      setActiveCompany(data.activeCompany);

    } catch (error) {
      console.error('[AuthContext] Error fetching user data:', error);
      // Reset to a safe state on error
      setProfile(null);
      setCompanies(null);
      setActiveCompany(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        await fetchUserAndCompanyData(session?.user ?? null);
        setLoading(false); // Set loading to false after every auth state change and data fetch attempt
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
    await fetchUserAndCompanyData(user);
  };

  const switchCompany = async (companyId: string) => {
    if (user) {
      const { error } = await supabase.functions.invoke('settings', {
        body: {
          method: 'SWITCH_COMPANY',
          target_company_id: companyId,
        },
      });
      if (error) throw new Error(`Failed to switch company: ${error.message}`);
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