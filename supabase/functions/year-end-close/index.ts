// @ts-nocheck
// Compatibility entrypoint — year-end close delegates to certified financial-year RPCs.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts';

const corsHeaders = ENTERPRISE_CORS_HEADERS;

serve(withEnterprisePlatform('year-end-close', 'tenant', async (req, _ctx) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated.');

    const body = await req.json();
    const { method, company_id: companyId } = body;
    if (!companyId) throw new Error('Company ID is required.');
    _ctx.companyId = companyId;

    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id, role')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .single();

    if (memberError || !companyMember) {
      throw new Error('Permission denied.');
    }
    if (!['owner', 'admin'].includes(companyMember.role)) {
      throw new Error('Permission denied: year-end close requires admin access.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let data;
    let error;

    switch (method) {
      case 'CLOSE':
        ({ error } = await supabaseAdmin.rpc('close_financial_year', { p_end_date: body.end_date }));
        data = { message: 'Financial year closed successfully.' };
        break;

      case 'REOPEN':
        ({ error } = await supabaseAdmin.rpc('reopen_financial_year', {
          p_closed_year_id: body.closed_year_id,
        }));
        data = { message: 'Financial year re-opened successfully.' };
        break;

      case 'HEALTH':
        data = { status: 'ok', slug: 'year-end-close', methods: ['CLOSE', 'REOPEN'] };
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
}));
