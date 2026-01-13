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

    const body = await req.json();
    const { method, company_id } = body;

    if (!company_id) {
      throw new Error("Company ID is required.");
    }

    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) {
      throw new Error("Permission denied.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data, error;

    switch (method) {
      case 'GET':
        // Get company settings
        ({ data, error } = await supabaseAdmin
          .from('companies')
          .select('*')
          .eq('id', company_id)
          .single());
        break;

      case 'UPDATE':
        ({ data, error } = await supabaseAdmin
          .from('companies')
          .update(body.settings)
          .eq('id', company_id)
          .select()
          .single());
        break;

      case 'GET_USERS':
        // Get users for this company (via company_users)
        ({ data, error } = await supabaseAdmin
           .from('company_users')
           .select('user_id, role') 
           .eq('company_id', company_id));
        break;
        
      case 'GET_AUDIT_LOGS':
        let query = supabaseAdmin
          .from('audit_logs')
          .select(`
            *,
            profiles:changed_by ( full_name )
          `)
          .eq('company_id', company_id)
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (body.table_name && body.table_name !== 'all') {
            query = query.eq('table_name', body.table_name);
        }
        
        ({ data, error } = await query);
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