// @ts-nocheck
// Reserved slug — tenant bulk import uses data-import; enterprise seed uses certified CLI scripts.
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts';

const corsHeaders = ENTERPRISE_CORS_HEADERS;

serve(withEnterprisePlatform('seed-data', 'tenant', async (req, _ctx) => {
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

    if (method === 'HEALTH') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          slug: 'seed-data',
          importPath: 'data-import',
          note: 'Use data-import for tenant imports; certified CLI scripts for enterprise seed.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    throw new Error(
      `Unsupported method: ${method}. Bulk imports are handled by the data-import edge function.`,
    );
  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}));
