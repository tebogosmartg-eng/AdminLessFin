// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
} from '../_shared/enterpriseEdgePlatform.ts'
import { resolveEnterpriseIdentityEdge } from '../_shared/enterpriseIdentity.ts'
import {
  relatedOne,
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

serve(withEnterprisePlatform('send-po-email', 'tenant', async (req, _ctx) => {

  try {
    // Sending is a CUSTOMER action taken from the browser, so this is a
    // tenant-authenticated endpoint: authenticate the user, then authorise them
    // against the record's own company. It previously called requireServiceRole,
    // which demands the Authorization header equal the service-role key — a
    // browser session can never satisfy that, so every send returned 401.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    const assertMember = async (companyId: string) => {
      const { data: membership, error: membershipError } = await supabase
        .from('company_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .single();
      if (membershipError || !membership) throw new Error("Permission denied.");
      _ctx.companyId = companyId;
    };

    const { poId, to, subject, body } = await req.json();
    if (!poId || !to || !subject || !body) {
      throw new Error("Missing required parameters.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: po, error: poError } = await supabaseAdmin
      .from('purchase_orders')
      .select(`
        company_id,
        po_number,
        po_date,
        delivery_date,
        vendors ( name, address ),
        purchase_order_items (
          description,
          quantity,
          unit_cost
        )
      `)
      .eq('id', poId)
      .maybeSingle();

    if (poError) throw poError;
    if (!po) throw new Error("Purchase order not found.");
    await assertMember(po.company_id);
    if (!po) throw new Error("Purchase Order not found.");

    const identity = await resolveEnterpriseIdentityEdge(supabaseAdmin, po.company_id);
    const vendor = relatedOne(po.vendors);
    const items = Array.isArray(po.purchase_order_items) ? po.purchase_order_items : [];
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_cost), 0);

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
                <h2 style="font-size: 28px; font-weight: bold; margin: 0;">PURCHASE ORDER</h2>
                <p style="margin: 0; color: #666;">#${po.po_number}</p>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 20px 0;">
              <div>
                <h3 style="margin: 0 0 5px 0; font-weight: bold;">Vendor:</h3>
                <p style="margin: 0;">${vendor?.name || 'Vendor'}</p>
                <p style="margin: 0; color: #666;">${vendor?.address || ''}</p>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0;"><strong style="font-weight: bold;">Date:</strong> ${new Date(po.po_date).toLocaleDateString()}</p>
                <p style="margin: 0;"><strong style="font-weight: bold;">Delivery Due:</strong> ${po.delivery_date ? new Date(po.delivery_date).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
            <p style="margin-bottom: 20px;">${body.replace(/\n/g, '<br>')}</p>
            <table style="width: 100%; border-collapse: collapse;">
              <thead style="background-color: #f9f9f9;">
                <tr>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: left;">Description</th>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: center;">Qty</th>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: right;">Unit Cost</th>
                  <th style="padding: 10px; border: 1px solid #eee; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any) => `
                  <tr>
                    <td style="padding: 10px; border: 1px solid #eee;">${item.description}</td>
                    <td style="padding: 10px; border: 1px solid #eee; text-align: center;">${item.quantity}</td>
                    <td style="padding: 10px; border: 1px solid #eee; text-align: right;">${formatCurrency(item.unit_cost)}</td>
                    <td style="padding: 10px; border: 1px solid #eee; text-align: right;">${formatCurrency(item.quantity * item.unit_cost)}</td>
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
          </div>
        </body>
      </html>
    `;

    const sent = await sendOutboundEmail({
      identity,
      mailbox: 'purchasing',
      to,
      subject,
      html: htmlBody,
    });

    return new Response(JSON.stringify({
      message: "PO sent successfully.",
      providerMessageId: sent.providerMessageId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return outboundEmailFailure(_ctx, error);
  }
}))
