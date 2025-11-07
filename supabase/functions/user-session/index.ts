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
    if (profileError && profileError.code !== 'PGRST116') throw profileError;

    // 2. Fetch all companies the user is a member of
    const { data: companyUsers, error: companyUsersError } = await supabaseAdmin
      .from('company_users')
      .select('companies(*)')
      .eq('user_id', user.id);
    if (companyUsersError) throw companyUsersError;

    const userCompanies = companyUsers?.map(cu => cu.companies).flat().filter(Boolean) || [];

    // 3. Determine the active company
    let activeCompany = null;
    if (userCompanies.length > 0) {
      activeCompany = userCompanies.find(c => c.id === userProfile?.active_company_id) || null;
      if (!activeCompany) {
        activeCompany = userCompanies[0];
        if (userProfile) {
          await supabaseAdmin.from('profiles').update({ active_company_id: activeCompany.id }).eq('id', user.id);
        }
      }
    }

    const responseData = {
      profile: userProfile || null,
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