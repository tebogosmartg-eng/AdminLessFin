// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('company-management', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const body = await req.json();
    const { method } = body;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data, error;

    switch (method) {
      case 'CREATE':
        const { companyData } = body;
        if (!companyData || !companyData.name) {
          throw new Error("Company name is required.");
        }

        // 1. Create the company
        const { data: newCompany, error: companyError } = await supabaseAdmin
          .from('companies')
          .insert({ name: companyData.name, owner_id: user.id })
          .select('id')
          .single();
        if (companyError) throw companyError;

        // 2. Link the user to the company as owner
        const { error: linkError } = await supabaseAdmin
          .from('company_users')
          .insert({ company_id: newCompany.id, user_id: user.id, role: 'owner' });
        if (linkError) throw linkError;

        // 3. Phase 1A — new companies enter Accounting Readiness at NOT_STARTED
        const { error: readinessError } = await supabaseAdmin
          .from('accounting_readiness')
          .insert({
            company_id: newCompany.id,
            status: 'NOT_STARTED',
            accounting_ready: false,
            current_step: 'financial_calendar',
          });
        if (readinessError) throw readinessError;
        
        data = newCompany;
        break;

      case 'DELETE':
        const { company_id: companyIdToDelete } = body;
        if (!companyIdToDelete) throw new Error("Company ID is required for deletion.");

        // Security Check: Verify user is the owner
        const { data: company, error: ownerCheckError } = await supabaseAdmin
          .from('companies')
          .select('owner_id')
          .eq('id', companyIdToDelete)
          .single();
        
        if (ownerCheckError) throw ownerCheckError;
        if (!company || company.owner_id !== user.id) {
          throw new Error("Permission denied: Only the company owner can delete it.");
        }

        // Delete the company (cascading deletes will handle related data)
        const { error: deleteError } = await supabaseAdmin
          .from('companies')
          .delete()
          .eq('id', companyIdToDelete);
        if (deleteError) throw deleteError;

        // Find another company to set as active
        const { data: otherCompanies, error: findError } = await supabaseAdmin
          .from('company_users')
          .select('company_id')
          .eq('user_id', user.id)
          .neq('company_id', companyIdToDelete)
          .limit(1);
        if (findError) throw findError;

        const newActiveCompanyId = otherCompanies && otherCompanies.length > 0 ? otherCompanies[0].company_id : null;

        // Update user's active company
        await supabaseAdmin
          .from('profiles')
          .update({ active_company_id: newActiveCompanyId })
          .eq('id', user.id);
        
        data = { message: "Company deleted successfully." };
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
