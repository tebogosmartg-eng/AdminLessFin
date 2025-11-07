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
    console.log('[AuthContext] fetchUserAndCompanyData started for user:', user?.id || 'null');
    try {
      if (user) {
        console.log('[AuthContext] Fetching profile...');
        let { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (profileError) {
          console.warn('[AuthContext] Profile fetch error:', profileError);
          if (profileError.code === 'PGRST116') {
            console.log('[AuthContext] Profile not found, likely a new user.');
            userProfile = null;
          } else {
            throw new Error(`Failed to fetch profile: ${profileError.message}`);
          }
        }
        console.log('[AuthContext] Profile data:', userProfile);
        setProfile(userProfile);

        if (!userProfile) {
          console.log('[AuthContext] No profile, setting companies to empty.');
          setCompanies([]);
          setActiveCompany(null);
          return;
        }

        console.log('[AuthContext] Fetching company memberships...');
        const { data: companyUsers, error: companyUsersError } = await supabase
          .from('company_users')
          .select('company_id')
          .eq('user_id', user.id);
        if (companyUsersError) throw new Error(`Failed to fetch company memberships: ${companyUsersError.message}`);
        console.log('[AuthContext] Company memberships:', companyUsers);
        
        const companyIds = companyUsers.map(c => c.company_id);

        if (companyIds.length > 0) {
          console.log('[AuthContext] Fetching companies with IDs:', companyIds);
          const { data: userCompanies, error: companiesError } = await supabase
            .from('companies')
            .select('*')
            .in('id', companyIds);
          if (companiesError) throw new Error(`Failed to fetch companies: ${companiesError.message}`);
          console.log('[AuthContext] Companies data:', userCompanies);
          setCompanies(userCompanies);

          let active = userCompanies?.find(c => c.id === userProfile.active_company_id) || null;
          console.log('[AuthContext] Found active company based on profile:', active?.id);
          if (!active && userCompanies && userCompanies.length > 0) {
            active = userCompanies[0];
            console.log(`[AuthContext] No active company set, defaulting to first one: ${active.id}. Updating profile.`);
            await supabase.from('profiles').update({ active_company_id: active.id }).eq('id', user.id);
          }
          setActiveCompany(active);
          console.log('[AuthContext] Final active company:', active?.id);
        } else {
          console.log('[AuthContext] User has no companies.');
          setCompanies([]);
          setActiveCompany(null);
        }
      } else {
        console.log('[AuthContext] No user, clearing all data.');
        setProfile(null);
        setCompanies(null);
        setActiveCompany(null);
      }
    } catch (error) {
      console.error('[AuthContext] CRITICAL ERROR in fetchUserAndCompanyData:', error);
      // Set states to a stable, logged-out-like state on error
      setProfile(null);
      setCompanies(null);
      setActiveCompany(null);
    }
  };

  useEffect(() => {
    console.log('[AuthContext] useEffect started. Setting loading to true.');
    setLoading(true);

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`[AuthContext] onAuthStateChange event: ${event}`);
        setSession(session);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        
        await fetchUserAndCompanyData(currentUser);

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
          console.log(`[AuthContext] Event is ${event}, setting loading to false.`);
          setLoading(false);
        }
      }
    );

    return () => {
      console.log('[AuthContext] Unsubscribing from auth listener.');
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