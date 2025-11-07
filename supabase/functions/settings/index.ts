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

    const { method, body } = await req.json();
    const { company_id } = body;

    // Security Check: Verify user membership if a company_id is provided for most operations
    if (company_id && method !== 'SWITCH_COMPANY') {
        const { data: companyMember, error: memberError } = await supabase
            .from('company_users')
            .select('user_id')
            .eq('user_id', user.id)
            .eq('company_id', company_id)
            .single();

        if (memberError || !companyMember) {
            throw new Error("Permission denied: User is not a member of this company.");
        }
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data, error;

    switch (method) {
      case 'UPDATE_PROFILE':
        ({ data, error } = await supabaseAdmin
          .from('profiles')
          .update(body.profileData)
          .eq('id', user.id)
          .select()
          .single());
        break;

      case 'UPDATE_COMPANY':
        ({ data, error } = await supabaseAdmin
          .from('companies')
          .update(body.companyData)
          .eq('id', company_id)
          .select()
          .single());
        break;

      case 'GET_TEAM_MEMBERS':
        ({ data, error } = await supabaseAdmin
          .from('company_users')
          .select('user_id, role, profiles(full_name, email)')
          .eq('company_id', company_id));
        break;
      
      case 'GET_CLOSED_YEARS':
        ({ data, error } = await supabaseAdmin
          .from('closed_financial_years')
          .select('*')
          .eq('company_id', company_id)
          .order('end_date', { ascending: false }));
        break;

      case 'SWITCH_COMPANY':
        const { target_company_id } = body;
        // Security check for switching company
        const { data: targetMember, error: targetMemberError } = await supabase
            .from('company_users')
            .select('user_id')
            .eq('user_id', user.id)
            .eq('company_id', target_company_id)
            .single();
        if (targetMemberError || !targetMember) {
            throw new Error("Permission denied: User is not a member of the target company.");
        }
        ({ data, error } = await supabaseAdmin
            .from('profiles')
            .update({ active_company_id: target_company_id })
            .eq('id', user.id));
        break;

      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    if (error) throw error;

    return new Response(JSON.stringify(data), {
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