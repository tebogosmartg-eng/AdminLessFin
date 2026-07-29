// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('user-session', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch user profile
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    // 2. Fetch all companies and user roles
    const { data: companyUsers, error: companyUsersError } = await supabaseAdmin
      .from('company_users')
      .select('role, companies(*)')
      .eq('user_id', user.id);
    
    if (companyUsersError) throw companyUsersError;

    const userCompanies = companyUsers?.map(cu => ({
        ...cu.companies,
        user_role: cu.role
    })).filter(Boolean) || [];

    // 3. Robust Active Company Selection & Auto-Repair
    let activeCompany = null;
    let finalProfile = userProfile;

    if (userCompanies.length > 0) {
      activeCompany = userCompanies.find(c => c.id === userProfile?.active_company_id) || null;
      
      if (!activeCompany) {
        activeCompany = userCompanies[0];
        const { data: updatedProfile } = await supabaseAdmin
            .from('profiles')
            .update({ active_company_id: activeCompany.id })
            .eq('id', user.id)
            .select()
            .single();
        if (updatedProfile) finalProfile = updatedProfile;
      }
    }

    const responseData = {
      profile: finalProfile || null,
      companies: userCompanies,
      activeCompany: activeCompany,
      role: activeCompany?.user_role || 'member', // Return specific role
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
