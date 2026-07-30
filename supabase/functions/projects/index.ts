// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import { loadCanonicalAggregation } from '../_shared/loadCanonicalAggregation.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('projects', 'tenant', async (req, _ctx) => {

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
    _ctx.companyId = company_id;

    // Security Check
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
        ({ data, error } = await supabaseAdmin
          .from('projects')
          .select('*, customers(name)')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false }));
        break;
      
      case 'GET_DETAILS':
        // Fetch project info
        const { data: project, error: projError } = await supabaseAdmin
          .from('projects')
          .select('*, customers(id, name, email)')
          .eq('id', body.projectId)
          .eq('company_id', company_id)
          .single();
        if (projError) throw projError;

        // Fetch milestones
        const { data: milestones, error: mileError } = await supabaseAdmin
          .from('project_milestones')
          .select('*')
          .eq('project_id', body.projectId)
          .order('due_date', { ascending: true });
        if (mileError) throw mileError;

        // Fetch timesheets statistics
        const { data: timesheets, error: timeError } = await supabaseAdmin
          .from('timesheets')
          .select('*')
          .eq('project_id', body.projectId)
          .order('date', { ascending: false });
        if (timeError) throw timeError;

        const totalHours = timesheets.reduce((sum, t) => sum + Number(t.hours), 0);
        const unbilledHours = timesheets.filter(t => !t.is_billed).reduce((sum, t) => sum + Number(t.hours), 0);
        const billableAmount = totalHours * (project.billable_rate || 0);
        const unbilledAmount = unbilledHours * (project.billable_rate || 0);

        // Company money = CFA only. Project JE P&L aggregation removed.
        const cfa = await loadCanonicalAggregation({
          admin: supabaseAdmin,
          rpc: supabase,
          company_id,
          end_date: new Date().toISOString().slice(0, 10),
        });

        data = {
          project,
          milestones,
          stats: {
            totalHours,
            unbilledHours,
            billableAmount,
            unbilledAmount,
            timesheetCount: timesheets.length
          },
          timesheets,
          financials: {
            // Company CFA figures — project-level allocation is not a CFA output.
            totalRevenue: cfa.totalIncome,
            totalExpenses: cfa.totalExpenses,
            profit: cfa.netIncome,
            project_allocation: null,
            money_source: 'canonical_financial_aggregation_company_only',
          },
          canonicalAggregation: cfa,
          money_source: 'canonical_financial_aggregation',
        };
        break;

      case 'POST':
        ({ data, error } = await supabaseAdmin
          .from('projects')
          .insert({ ...body.projectData, company_id })
          .select()
          .single());
        break;

      case 'PUT':
        ({ data, error } = await supabaseAdmin
          .from('projects')
          .update(body.projectData)
          .eq('id', body.projectId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('projects')
          .delete()
          .eq('id', body.projectId)
          .eq('company_id', company_id));
        break;

      case 'POST_MILESTONE':
        ({ data, error } = await supabaseAdmin
          .from('project_milestones')
          .insert({ ...body.milestoneData, company_id })
          .select()
          .single());
        break;

      case 'PUT_MILESTONE':
        ({ data, error } = await supabaseAdmin
          .from('project_milestones')
          .update(body.milestoneData)
          .eq('id', body.milestoneId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'DELETE_MILESTONE':
        ({ data, error } = await supabaseAdmin
          .from('project_milestones')
          .delete()
          .eq('id', body.milestoneId)
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
    return edgeFailure(_ctx, error);
  }
}))
