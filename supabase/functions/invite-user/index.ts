// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('invite-user', 'tenant', async (req, _ctx) => {

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
    if (!['member', 'admin', 'owner'].includes(role)) {
      throw new Error("Role must be member, admin or owner.");
    }
    // Nobody grants more than they hold: only an owner may invite an owner.
    if (role === 'owner' && userRole.role !== 'owner') {
      throw new Error("Permission denied: only an owner can invite another owner.");
    }

    // If permission check passes, use the admin client to send the invite
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // The invitation is recorded here, by the server. handle_new_user joins the
    // new user to the company only when this row exists for their email, and
    // takes the role from it. The metadata below is a claim anyone can make on
    // a public sign-up, so on its own it grants nothing.
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('company_invitations')
      .insert({ company_id, email: String(email).trim(), role, invited_by: user.id })
      .select('id')
      .single();
    if (invitationError) throw invitationError;

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(String(email).trim(), {
      data: {
        invited_to_company_id: company_id,
        invited_role: role,
      }
    });

    if (inviteError) {
      // Nothing was sent, so nothing may be claimed.
      await supabaseAdmin.from('company_invitations').delete().eq('id', invitation.id);
      throw inviteError;
    }

    return new Response(JSON.stringify(inviteData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
