// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
  requireServiceRole,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_DOMAIN = Deno.env.get('RESEND_DOMAIN');

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(amount);
};

serve(withEnterprisePlatform('send-statement-email', 'service', async (req, _ctx) => {

  try {
    requireServiceRole(req, _ctx);
    if (!RESEND_API_KEY || !RESEND_DOMAIN) {
      throw new Error("Email service is not configured.");
    }

    const { company_id, entityId, type, date_from, date_to, to, subject, body } = await req.json();
    
    // We reuse the logic by calling the existing edge functions locally via fetch? 
    // No, Deno deploy doesn't support self-fetch easily without full URL.
    // We will just invoke the 'customers' or 'vendors' function logic by re-instantiating the client.
    // Actually, simplest is to just call the DB directly here for the specific data we need, similar to the logic we just wrote.
    
    // However, to avoid code duplication hell, let's fetch the data we need.
    // Since we are already in an edge function context, let's just use the Supabase client to fetch what we need.
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch Company Info
    const { data: company } = await supabaseAdmin.from('companies').select('*').eq('id', company_id).single();

    // Re-implement simplified fetching logic for statement data to generate HTML
    // We can't easily call the other edge function from here without a full URL and auth token.
    // So we will just do a direct DB query for the *snapshot* data.
    
    // 1. Get Entity Name/Address
    const table = type === 'customer' ? 'customers' : 'vendors';
    const { data: entity } = await supabaseAdmin.from(table).select('name, address, email').eq('id', entityId).single();

    if (!entity) throw new Error("Entity not found");

    // 2. Calculate Opening Balance
    // (Simplified version: assume front-end sent us the balances? No, safer to recalc).
    // Let's rely on the front-end passing the *summary* data if possible? 
    // No, email generation should be server-side authoritative.
    // I'll reuse the logic pattern from above.
    
    // FETCH CONTROL ACCOUNT IDS BY ROLE (never display name)
    const accType = type === 'customer' ? 'Asset' : 'Liability';
    const accRole = type === 'customer' ? 'trade_receivable' : 'trade_payable';
    const { data: accounts } = await supabaseAdmin.from('chart_of_accounts').select('id').eq('company_id', company_id).eq('type', accType).eq('account_role', accRole);
    const accIds = new Set(accounts?.map(a => a.id) || []);

    // OPENING BALANCE
    let opening_balance = 0;
    const { data: openingMoves } = await supabaseAdmin
        .from('journal_entry_items')
        .select('amount, type, account_id')
        .eq('journal_entries.company_id', company_id)
        .eq(type === 'customer' ? 'journal_entries.customer_id' : 'journal_entries.vendor_id', entityId)
        .lt('journal_entries.entry_date', date_from)
        .select(`amount, type, account_id, journal_entries!inner(entry_date)`);
    
    openingMoves?.forEach(item => {
        const isPositive = type === 'customer' ? item.type === 'debit' : item.type === 'credit';
        opening_balance += isPositive ? item.amount : -item.amount;
    });

    // TRANSACTIONS
    const { data: transactions } = await supabaseAdmin
        .from('journal_entries')
        .select(`id, entry_date, description, invoices(invoice_number), bills(bill_number), journal_entry_items(amount, type, account_id)`)
        .eq('company_id', company_id)
        .eq(type === 'customer' ? 'customer_id' : 'vendor_id', entityId)
        .gte('entry_date', date_from)
        .lte('entry_date', date_to)
        .order('entry_date', { ascending: true });

    let runningBalance = opening_balance;
    const statementRows = transactions?.map(t => {
        let amount = 0;
        let rowType = '';
        const relevantItems = t.journal_entry_items.filter(i => accIds.has(i.account_id));
        
        if (relevantItems.length > 0) {
             const debits = relevantItems.filter(i => i.type === 'debit').reduce((s, i) => s + i.amount, 0);
             const credits = relevantItems.filter(i => i.type === 'credit').reduce((s, i) => s + i.amount, 0);
             if (type === 'customer') {
                 // AR: Debit+, Credit-
                 if (debits > 0) { amount = debits; rowType = 'Invoice'; runningBalance += amount; }
                 else { amount = credits; rowType = 'Payment'; runningBalance -= amount; }
             } else {
                 // AP: Credit+, Debit-
                 if (credits > 0) { amount = credits; rowType = 'Bill'; runningBalance += amount; }
                 else { amount = debits; rowType = 'Payment'; runningBalance -= amount; }
             }
        } else {
            // Fallback
            amount = t.journal_entry_items[0]?.amount || 0;
            rowType = 'Other';
        }
        
        return {
            date: t.entry_date,
            description: t.description,
            ref: t.invoices?.invoice_number || t.bills?.[0]?.bill_number || '-',
            type: rowType,
            amount,
            balance: runningBalance
        };
    }) || [];

    const htmlBody = `
      <html>
        <body style="font-family: sans-serif; color: #333;">
          <div style="max-width: 700px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <div style="border-bottom: 1px solid #eee; padding-bottom: 20px; margin-bottom: 20px;">
              <h1 style="font-size: 24px; margin: 0;">Statement of Account</h1>
              <p style="margin: 5px 0 0; color: #666;">${company?.name}</p>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
              <div>
                <strong style="display: block; margin-bottom: 5px;">To:</strong>
                ${entity.name}<br>
                ${entity.address || ''}
              </div>
              <div style="text-align: right;">
                <strong style="display: block; margin-bottom: 5px;">Period:</strong>
                ${new Date(date_from).toLocaleDateString()} to ${new Date(date_to).toLocaleDateString()}
              </div>
            </div>

            <p style="margin-bottom: 20px;">${body.replace(/\n/g, '<br>')}</p>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background-color: #f9f9f9;">
                  <th style="text-align: left; padding: 10px; border-bottom: 2px solid #eee;">Date</th>
                  <th style="text-align: left; padding: 10px; border-bottom: 2px solid #eee;">Description</th>
                  <th style="text-align: left; padding: 10px; border-bottom: 2px solid #eee;">Ref</th>
                  <th style="text-align: right; padding: 10px; border-bottom: 2px solid #eee;">Amount</th>
                  <th style="text-align: right; padding: 10px; border-bottom: 2px solid #eee;">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="4" style="padding: 10px; font-style: italic;"><strong>Opening Balance</strong></td>
                  <td style="text-align: right; padding: 10px; font-weight: bold;">${formatCurrency(opening_balance)}</td>
                </tr>
                ${statementRows.map(row => `
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${new Date(row.date).toLocaleDateString()}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${row.description}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${row.ref}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${row.type === 'Payment' ? '-' : ''}${formatCurrency(row.amount)}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(row.balance)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="background-color: #f0fdf4;">
                  <td colspan="4" style="padding: 15px; font-weight: bold; text-align: right;">Closing Balance</td>
                  <td style="padding: 15px; font-weight: bold; text-align: right; font-size: 16px;">${formatCurrency(runningBalance)}</td>
                </tr>
              </tfoot>
            </table>
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
        from: `accounts@${RESEND_DOMAIN}`,
        to: to,
        subject: subject,
        html: htmlBody,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.json();
      throw new Error(`Failed to send email: ${errorBody.message || 'Unknown error'}`);
    }

    return new Response(JSON.stringify({ message: "Statement sent successfully." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
