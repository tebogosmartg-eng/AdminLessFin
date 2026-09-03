// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import { resolveEnterpriseIdentityEdge } from '../_shared/enterpriseIdentity.ts'
import {
  relatedOne,
  sendOutboundEmail,
  outboundEmailFailure,
} from '../_shared/outboundEmail.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const logAudit = (event: {
  action: string;
  outcome: 'attempt' | 'rejected' | 'success' | 'failed';
  user_id?: string | null;
  company_id?: string | null;
  invoice_id?: string | null;
  recipient?: string;
  reason?: string;
}) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event,
  }));
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
};

serve(withEnterprisePlatform('send-invoice-email', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new HttpError("User not authenticated.", 401);
    }

    const { invoiceId, to, subject, body } = await req.json();
    if (!invoiceId || !to || !subject || !body) {
      throw new HttpError("Missing required parameters: invoiceId, to, subject, body.", 400);
    }
    if (!UUID_REGEX.test(invoiceId)) {
      throw new HttpError("Invalid invoiceId format.", 400);
    }
    if (!EMAIL_REGEX.test(to)) {
      throw new HttpError("Invalid recipient email format.", 400);
    }
    if (typeof subject !== 'string' || subject.trim().length === 0 || subject.length > 200) {
      throw new HttpError("Subject is required and must be 1-200 characters.", 400);
    }
    if (typeof body !== 'string' || body.trim().length === 0 || body.length > 5000) {
      throw new HttpError("Body is required and must be 1-5000 characters.", 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    logAudit({
      action: 'send_invoice_email',
      outcome: 'attempt',
      user_id: user.id,
      invoice_id: invoiceId,
      recipient: to,
    });

    // journal_entries is reached by a named foreign key: invoices and
    // journal_entries reference each other both ways, and this is the
    // invoice's own posting journal.
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select(`
        id,
        company_id,
        invoice_number,
        invoice_date,
        due_date,
        customers ( name, address ),
        journal_entries!journal_entry_id (
          journal_entry_items (
            amount,
            type,
            chart_of_accounts ( name )
          )
        )
      `)
      .eq('id', invoiceId)
      .maybeSingle();

    if (invoiceError) throw invoiceError;
    if (!invoice) {
      throw new HttpError("Invoice not found.", 404);
    }

    const { data: membership, error: membershipError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', invoice.company_id)
      .single();

    if (membershipError || !membership) {
      throw new HttpError("Permission denied.", 403);
    }

    const identity = await resolveEnterpriseIdentityEdge(supabaseAdmin, invoice.company_id);
    const customer = relatedOne(invoice.customers);
    // journal_entry_id is a to-one relationship, so this comes back as an object.
    // Indexing it as an array yields undefined and empties the invoice.
    const primaryEntry = relatedOne(invoice.journal_entries);
    const journalItems = Array.isArray(primaryEntry?.journal_entry_items) ? primaryEntry.journal_entry_items : [];
    const lineItems = journalItems.filter((item: any) => item.type === 'credit');
    const totalAmount = lineItems.reduce((sum: number, item: any) => sum + item.amount, 0);

    const htmlBody = `
      <html>
        <body style="font-family: sans-serif; color: #333;">
          <div style="max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <div style="display: flex; justify-content: space-between; align-items: start; padding-bottom: 20px; border-bottom: 1px solid #eee;">
              <div>
                <h1 style="font-size: 24px; font-weight: bold; margin: 0;">${identity.name}</h1>
                <p style="margin: 0; color: #666;">${identity.address}</p>
                ${identity.email ? `<p style="margin: 0; color: #666;">${identity.email}</p>` : ''}
              </div>
              <div style="text-align: right;">
                <h2 style="font-size: 28px; font-weight: bold; margin: 0;">INVOICE</h2>
                <p style="margin: 0; color: #666;">#${invoice.invoice_number}</p>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 20px 0;">
              <div>
                <h3 style="margin: 0 0 5px 0; font-weight: bold;">Bill To:</h3>
                <p style="margin: 0;">${customer?.name || 'Customer'}</p>
                <p style="margin: 0; color: #666;">${customer?.address || ''}</p>
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

    const sent = await sendOutboundEmail({
      identity,
      mailbox: 'invoices',
      to,
      subject,
      html: htmlBody,
    });

    logAudit({
      action: 'send_invoice_email',
      outcome: 'success',
      user_id: user.id,
      company_id: invoice.company_id,
      invoice_id: invoice.id,
      recipient: to,
    });

    return new Response(JSON.stringify({
      message: "Email sent successfully.",
      providerMessageId: sent.providerMessageId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error sending invoice email:', error);
    if (error instanceof HttpError) {
      logAudit({
        action: 'send_invoice_email',
        outcome: 'rejected',
        reason: error.message,
      });
    } else {
      logAudit({
        action: 'send_invoice_email',
        outcome: 'failed',
        reason: error?.message ?? 'Unknown error',
      });
    }
    if (error instanceof HttpError) {
      return edgeFailure(_ctx, error, {}, error.status);
    }
    return outboundEmailFailure(_ctx, error);
  }
}))
