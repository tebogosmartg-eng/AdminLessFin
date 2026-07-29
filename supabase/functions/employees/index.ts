// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { stripEmployeeNumber, logEmployeeNumberGenerated } from '../_shared/employeeNumberEngine.ts'
import {
  recordEmployeeTimelineEvent,
  recordEmployeeFieldChanges,
  formatEmployeeIdentityContext,
} from '../_shared/employeeTimelineEngine.ts'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

const PUBLIC_EMPLOYEE_FIELDS = 'id, employee_number, first_name, last_name, department, branch, position, employment_status';

async function generateNumber(supabaseAdmin, companyId) {
  const { data, error } = await supabaseAdmin.rpc('generate_employee_number', {
    p_company_id: companyId,
  });
  if (error) throw error;
  return data as string;
}

async function assertUniqueNumber(supabaseAdmin, companyId, employeeNumber, excludeId) {
  let query = supabaseAdmin
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('employee_number', employeeNumber)
    .limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw error;
  if (data?.length) {
    throw new Error(`Employee number "${employeeNumber}" already exists for this company.`);
  }
}

async function logEmployeeCreated(supabaseAdmin, row, companyId, userId, commandId, correlationId) {
  const base = {
    employee_id: row.id,
    employee_number: row.employee_number,
    company_id: companyId,
    changed_by: userId,
    command_id: commandId,
    correlation_id: correlationId,
    event_data: {
      first_name: row.first_name,
      last_name: row.last_name,
      department: row.department,
      branch: row.branch,
      detail: formatEmployeeIdentityContext(row),
    },
  };
  await recordEmployeeTimelineEvent(supabaseAdmin, { ...base, event_type: 'EMPLOYEE_CREATED', event_label: 'Employee Created' });
  await recordEmployeeTimelineEvent(supabaseAdmin, { ...base, event_type: 'EMPLOYEE_NUMBER_ASSIGNED', event_label: 'Employee Number Assigned' });
}

