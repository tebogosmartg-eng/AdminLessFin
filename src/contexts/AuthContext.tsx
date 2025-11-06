import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';
import { getYear, set, isAfter, addDays, format } from 'date-fns';

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
    if (user) {
      let { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (profileError) throw new Error(`Failed to fetch profile: ${profileError.message}`);

      setProfile(userProfile);

      const { data: companyUsers, error: companyUsersError } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', user.id);
      if (companyUsersError) throw new Error(`Failed to fetch company memberships: ${companyUsersError.message}`);
      
      const companyIds = companyUsers.map(c => c.company_id);

      if (companyIds.length > 0) {
        const { data: userCompanies, error: companiesError } = await supabase
          .from('companies')
          .select('*')
          .in('id', companyIds);
        if (companiesError) throw new Error(`Failed to fetch companies: ${companiesError.message}`);
        setCompanies(userCompanies);

        let active = userCompanies?.find(c => c.id === userProfile.active_company_id) || null;
        if (!active && userCompanies && userCompanies.length > 0) {
          active = userCompanies[0];
          await supabase.from('profiles').update({ active_company_id: active.id }).eq('id', user.id);
        }
        setActiveCompany(active);
      } else {
        setCompanies([]);
        setActiveCompany(null);
      }
    } else {
      setProfile(null);
      setCompanies(null);
      setActiveCompany(null);
    }
  };

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      await fetchUserAndCompanyData(currentUser);
      setLoading(false);
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        await fetchUserAndCompanyData(currentUser);
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
      const { error } = await supabase.from('profiles').update({ active_company_id: companyId }).eq('id', user.id);
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
    signOut,
    refreshProfile,
    switchCompany,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
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