// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
} from '../_shared/enterpriseEdgePlatform.ts'
import { resolveEnterpriseIdentityEdge } from '../_shared/enterpriseIdentity.ts'
import {
  sendOutboundEmail,
  outboundEmailFailure,
} from '../_shared/outboundEmail.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
};

async function logPayrollAudit(supabaseAdmin, event) {
  try {
    await supabaseAdmin.from('payroll_audit_events').insert(event);
  } catch (_) {
    console.log(JSON.stringify({ audit_fallback: event.event_type }));
  }
}

function buildPayslipHtml(payslip, companyName) {
  const earnings = payslip.payslip_items.filter(i => i.type === 'earning');
  const deductions = payslip.payslip_items.filter(i => i.type === 'deduction');

  return `
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <div style="max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 20px;">
            <h2 style="margin: 0;">${companyName}</h2>
            <p style="color: #666;">Payslip</p>
          </div>
          
          <div style="margin: 20px 0;">
            <p><strong>Employee No:</strong> ${payslip.employees.employee_number}</p>
            <p><strong>Employee:</strong> ${payslip.employees.first_name} ${payslip.employees.last_name}</p>
            ${payslip.employees.department ? `<p><strong>Department:</strong> ${payslip.employees.department}</p>` : ''}
            ${payslip.employees.position ? `<p><strong>Position:</strong> ${payslip.employees.position}</p>` : ''}
            <p><strong>Pay Period:</strong> ${new Date(payslip.payroll_runs.pay_period_start).toLocaleDateString()} - ${new Date(payslip.payroll_runs.pay_period_end).toLocaleDateString()}</p>
            <p><strong>Pay Date:</strong> ${new Date(payslip.payroll_runs.pay_date).toLocaleDateString()}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background-color: #f9f9f9;">
                <th style="text-align: left; padding: 8px;">Description</th>
                <th style="text-align: right; padding: 8px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="2" style="padding: 8px; font-weight: bold;">Earnings</td></tr>
              ${earnings.map(item => `
                <tr>
                  <td style="padding: 8px;">${item.description}</td>
                  <td style="text-align: right; padding: 8px;">${formatCurrency(item.amount)}</td>
                </tr>
              `).join('')}
              <tr>
                <td style="padding: 8px; font-weight: bold; border-top: 1px solid #eee;">Total Earnings</td>
                <td style="text-align: right; padding: 8px; font-weight: bold; border-top: 1px solid #eee;">${formatCurrency(payslip.total_earnings)}</td>
              </tr>

              <tr><td colspan="2" style="padding: 8px; font-weight: bold; padding-top: 20px;">Deductions</td></tr>
              ${deductions.length > 0 ? deductions.map(item => `
                <tr>
                  <td style="padding: 8px;">${item.description}</td>
                  <td style="text-align: right; padding: 8px;">${formatCurrency(item.amount)}</td>
                </tr>
              `).join('') : '<tr><td colspan="2" style="padding: 8px; color: #999;">None</td></tr>'}
              <tr>
                <td style="padding: 8px; font-weight: bold; border-top: 1px solid #eee;">Total Deductions</td>
                <td style="text-align: right; padding: 8px; font-weight: bold; border-top: 1px solid #eee;">${formatCurrency(payslip.total_deductions)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="background-color: #e6f7ff;">
                <td style="padding: 12px; font-weight: bold; font-size: 1.1em;">Net Pay</td>
                <td style="text-align: right; padding: 12px; font-weight: bold; font-size: 1.1em;">${formatCurrency(payslip.net_pay)}</td>
              </tr>
            </tfoot>
          </table>
          
          <p style="text-align: center; color: #999; font-size: 12px;">This is a system generated payslip.</p>
        </div>
      </body>
    </html>
  `;
}

async function sendPayslipEmail(payslip, supabaseAdmin) {
  const identity = await resolveEnterpriseIdentityEdge(supabaseAdmin, payslip.company_id);
  const htmlBody = buildPayslipHtml(payslip, identity.name);

  await sendOutboundEmail({
    identity,
    mailbox: 'payroll',
    to: payslip.employees.email,
    subject: `Payslip: ${new Date(payslip.payroll_runs.pay_date).toLocaleDateString()}`,
    html: htmlBody,
  });

  await supabaseAdmin
    .from('payslips')
    .update({ email_sent_at: new Date().toISOString() })
    .eq('id', payslip.id);
}

serve(withEnterprisePlatform('send-payslip-email', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const body = await req.json();
    const { payslipId, payrollRunId } = body;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (payrollRunId) {
      const { data: run, error: runError } = await supabaseAdmin
        .from('payroll_runs')
        .select('id, company_id, status')
        .eq('id', payrollRunId)
        .single();
      if (runError) throw runError;
      if (run.status !== 'finalized' && run.status !== 'paid') throw new Error('Payroll run must be finalized before distributing payslips.');

      const { data: member } = await supabase
        .from('company_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', run.company_id)
        .single();
      if (!member || !['owner', 'admin'].includes(member.role)) {
        throw new Error("Access Denied: Payroll requires Admin privileges.");
      }

      const { data: payslips, error: payslipsError } = await supabaseAdmin
        .from('payslips')
        .select(`
          *,
          employees ( employee_number, first_name, last_name, email, department, position ),
          payroll_runs ( pay_period_start, pay_period_end, pay_date, status ),
          payslip_items ( description, type, amount )
        `)
        .eq('payroll_run_id', payrollRunId);

      if (payslipsError) throw payslipsError;

      const results = { sent: 0, failed: [] };
      for (const payslip of payslips ?? []) {
        if (!payslip.employees?.email) {
          results.failed.push({ payslip_id: payslip.id, reason: 'No email address' });
          continue;
        }
        try {
          await sendPayslipEmail(payslip, supabaseAdmin);
          results.sent++;
          await logPayrollAudit(supabaseAdmin, {
            company_id: run.company_id,
            payroll_run_id: payrollRunId,
            payslip_id: payslip.id,
            event_type: 'payslip_emailed',
            event_data: { recipient: payslip.employees.email },
            created_by: user.id,
          });
        } catch (e) {
          results.failed.push({ payslip_id: payslip.id, reason: e.message });
        }
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (!payslipId) throw new Error("Payslip ID or Payroll Run ID is required.");

    const { data: payslip, error: fetchError } = await supabaseAdmin
      .from('payslips')
      .select(`
        *,
        employees ( first_name, last_name, email, department, position ),
        payroll_runs ( pay_period_start, pay_period_end, pay_date, status ),
        payslip_items ( description, type, amount )
      `)
      .eq('id', payslipId)
      .single();

    if (fetchError) throw fetchError;
    if (!payslip) throw new Error("Payslip not found.");
    if (!payslip.employees.email) throw new Error("Employee does not have an email address.");

    const { data: member, error: memberError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', payslip.company_id)
      .single();

    if (memberError || !member || !['owner', 'admin'].includes(member.role)) {
      throw new Error("Access Denied: Payroll requires Admin privileges.");
    }

    await sendPayslipEmail(payslip, supabaseAdmin);

    await logPayrollAudit(supabaseAdmin, {
      company_id: payslip.company_id,
      payroll_run_id: payslip.payroll_run_id,
      payslip_id: payslip.id,
      event_type: 'payslip_emailed',
      event_data: { recipient: payslip.employees.email },
      created_by: user.id,
    });

    return new Response(JSON.stringify({ message: "Payslip sent successfully." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return outboundEmailFailure(_ctx, error);
  }
}))
