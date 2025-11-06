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
    // Create a Supabase client with the user's auth token to check permissions
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { company_id, email, role } = await req.json();
    if (!company_id || !email || !role) {
      throw new Error("Missing required parameters: company_id, email, role.");
    }

    // Check if the inviting user is an admin or owner of the company
    const { data: userRole, error: roleError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (roleError) throw roleError;
    if (!userRole || !['admin', 'owner'].includes(userRole.role)) {
      throw new Error("Permission denied: You must be an admin or owner to invite users.");
    }

    // If permission check passes, use the admin client to send the invite
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        invited_to_company_id: company_id,
        invited_role: role,
      }
    });

    if (inviteError) throw inviteError;

    return new Response(JSON.stringify(inviteData), {
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