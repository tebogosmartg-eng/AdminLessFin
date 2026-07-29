// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('audit-logs', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { company_id, limit = 50, table_name } = await req.json();

    if (!company_id) {
      throw new Error("Company ID is required.");
    }

    // Security Check: Only Admins/Owners can view audit logs
    const { data: userRole, error: roleError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (roleError) throw roleError;
    if (!['owner', 'admin'].includes(userRole.role)) {
      throw new Error("Permission denied: Only Admins can view audit logs.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // audit_logs.changed_by has no foreign key to profiles, so PostgREST cannot
    // embed it. The actor is resolved with a second lookup instead.
    let query = supabaseAdmin
      .from('audit_logs')
      .select('*')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (table_name && table_name !== 'all') {
      query = query.eq('table_name', table_name);
    }

    const { data: logs, error } = await query;

    if (error) throw error;

    const actorIds = [...new Set((logs || []).map((l) => l.changed_by).filter(Boolean))];
    let actorMap = {};

    if (actorIds.length > 0) {
      const { data: actors, error: actorsError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', actorIds);

      if (actorsError) throw actorsError;

      actorMap = Object.fromEntries(
        (actors || []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
      );
    }

    const data = (logs || []).map((log) => ({
      ...log,
      profiles: log.changed_by ? actorMap[log.changed_by] || null : null,
    }));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
