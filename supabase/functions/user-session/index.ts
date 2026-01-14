// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

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
    
    // 2. Fetch all companies the user is a member of
    const { data: companyUsers, error: companyUsersError } = await supabaseAdmin
      .from('company_users')
      .select('companies(*)')
      .eq('user_id', user.id);
    
    if (companyUsersError) throw companyUsersError;

    const userCompanies = companyUsers?.map(cu => cu.companies).flat().filter(Boolean) || [];

    // 3. Robust Active Company Selection & Auto-Repair
    let activeCompany = null;
    let finalProfile = userProfile;

    if (userCompanies.length > 0) {
      // Try to find the company specified in profile
      activeCompany = userCompanies.find(c => c.id === userProfile?.active_company_id) || null;
      
      // AUTO-REPAIR: If no active company or it's invalid, pick the first one
      if (!activeCompany) {
        activeCompany = userCompanies[0];
        
        // Update the profile in the database so RPCs work correctly
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
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})