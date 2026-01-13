// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_DOMAIN = Deno.env.get('RESEND_DOMAIN');

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (!RESEND_API_KEY || !RESEND_DOMAIN) {
      throw new Error("Email service not configured.");
    }

    const { payslipId } = await req.json();
    if (!payslipId) throw new Error("Payslip ID is required.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: payslip, error: fetchError } = await supabaseAdmin
      .from('payslips')
      .select(`
        *,
        employees ( first_name, last_name, email ),
        company:companies ( name ),
        payroll_runs ( pay_period_start, pay_period_end, pay_date ),
        payslip_items ( description, type, amount )
      `)
      .eq('id', payslipId)
      .single();

    if (fetchError) throw fetchError;
    if (!payslip) throw new Error("Payslip not found.");
    if (!payslip.employees.email) throw new Error("Employee does not have an email address.");

    const earnings = payslip.payslip_items.filter(i => i.type === 'earning');
    const deductions = payslip.payslip_items.filter(i => i.type === 'deduction');

    const htmlBody = `
      <html>
        <body style="font-family: sans-serif; color: #333;">
          <div style="max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 20px;">
              <h2 style="margin: 0;">${payslip.company.name}</h2>
              <p style="color: #666;">Payslip</p>
            </div>
            
            <div style="margin: 20px 0;">
              <p><strong>Employee:</strong> ${payslip.employees.first_name} ${payslip.employees.last_name}</p>
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

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `payroll@${RESEND_DOMAIN}`,
        to: payslip.employees.email,
        subject: `Payslip: ${new Date(payslip.payroll_runs.pay_date).toLocaleDateString()}`,
        html: htmlBody,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.json();
      throw new Error(`Failed to send email: ${errorBody.message || 'Unknown error'}`);
    }

    return new Response(JSON.stringify({ message: "Payslip sent successfully." }), {
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