// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('settings', 'tenant', async (req, _ctx) => {

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

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY edge function secret.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey
    );

    let data, error;

    // Handle profile-level updates that don't strictly require a company_id context
    if (method === 'UPDATE_PROFILE') {
        ({ data, error } = await supabaseAdmin
            .from('profiles')
            .update(body.profileData)
            .eq('id', user.id)
            .select()
            .single());
        
        if (error) throw error;
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (method === 'SWITCH_COMPANY') {
        const { target_company_id } = body;
        if (!target_company_id) throw new Error("Target company ID is required.");

        // Security check: Is user a member of target company?
        const { data: membership } = await supabaseAdmin
            .from('company_users')
            .select('company_id')
            .eq('user_id', user.id)
            .eq('company_id', target_company_id)
            .single();
        
        if (!membership) throw new Error("Permission denied: You are not a member of that company.");

        ({ data, error } = await supabaseAdmin
            .from('profiles')
            .update({ active_company_id: target_company_id })
            .eq('id', user.id)
            .select()
            .single());
        
        if (error) throw error;
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Company-specific methods below
    if (!company_id) {
      throw new Error("Company ID is required.");
    }
    _ctx.companyId = company_id;

    const { data: requester, error: memberError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !requester) {
      throw new Error("Permission denied.");
    }

    switch (method) {
      case 'GET':
        ({ data, error } = await supabaseAdmin.from('companies').select('*').eq('id', company_id).single());
        break;

      case 'UPDATE_COMPANY':
        if (!['admin', 'owner'].includes(requester.role)) throw new Error("Permission denied.");
        ({ data, error } = await supabaseAdmin.from('companies').update(body.companyData).eq('id', company_id).select().single());
        break;

      case 'GET_TEAM_MEMBERS': {
        const { data: members, error: membersError } = await supabaseAdmin
          .from('company_users')
          .select('user_id, role')
          .eq('company_id', company_id);

        if (membersError) throw membersError;

        const userIds = [...new Set((members || []).map((m) => m.user_id))];
        let profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};

        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', userIds);

          if (profilesError) throw profilesError;

          profileMap = Object.fromEntries(
            (profiles || []).map((p) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }])
          );
        }

        data = (members || []).map((member) => ({
          ...member,
          profiles: profileMap[member.user_id] || null,
        }));
        break;
      }

      case 'UPDATE_MEMBER_ROLE':
        if (!['admin', 'owner'].includes(requester.role)) throw new Error("Permission denied.");
        ({ data, error } = await supabaseAdmin.from('company_users').update({ role: body.new_role }).eq('company_id', company_id).eq('user_id', body.target_user_id).select().single());
        break;

      case 'REMOVE_MEMBER':
        if (!['admin', 'owner'].includes(requester.role)) throw new Error("Permission denied.");
        ({ data, error } = await supabaseAdmin.from('company_users').delete().eq('company_id', company_id).eq('user_id', body.user_id_to_remove));
        break;
        
      case 'GET_AUDIT_LOGS': {
        // audit_logs.changed_by has no foreign key to profiles, so PostgREST
        // cannot embed it. Resolve the actor separately, as GET_TEAM_MEMBERS does.
        let logQuery = supabaseAdmin.from('audit_logs').select('*').eq('company_id', company_id).order('created_at', { ascending: false }).limit(100);
        if (body.table_name && body.table_name !== 'all') logQuery = logQuery.eq('table_name', body.table_name);

        const { data: logs, error: logsError } = await logQuery;
        if (logsError) throw logsError;

        const actorIds = [...new Set((logs || []).map((l) => l.changed_by).filter(Boolean))];
        let actorMap = {};

        if (actorIds.length > 0) {
          const { data: actors, error: actorsError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name')
            .in('id', actorIds);

          if (actorsError) throw actorsError;

          actorMap = Object.fromEntries(
            (actors || []).map((p) => [p.id, { full_name: p.full_name }])
          );
        }

        data = (logs || []).map((log) => ({
          ...log,
          profiles: log.changed_by ? actorMap[log.changed_by] || null : null,
        }));
        break;
      }

      case 'GET_CLOSED_YEARS':
        ({ data, error } = await supabaseAdmin.from('closed_financial_years').select('*').eq('company_id', company_id).order('end_date', { ascending: false }));
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
    return edgeFailure(_ctx, error);
  }
}))
