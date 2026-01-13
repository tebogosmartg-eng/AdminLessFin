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

    const { company_id, page = 0, limit = 50 } = await req.json();

    if (!company_id) throw new Error("Company ID is required.");

    // Security Check: Verify user is admin/owner
    const { data: roleData, error: roleError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (roleError || !roleData || !['admin', 'owner'].includes(roleData.role)) {
      throw new Error("Permission denied. Only admins can view audit logs.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const from = page * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from('audit_logs')
      .select(`
        *,
        profiles:changed_by ( full_name, email )
      `, { count: 'exact' })
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return new Response(JSON.stringify({ logs: data, count }), {
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