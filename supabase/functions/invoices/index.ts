// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

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

    // Security Check: Verify user membership
    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) {
      throw new Error("Permission denied: User is not a member of this company.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    let data, error;

    switch (method) {
      case 'GET_ALL':
        let query = supabaseAdmin
          .from('invoices')
          .select(`
            id,
            invoice_number,
            invoice_date,
            due_date,
            status,
            customers!inner ( name ),
            journal_entries (
              journal_entry_items (
                type,
                amount
              )
            )
          `)
          .eq('company_id', company_id)
          .order('invoice_date', { ascending: false });

        if (body.filters) {
          const { status, date_from, date_to, search, customer_id } = body.filters;
          
          if (status && status !== 'all') {
            query = query.eq('status', status);
          }
          if (date_from) {
            query = query.gte('invoice_date', date_from);
          }
          if (date_to) {
            query = query.lte('invoice_date', date_to);
          }
          if (customer_id && customer_id !== 'all') {
            query = query.eq('customer_id', customer_id);
          }
          if (search) {
            // Search by invoice number OR customer name (via joined table filter)
            // Supabase postgrest filter for OR across tables is tricky. 
            // Simplified: Search invoice_number OR filter by customer name if possible.
            // For now, sticking to invoice_number or exact customer match logic.
            // Let's assume search is mainly for invoice number for simplicity in this standard query structure.
            query = query.ilike('invoice_number', `%${search}%`);
          }
        }

        ({ data, error } = await query);
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('invoices')
          .select(`
            id,
            invoice_number,
            invoice_date,
            due_date,
            status,
            customers ( name, address, email ),
            journal_entries (
              journal_entry_items (
                id,
                amount,
                type,
                chart_of_accounts ( name ),
                journal_entry_item_tax_rates (
                  tax_rates ( rate )
                )
              )
            )
          `)
          .eq('id', body.invoiceId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'CREATE_WITH_TIMESHEETS':
        const { invoiceData, timesheetIds } = body;
        const { p_items, ...rpcParams } = invoiceData;

        const { data: newInvoiceId, error: rpcError } = await supabaseAdmin.rpc('create_invoice_with_taxes', {
            p_company_id: company_id,
            p_customer_id: rpcParams.customer_id,
            p_invoice_date: rpcParams.invoice_date,
            p_due_date: rpcParams.due_date,
            p_invoice_number: rpcParams.invoice_number,
            p_ar_account_id: rpcParams.accounts_receivable_id,
            p_inventory_asset_account_id: rpcParams.inventory_asset_account_id || null,
            p_tax_payable_account_id: rpcParams.tax_payable_account_id || null,
            p_description: rpcParams.description || `Invoice ${rpcParams.invoice_number}`,
            p_items: p_items,
            p_quote_id: null,
        });

        if (rpcError) throw rpcError;

        if (newInvoiceId && timesheetIds && timesheetIds.length > 0) {
            const { error: updateTimesheetsError } = await supabaseAdmin
                .from('timesheets')
                .update({ is_billed: true, invoice_id: newInvoiceId })
                .in('id', timesheetIds);

            if (updateTimesheetsError) {
                console.error(`Failed to mark timesheets as billed for invoice ${newInvoiceId}:`, updateTimesheetsError);
            }
        }
        
        data = { id: newInvoiceId };
        break;

      case 'PUT':
        // If invoiceData contains items (which it does from InvoiceForm), use full update
        // Otherwise (status updates from list view), use partial update
        if (body.invoiceData.p_items) {
           const { p_items: updateItems, ...updateParams } = body.invoiceData;
           ({ error } = await supabaseAdmin.rpc('update_invoice_full', {
             p_invoice_id: body.invoiceId,
             p_company_id: company_id,
             p_invoice_number: updateParams.invoice_number,
             p_invoice_date: updateParams.invoice_date,
             p_due_date: updateParams.due_date,
             p_customer_id: updateParams.customer_id,
             p_description: updateParams.description || null,
             p_items: updateItems,
             p_ar_account_id: updateParams.accounts_receivable_id,
             p_inventory_asset_account_id: updateParams.inventory_asset_account_id || null,
             p_tax_payable_account_id: updateParams.tax_payable_account_id || null
           }));
           data = { id: body.invoiceId };
        } else {
           // Standard partial update (e.g. status)
           ({ data, error } = await supabaseAdmin
            .from('invoices')
            .update(body.invoiceData)
            .eq('id', body.invoiceId)
            .eq('company_id', company_id)
            .select()
            .single());
        }
        break;

      case 'VOID':
        ({ error } = await supabaseAdmin.rpc('void_invoice', { p_invoice_id: body.invoiceId }));
        data = { message: 'Invoice voided successfully' };
        break;

      case 'GET_NEXT_INVOICE_NUMBER':
        ({ data, error } = await userSupabase.rpc('get_next_invoice_number_for_user'));
        break;

      case 'CREATE_FROM_QUOTE':
        const { quoteId, invoiceData: quoteInvoiceData, percentage } = body;

        const { data: quote, error: quoteError } = await supabaseAdmin
          .from('quotes')
          .select('*, quote_items(*, products(type))')
          .eq('id', quoteId)
          .eq('company_id', company_id)
          .single();
        
        if (quoteError) throw quoteError;
        if (!quote) throw new Error("Quote not found.");
        if (quote.status !== 'accepted') throw new Error("Can only create invoices from accepted quotes.");

        const quote_p_items = quote.quote_items.map(item => ({
          product_id: item.product_id || null,
          quantity: item.quantity,
          unit_price: item.unit_price * (percentage / 100.0),
          income_account_id: item.income_account_id,
          tax_rate_id: item.tax_rate_id || null,
        }));

        ({ error } = await supabaseAdmin.rpc('create_invoice_with_taxes', {
          p_company_id: company_id,
          p_customer_id: quote.customer_id,
          p_invoice_date: quoteInvoiceData.invoice_date,
          p_due_date: quoteInvoiceData.due_date,
          p_invoice_number: quoteInvoiceData.invoice_number,
          p_ar_account_id: quoteInvoiceData.accounts_receivable_id,
          p_inventory_asset_account_id: quoteInvoiceData.inventory_asset_account_id || null,
          p_tax_payable_account_id: quoteInvoiceData.tax_payable_account_id || null,
          p_description: quoteInvoiceData.description || `Invoice for Quote #${quote.quote_number} (${percentage}%)`,
          p_items: quote_p_items,
          p_quote_id: quoteId,
        }));
        data = { message: 'Invoice created from quote successfully.' };
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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})