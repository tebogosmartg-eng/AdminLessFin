// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import { resolveEnterpriseIdentityEdge } from '../_shared/enterpriseIdentity.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_DOMAIN = Deno.env.get('RESEND_DOMAIN');

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
};

serve(withEnterprisePlatform('send-quote-email', 'tenant', async (req, _ctx) => {

  try {
    // Sending a quote is a CUSTOMER action taken from the browser, so this is a
    // tenant-authenticated endpoint: authenticate the user, then authorise them
    // against the quote's own company. It previously called requireServiceRole,
    // which demands the Authorization header equal the service-role key — a
    // browser session can never satisfy that, so every send returned 401.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    if (!RESEND_API_KEY || !RESEND_DOMAIN) {
      throw new Error("Email service is not configured. Please set RESEND_API_KEY and RESEND_DOMAIN secrets.");
    }

    const { quoteId, to, subject, body } = await req.json();
    if (!quoteId || !to || !subject || !body) {
      throw new Error("Missing required parameters.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .select(`
        company_id,
        quote_number,
        quote_date,
        expiry_date,
        terms,
        customers ( name, address ),
        quote_items (
          description,
          quantity,
          unit_price
        )
      `)
      .eq('id', quoteId)
      .single();

    if (quoteError) throw quoteError;
    if (!quote) throw new Error("Quote not found.");

    // Tenant isolation: the caller must belong to the quote's company.
    const { data: membership, error: membershipError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', quote.company_id)
      .single();
    if (membershipError || !membership) throw new Error("Permission denied.");
    _ctx.companyId = quote.company_id;

    const identity = await resolveEnterpriseIdentityEdge(supabaseAdmin, quote.company_id);
    const totalAmount = quote.quote_items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);

    const htmlBody = `
      <html>
        <body style="font-family: sans-serif; color: #333;">
          <div style="max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <div style="display: flex; justify-content: space-between; align-items: start; padding-bottom: 20px; border-bottom: 1px solid #eee;">
              <div>
                <h1 style="font-size: 24px; font-weight: bold; margin: 0;">${identity.name}</h1>
                <p style="margin: 0; color: #666;">${identity.address}</p>
              </div>
              <div style="text-align: right;">
                <h2 style="font-size: 28px; font-weight: bold; margin: 0;">QUOTE</h2>
                <p style="margin: 0; color: #666;">#${quote.quote_number}</p>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 20px 0;">
              <div>
                <h3 style="margin: 0 0 5px 0; font-weight: bold;">To:</h3>
                <p style="margin: 0;">${quote.customers.name}</p>
                <p style="margin: 0; color: #666;">${quote.customers.address || ''}</p>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0;"><strong style="font-weight: bold;">Date:</strong> ${new Date(quote.quote_date).toLocaleDateString()}</p>
                <p style="margin: 0;"><strong style="font-weight: bold;">Expiry:</strong> ${quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
            <p style="margin-bottom: 20px;">${body.replace(/\n/g, '<br>')}</p>
            <table style="width: 100%; border-collapse: collapse;">
              <thead style="background-color: #f9f9f9;">
                <tr>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: left;">Description</th>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: center;">Qty</th>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: right;">Price</th>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${quote.quote_items.map((item: any) => `
                  <tr>
                    <td style="padding: 10px; border: 1px solid #eee;">${item.description}</td>
                    <td style="padding: 10px; border: 1px solid #eee; text-align: center;">${item.quantity}</td>
                    <td style="padding: 10px; border: 1px solid #eee; text-align: right;">${formatCurrency(item.unit_price)}</td>
                    <td style="padding: 10px; border: 1px solid #eee; text-align: right;">${formatCurrency(item.quantity * item.unit_price)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="font-weight: bold; background-color: #f9f9f9;">
                  <td colspan="3" style="padding: 10px; border: 1px solid #eee; text-align: right;">Total</td>
                  <td style="padding: 10px; border: 1px solid #eee; text-align: right;">${formatCurrency(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
            ${quote.terms ? `
              <div style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
                <h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: bold;">Terms &amp; Conditions</h4>
                <p style="margin: 0; font-size: 11px; color: #666; white-space: pre-wrap;">${String(quote.terms)
                  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              </div>
            ` : ''}
            <p style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
              This quote is valid until ${quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : 'further notice'}.
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
        from: `quotes@${RESEND_DOMAIN}`,
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
    return edgeFailure(_ctx, error);
  }
}))
