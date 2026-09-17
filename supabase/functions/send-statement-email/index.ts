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
  relatedOne,
  escapeHtml,
} from '../_shared/outboundEmail.ts'
import {
  buildStatementRows,
  closingBalance,
  describeClosing,
  fetchControlAccountIds,
  fetchOpeningBalance,
} from '../_shared/partyStatement.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

/** "R 1 234,56" -- the same figure format the PDF and the screen print. */
const formatCurrency = (amount: number) => {
  const v = Number(amount) || 0;
  const sign = v < 0 ? '-' : '';
  const [whole, cents] = Math.abs(v).toFixed(2).split('.');
  return `${sign}R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${cents}`;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "16 Sept 2026", independent of the edge runtime's locale. */
const formatDay = (iso: string) => {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

serve(withEnterprisePlatform('send-statement-email', 'tenant', async (req, _ctx) => {

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

    const { company_id, entityId, type, date_from, date_to, to, subject, body } = await req.json();
    
    if (!company_id) throw new Error("company_id is required.");
    if (type !== 'customer' && type !== 'vendor') throw new Error("type must be 'customer' or 'vendor'.");
    if (!entityId) throw new Error("entityId is required.");
    if (!DATE_ONLY.test(String(date_from)) || !DATE_ONLY.test(String(date_to))) {
      throw new Error('date_from and date_to must be dates in YYYY-MM-DD format.');
    }
    if (date_from > date_to) throw new Error('date_from must not be after date_to.');
    await assertMember(company_id);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const identity = await resolveEnterpriseIdentityEdge(supabaseAdmin, company_id);

    // 1. The party. Scoped to the caller's company: looked up by id alone, a
    //    member of one company could have emailed a statement for another
    //    company's customer simply by passing its id.
    const table = type === 'customer' ? 'customers' : 'vendors';
    const { data: entity, error: entityError } = await supabaseAdmin
      .from(table)
      .select('name, contact_name, address, email')
      .eq('id', entityId)
      .eq('company_id', company_id)
      .maybeSingle();
    if (entityError) throw entityError;
    if (!entity) throw new Error(type === 'customer' ? 'Customer not found in this company.' : 'Supplier not found in this company.');

    // 2. The statement. Worked out in _shared/partyStatement.ts, the same code
    //    the customers and vendors functions use, so what a customer is emailed
    //    is exactly what the screen and the PDF show. This copy used to sum
    //    every line of the party's journals for its opening balance -- zero by
    //    construction -- and listed journals that never touched the control
    //    account as "Other" rows with an arbitrary amount.
    const side = type === 'customer' ? 'receivable' : 'payable';
    const controlIds = await fetchControlAccountIds(supabaseAdmin, company_id, side);
    const { opening_balance, opening_balance_known } = await fetchOpeningBalance(supabaseAdmin, {
      companyId: company_id,
      side,
      partyId: entityId,
      dateFrom: date_from,
      controlIds,
    });

    const { data: transactions, error: transactionsError } = await supabaseAdmin
      .from('journal_entries')
      // Forward embeds: the document each journal is FOR, so a payment made
      // against a bill still quotes that bill's number.
      .select(`id, entry_date, description, invoices!invoice_id(invoice_number), bills!bill_id(bill_number), credit_notes!credit_notes_journal_entry_id_fkey(credit_note_number), journal_entry_items(amount, type, account_id)`)
      .eq('company_id', company_id)
      .eq(type === 'customer' ? 'customer_id' : 'vendor_id', entityId)
      .gte('entry_date', date_from)
      .lte('entry_date', date_to)
      .order('entry_date', { ascending: true });
    // Unchecked, a failure here silently emails a statement with no transactions.
    if (transactionsError) throw transactionsError;

    const rows = buildStatementRows(transactions, controlIds, side, (t: any) => ({
      ref: relatedOne(t.invoices)?.invoice_number
        || relatedOne(t.credit_notes)?.credit_note_number
        || relatedOne(t.bills)?.bill_number
        || '-',
    }));
    const closing = closingBalance(opening_balance, rows);
    const closingText = describeClosing(side, closing, opening_balance_known);

    let running = opening_balance;
    const chargeLabel = side === 'receivable' ? 'Invoiced' : 'Billed';
    // Payments and credit notes both reduce what a customer owes; "Received"
    // would call a credit note money that arrived.
    const creditLabel = side === 'receivable' ? 'Credits' : 'Paid';

    // 3. The email. Table layout and inline styles only: Outlook and most
    //    webmail clients ignore flexbox and <style> blocks, which is why the
    //    old two-column header collapsed. Every interpolated value is escaped.
    const BRAND = '#047756';
    const BRAND_BRIGHT = '#10b77f';
    const MUTED = '#76716b';
    const HAIRLINE = '#e2ded8';
    const TINT = '#ecfaf4';
    const cell = 'padding:9px 10px;border-bottom:1px solid ' + HAIRLINE + ';font-size:13px;';
    const money = 'text-align:right;white-space:nowrap;';

    const rowHtml = rows.map((row) => {
      const charge = row.type !== 'payment';
      running = Math.round((running + (charge ? row.amount : -row.amount)) * 100) / 100;
      return `
                <tr>
                  <td style="${cell}white-space:nowrap;">${escapeHtml(formatDay(row.date))}</td>
                  <td style="${cell}">${escapeHtml(row.description || (charge ? 'Charge' : 'Payment'))}</td>
                  <td style="${cell}">${escapeHtml(row.ref)}</td>
                  <td style="${cell}${money}">${charge ? formatCurrency(row.amount) : ''}</td>
                  <td style="${cell}${money}">${charge ? '' : formatCurrency(row.amount)}</td>
                  <td style="${cell}${money}font-weight:600;">${formatCurrency(running)}</td>
                </tr>`;
    }).join('');

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:24px 0;background:#f6f5f2;font-family:Helvetica,Arial,sans-serif;color:#1a1816;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid ${HAIRLINE};border-collapse:collapse;">
            <tr>
              <td style="background:${BRAND};border-bottom:4px solid ${BRAND_BRIGHT};padding:22px 28px;color:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:18px;font-weight:bold;">${escapeHtml(identity.name)}</td>
                    <td style="text-align:right;">
                      <div style="font-size:20px;font-weight:bold;letter-spacing:1px;">STATEMENT</div>
                      <div style="font-size:12px;opacity:0.9;">${escapeHtml(formatDay(date_from))} to ${escapeHtml(formatDay(date_to))}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;width:50%;padding-right:12px;">
                      <div style="font-size:10px;font-weight:bold;letter-spacing:1px;color:${BRAND};text-transform:uppercase;">${type === 'customer' ? 'Account of' : 'Supplier'}</div>
                      <div style="font-size:15px;font-weight:bold;margin-top:4px;">${escapeHtml(entity.name)}</div>
                      ${entity.contact_name ? `<div style="font-size:13px;color:${MUTED};">Attn: ${escapeHtml(entity.contact_name)}</div>` : ''}
                      ${entity.address ? `<div style="font-size:13px;color:${MUTED};white-space:pre-line;">${escapeHtml(entity.address)}</div>` : ''}
                    </td>
                    <td style="vertical-align:top;width:50%;background:${closing > 0 && opening_balance_known ? BRAND_BRIGHT : BRAND};color:#ffffff;padding:14px 16px;">
                      <div style="font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(closingText.label)}</div>
                      <div style="font-size:24px;font-weight:bold;margin-top:4px;">${opening_balance_known ? formatCurrency(Math.abs(closing)) : 'Not available'}</div>
                      <div style="font-size:12px;margin-top:4px;">${escapeHtml(closingText.wording)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${body ? `
            <tr>
              <td style="padding:16px 28px 0;font-size:14px;line-height:1.5;white-space:pre-line;">${escapeHtml(body)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:20px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <thead>
                    <tr style="background:${BRAND};color:#ffffff;">
                      <th style="padding:9px 10px;text-align:left;font-size:11px;">Date</th>
                      <th style="padding:9px 10px;text-align:left;font-size:11px;">Description</th>
                      <th style="padding:9px 10px;text-align:left;font-size:11px;">Reference</th>
                      <th style="padding:9px 10px;text-align:right;font-size:11px;">${chargeLabel}</th>
                      <th style="padding:9px 10px;text-align:right;font-size:11px;">${creditLabel}</th>
                      <th style="padding:9px 10px;text-align:right;font-size:11px;">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style="background:${TINT};">
                      <td style="${cell}"></td>
                      <td style="${cell}font-weight:bold;" colspan="4">Balance brought forward</td>
                      <td style="${cell}${money}font-weight:bold;">${formatCurrency(opening_balance)}</td>
                    </tr>
                    ${rowHtml || `<tr><td style="${cell}color:${MUTED};" colspan="6">No movements in this period.</td></tr>`}
                  </tbody>
                  <tfoot>
                    <tr style="background:${BRAND};color:#ffffff;">
                      <td style="padding:11px 10px;font-weight:bold;font-size:13px;" colspan="5">Closing balance</td>
                      <td style="padding:11px 10px;font-weight:bold;font-size:14px;${money}">${formatCurrency(closing)}</td>
                    </tr>
                  </tfoot>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 22px;font-size:11px;color:${MUTED};border-top:1px solid ${HAIRLINE};">
                <div style="padding-top:12px;">${escapeHtml(identity.name)}${identity.email ? ' &middot; ' + escapeHtml(identity.email) : ''}</div>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const sent = await sendOutboundEmail({
      identity,
      mailbox: 'accounts',
      to,
      subject,
      html: htmlBody,
    });

    return new Response(JSON.stringify({
      message: "Statement sent successfully.",
      providerMessageId: sent.providerMessageId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return outboundEmailFailure(_ctx, error);
  }
}))
