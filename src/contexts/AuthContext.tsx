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

      // 1. Fetch user profile
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error(`Failed to fetch profile: ${profileError.message}`);
      }
      setProfile(userProfile || null);

      // 2. Fetch all companies the user is a member of
      const { data: companyUsers, error: companyUsersError } = await supabase
        .from('company_users')
        .select('companies(*)')
        .eq('user_id', user.id);
      
      if (companyUsersError) {
        throw new Error(`Failed to fetch companies: ${companyUsersError.message}`);
      }

      const userCompanies = companyUsers?.map(cu => cu.companies).flat().filter(Boolean) as Company[] || [];
      setCompanies(userCompanies);

      // 3. Determine the active company
      let newActiveCompany: Company | null = null;
      if (userCompanies.length > 0) {
        // Try to find the active company from the profile in the user's list of valid companies
        newActiveCompany = userCompanies.find(c => c.id === userProfile?.active_company_id) || null;

        // If not found (or if profile had no active company), default to the first one
        if (!newActiveCompany) {
          newActiveCompany = userCompanies[0];
          // And update the profile to correct it for next time
          if (userProfile) {
            await supabase.from('profiles').update({ active_company_id: newActiveCompany.id }).eq('id', user.id);
          }
        }
      }
      setActiveCompany(newActiveCompany);

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