serve(withEnterprisePlatform('employees', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const body = await req.json();
    const { method, company_id, command_id, correlation_id } = body;

    if (!company_id) throw new Error("Company ID is required.");

    
    _ctx.companyId = company_id;const { data: member, error: memberError } = await supabase
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
      case 'GET': {
        const selectQuery = isAdmin ? '*' : PUBLIC_EMPLOYEE_FIELDS;
        ({ data, error } = await supabaseAdmin
          .from('employees')
          .select(selectQuery)
          .eq('company_id', company_id)
          .order('employee_number', { ascending: true }));
        break;
      }

      case 'POST': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can create employees.");

        const employeeData = stripEmployeeNumber(body.employeeData ?? {});
        const employeeNumber = await generateNumber(supabaseAdmin, company_id);

        ({ data, error } = await supabaseAdmin
          .from('employees')
          .insert({ ...employeeData, company_id, employee_number: employeeNumber })
          .select()
          .single());

        if (!error && data) {
          await logEmployeeNumberGenerated(supabaseAdmin, data.id, {
            employee_number: employeeNumber,
            company_id,
            user_id: user.id,
            command_id,
            correlation_id,
            source: 'create',
            employee_name: `${data.first_name} ${data.last_name}`,
            department: data.department,
            branch: data.branch,
          });
          await logEmployeeCreated(supabaseAdmin, data, company_id, user.id, command_id, correlation_id);
        }
        break;
      }

      case 'PUT': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can update employees.");
        const employeeData = stripEmployeeNumber(body.employeeData ?? {});
        delete employeeData.id;

        const { data: before } = await supabaseAdmin
          .from('employees')
          .select('*')
          .eq('id', body.employeeId)
          .eq('company_id', company_id)
          .single();

        ({ data, error } = await supabaseAdmin
          .from('employees')
          .update(employeeData)
          .eq('id', body.employeeId)
          .eq('company_id', company_id)
          .select()
          .single());

        if (!error && data && before) {
          await recordEmployeeFieldChanges(supabaseAdmin, {
            before,
            after: data,
            company_id,
            user_id: user.id,
            command_id,
            correlation_id,
          });
        }
        break;
      }

      case 'IMPORT_EMPLOYEES': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can import employees.");
        const records = body.records;
        if (!Array.isArray(records) || records.length === 0) {
          throw new Error("records array is required for import.");
        }

        const imported = [];
        const failures = [];

        for (let i = 0; i < records.length; i++) {
          const raw = records[i] ?? {};
          try {
            const suppliedNumber = typeof raw.employee_number === 'string' && raw.employee_number.trim()
              ? raw.employee_number.trim()
              : null;
            const employeeData = stripEmployeeNumber(raw);
            delete employeeData.employee_number;

            let employeeNumber = suppliedNumber;
            if (!employeeNumber) {
              employeeNumber = await generateNumber(supabaseAdmin, company_id);
            } else {
              const { data: valid } = await supabaseAdmin.rpc('validate_employee_number_format', {
                p_company_id: company_id,
                p_employee_number: employeeNumber,
              });
              if (!valid) {
                throw new Error(`Employee number "${employeeNumber}" does not match the company numbering policy.`);
              }
              await assertUniqueNumber(supabaseAdmin, company_id, employeeNumber);
              await supabaseAdmin.rpc('sync_employee_sequence_after_import', {
                p_company_id: company_id,
                p_employee_number: employeeNumber,
              });
            }

            const { data: row, error: insertError } = await supabaseAdmin
              .from('employees')
              .insert({ ...employeeData, company_id, employee_number: employeeNumber })
              .select()
              .single();

            if (insertError) throw insertError;

            await logEmployeeNumberGenerated(supabaseAdmin, row.id, {
              employee_number: employeeNumber,
              company_id,
              user_id: user.id,
              command_id,
              correlation_id,
              source: 'import',
              employee_name: `${row.first_name} ${row.last_name}`,
              department: row.department,
              branch: row.branch,
            });
            await logEmployeeCreated(supabaseAdmin, row, company_id, user.id, command_id, correlation_id);

            imported.push(row);
          } catch (err) {
            failures.push({ index: i, error: err.message });
          }
        }

        data = { imported, failures, imported_count: imported.length, failure_count: failures.length };
        break;
      }

      case 'GET_NUMBERING_POLICY': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can view numbering policy.");
        const { count } = await supabaseAdmin
          .from('employees')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company_id);

        const { data: policy, error: policyError } = await supabaseAdmin
          .from('company_employee_number_settings')
          .select('format_template, sequence_padding, next_sequence, starting_number, company_code, branch_code, qr_style, barcode_style, display_format, updated_at')
          .eq('company_id', company_id)
          .maybeSingle();

        if (policyError) throw policyError;

        data = {
          format_template: policy?.format_template ?? 'EMP-{SEQ}',
          sequence_padding: policy?.sequence_padding ?? 6,
          next_sequence: policy?.next_sequence ?? 1,
          starting_number: policy?.starting_number ?? 1,
          company_code: policy?.company_code ?? null,
          branch_code: policy?.branch_code ?? 'MAIN',
          qr_style: policy?.qr_style ?? 'standard',
          barcode_style: policy?.barcode_style ?? 'code128',
          display_format: policy?.display_format ?? 'stacked',
          updated_at: policy?.updated_at ?? null,
          employees_assigned: count ?? 0,
        };
        break;
      }

      case 'GET_TIMELINE': {
        const employeeId = body.employee_id ?? body.employeeId;
        if (!employeeId) throw new Error('employee_id is required.');
        ({ data, error } = await supabaseAdmin
          .from('employee_timeline_events')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('company_id', company_id)
          .order('created_at', { ascending: false })
          .limit(body.limit ?? 100));
        break;
      }

      case 'RESOLVE': {
        const employeeId = body.employee_id ?? body.employeeId;
        const employeeNumber = body.employee_number;
        let query = supabaseAdmin.from('employees').select('*').eq('company_id', company_id);
        if (employeeId) query = query.eq('id', employeeId);
        else if (employeeNumber) query = query.eq('employee_number', employeeNumber);
        else throw new Error('employee_id or employee_number is required.');
        ({ data, error } = await query.single());
        if (data?.manager_id) {
          const { data: manager } = await supabaseAdmin
            .from('employees')
            .select('first_name, last_name, employee_number')
            .eq('id', data.manager_id)
            .maybeSingle();
          if (manager) {
            data.manager_name = `${manager.first_name} ${manager.last_name}`;
            data.manager_number = manager.employee_number;
          }
        }
        const { data: company } = await supabaseAdmin
          .from('companies')
          .select('name')
          .eq('id', company_id)
          .maybeSingle();
        if (company) data.company_name = company.name;
        break;
      }

      case 'SEARCH': {
        const q = (body.query ?? '').trim();
        ({ data, error } = await supabaseAdmin
          .from('employees')
          .select('*')
          .eq('company_id', company_id)
          .order('employee_number', { ascending: true }));
        if (!error && data && q) {
          const lower = q.toLowerCase();
          data = data.filter((e) => {
            const haystack = [
              e.employee_number, e.first_name, e.last_name, e.email, e.phone,
              e.id_number, e.department, e.branch, e.position, e.employment_status,
            ].filter(Boolean).join(' ').toLowerCase();
            if (haystack.includes(lower)) return true;
            if (e.employee_number?.toLowerCase().startsWith(lower)) return true;
            const tokens = lower.split(/\s+/);
            return tokens.length > 1 && tokens.every((t) => haystack.includes(t));
          });
        }
        break;
      }

      case 'UPDATE_NUMBERING_POLICY': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can update numbering policy.");
        const policy = body.policy ?? {};
        const formatTemplate = policy.format_template ?? 'EMP-{SEQ}';
        if (!formatTemplate.includes('{SEQ}')) {
          throw new Error('Pattern must include {SEQ} token.');
        }

        const upsertPayload = {
          company_id,
          format_template: formatTemplate,
          sequence_padding: Math.min(12, Math.max(1, Number(policy.sequence_padding) || 6)),
          company_code: policy.company_code ?? null,
          branch_code: policy.branch_code ?? 'MAIN',
          qr_style: policy.qr_style ?? 'standard',
          barcode_style: policy.barcode_style ?? 'code128',
          display_format: policy.display_format ?? 'stacked',
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabaseAdmin
          .from('company_employee_number_settings')
          .select('next_sequence, starting_number')
          .eq('company_id', company_id)
          .maybeSingle();

        if (!existing) {
          const startNum = Math.max(1, Number(policy.starting_number) || 1);
          upsertPayload.starting_number = startNum;
          upsertPayload.next_sequence = startNum;
        }

        ({ data, error } = await supabaseAdmin
          .from('company_employee_number_settings')
          .upsert(upsertPayload, { onConflict: 'company_id' })
          .select()
          .single());
        break;
      }

      case 'DELETE': {
        if (!isAdmin) throw new Error("Access Denied: Only Admins can delete employees.");
        const employeeId = body.employeeId;
        if (!employeeId) throw new Error('employeeId is required.');

        // Defense-in-depth: block delete when protected business history exists.
        // Payslips FK is RESTRICT; this pre-check returns a clear application error.
        const { count: payslipCount, error: payslipGuardErr } = await supabaseAdmin
          .from('payslips')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employeeId)
          .eq('company_id', company_id);
        if (payslipGuardErr) throw payslipGuardErr;
        if ((payslipCount ?? 0) > 0) {
          throw new Error('Cannot delete employee: linked payroll, expense, or asset records exist. Terminate or archive instead.');
        }

        const { count: expenseCount, error: expenseGuardErr } = await supabaseAdmin
          .from('expense_claims')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employeeId)
          .eq('company_id', company_id);
        if (expenseGuardErr) throw expenseGuardErr;
        if ((expenseCount ?? 0) > 0) {
          throw new Error('Cannot delete employee: linked payroll, expense, or asset records exist. Terminate or archive instead.');
        }

        ({ data, error } = await supabaseAdmin
          .from('employees')
          .delete()
          .eq('id', employeeId)
          .eq('company_id', company_id));
        if (error?.code === '23503') {
          throw new Error('Cannot delete employee: linked payroll, expense, or asset records exist. Terminate or archive instead.');
        }
        if (error?.message?.includes('employee_timeline_events is immutable')) {
          throw new Error('Cannot delete employee: apply migration 20260707150000_employee_timeline_cascade_delete.sql to allow timeline cascade removal.');
        }
        break;
      }

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
