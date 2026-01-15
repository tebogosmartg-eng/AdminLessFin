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

    if (!company_id) throw new Error("Company ID is required.");

    // SECURITY: Fetch user Role
    const { data: member, error: memberError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !member) throw new Error("Permission denied.");

    const isAdmin = ['owner', 'admin'].includes(member.role);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data, error;

    switch (method) {
      case 'GET':
        // DATA MASKING: If not admin, only return public fields for dropdowns
        const selectQuery = isAdmin 
            ? '*' 
            : 'id, first_name, last_name, department, position'; // Sensitive fields excluded

        ({ data, error } = await supabaseAdmin
          .from('employees')
          .select(selectQuery)
          .eq('company_id', company_id)
          .order('last_name', { ascending: true }));
        break;
      
      case 'POST':
        if (!isAdmin) throw new Error("Access Denied: Only Admins can create employees.");
        ({ data, error } = await supabaseAdmin
          .from('employees')
          .insert({ ...body.employeeData, company_id })
          .select()
          .single());
        break;

      case 'PUT':
        if (!isAdmin) throw new Error("Access Denied: Only Admins can update employees.");
        ({ data, error } = await supabaseAdmin
          .from('employees')
          .update(body.employeeData)
          .eq('id', body.employeeId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'DELETE':
        if (!isAdmin) throw new Error("Access Denied: Only Admins can delete employees.");
        ({ data, error } = await supabaseAdmin
          .from('employees')
          .delete()
          .eq('id', body.employeeId)
          .eq('company_id', company_id));
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