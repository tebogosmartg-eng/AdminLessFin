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
      throw new Error("Email service is not configured. Please set RESEND_API_KEY and RESEND_DOMAIN secrets in your Supabase project.");
    }

    const { invoiceId, to, subject, body } = await req.json();
    if (!invoiceId || !to || !subject || !body) {
      throw new Error("Missing required parameters: invoiceId, to, subject, body.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select(`
        invoice_number,
        invoice_date,
        due_date,
        user_id,
        customers ( name, address ),
        journal_entries (
          journal_entry_items (
            amount,
            type,
            chart_of_accounts ( name )
          )
        )
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError) throw invoiceError;
    if (!invoice) throw new Error("Invoice not found.");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('company_name, company_address')
      .eq('id', invoice.user_id)
      .single();
    
    if (profileError) throw profileError;

    const lineItems = invoice.journal_entries[0].journal_entry_items.filter((item: any) => item.type === 'credit');
    const totalAmount = lineItems.reduce((sum: number, item: any) => sum + item.amount, 0);

    const htmlBody = `
      <html>
        <body style="font-family: sans-serif; color: #333;">
          <div style="max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <div style="display: flex; justify-content: space-between; align-items: start; padding-bottom: 20px; border-bottom: 1px solid #eee;">
              <div>
                <h1 style="font-size: 24px; font-weight: bold; margin: 0;">${profile?.company_name || 'Your Company'}</h1>
                <p style="margin: 0; color: #666;">${profile?.company_address || ''}</p>
              </div>
              <div style="text-align: right;">
                <h2 style="font-size: 28px; font-weight: bold; margin: 0;">INVOICE</h2>
                <p style="margin: 0; color: #666;">#${invoice.invoice_number}</p>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 20px 0;">
              <div>
                <h3 style="margin: 0 0 5px 0; font-weight: bold;">Bill To:</h3>
                <p style="margin: 0;">${invoice.customers.name}</p>
                <p style="margin: 0; color: #666;">${invoice.customers.address || ''}</p>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0;"><strong style="font-weight: bold;">Invoice Date:</strong> ${new Date(invoice.invoice_date).toLocaleDateString()}</p>
                <p style="margin: 0;"><strong style="font-weight: bold;">Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
              </div>
            </div>
            <p style="margin-bottom: 20px;">${body.replace(/\n/g, '<br>')}</p>
            <table style="width: 100%; border-collapse: collapse;">
              <thead style="background-color: #f9f9f9;">
                <tr>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: left;">Description</th>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${lineItems.map((item: any) => `
                  <tr>
                    <td style="padding: 10px; border: 1px solid #eee;">${item.chart_of_accounts.name}</td>
                    <td style="padding: 10px; border: 1px solid #eee; text-align: right;">${formatCurrency(item.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="font-weight: bold; background-color: #f9f9f9;">
                  <td style="padding: 10px; border: 1px solid #eee; text-align: right;">Total</td>
                  <td style="padding: 10px; border: 1px solid #eee; text-align: right;">${formatCurrency(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
            <p style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
              Thank you for your business!
            </p>
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
        from: `invoices@${RESEND_DOMAIN}`,
        to: to,
        subject: subject,
        html: htmlBody,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.json();
      throw new Error(`Failed to send email: ${errorBody.message || 'Unknown error'}`);
    }

    return new Response(JSON.stringify({ message: "Email sent successfully." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error sending invoice email:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})