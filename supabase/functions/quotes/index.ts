// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('quotes', 'tenant', async (req, _ctx) => {

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
    _ctx.companyId = company_id;

    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) {
      throw new Error("Permission denied.");
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
        ({ data, error } = await supabaseAdmin
          .from('quotes')
          // The rate is embedded, not just its id: a list that cannot resolve
          // the rate cannot show VAT, which is how the quote total came to
          // disagree with the invoice raised from it.
          .select('*, customers ( name ), quote_items(quantity, unit_price, tax_rate_id, tax_rates(id, name, rate))')
          .eq('company_id', company_id)
          .order('quote_date', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('quotes')
          .select('*, customers ( name, address, email ), quote_items(*, products(name), tax_rates(id, name, rate))')
          .eq('id', body.quoteId)
          .eq('company_id', company_id)
          .single());
        break;

      /**
       * Everything the printed quotation needs, in one round trip.
       *
       * The document draws on five places -- the quote, its lines, the customer,
       * company identity, and the bank account a deposit would be paid into --
       * plus the company's tax rates, because a line stores only the id of the
       * rate it was quoted at and a document that cannot resolve the rate
       * cannot show the VAT. Fetching these from the browser would be five edge
       * calls at roughly half a second each before a page could be drawn.
       *
       * Every read is checked. A quotation that silently drops its tax is how a
       * customer comes to accept one price and be invoiced another.
       */
      case 'GET_DOCUMENT': {
        if (!body.quoteId) throw new Error('quoteId is required.');

        const { data: quote, error: quoteError } = await supabaseAdmin
          .from('quotes')
          .select(`
            id,
            quote_number,
            quote_date,
            expiry_date,
            status,
            description,
            terms,
            customers ( id, name, contact_name, address, email, phone, tax_id ),
            quote_items (
              id,
              description,
              quantity,
              unit_price,
              tax_rate_id,
              products ( name )
            )
          `)
          .eq('id', body.quoteId)
          .eq('company_id', company_id)
          .maybeSingle();
        if (quoteError) throw quoteError;
        if (!quote) throw new Error('Quote not found in this company.');

        const [companyRes, masterRes, bankRes, ratesRes, invoiceRes] = await Promise.all([
          supabaseAdmin
            .from('companies')
            .select('id, name, logo_url, address, tax_id, default_quote_terms')
            .eq('id', company_id)
            .maybeSingle(),
          supabaseAdmin
            .from('efs_company_master_data')
            .select('company_profile, addresses, tax_registrations')
            .eq('company_id', company_id)
            .maybeSingle(),
          // The company's default account is the one a deposit would be paid
          // into. A company with no default has not nominated one, and the
          // document says so rather than inventing a choice between the rest.
          supabaseAdmin
            .from('bank_accounts')
            .select('name, bank_name, account_number, branch_code, account_type, currency, status')
            .eq('company_id', company_id)
            .eq('is_default', true)
            .maybeSingle(),
          supabaseAdmin
            .from('tax_rates')
            .select('id, name, rate')
            .eq('company_id', company_id),
          // Whether this quote has already become an invoice, so the document
          // can say so instead of reading as a live offer.
          supabaseAdmin
            .from('invoices')
            .select('id, invoice_number, status')
            .eq('company_id', company_id)
            .eq('quote_id', body.quoteId)
            .order('invoice_date', { ascending: true }),
        ]);

        for (const [label, res] of [
          ['company', companyRes],
          ['company master data', masterRes],
          ['banking details', bankRes],
          ['tax rates', ratesRes],
          ['linked invoices', invoiceRes],
        ] as Array<[string, { error: unknown }]>) {
          if (res.error) {
            throw new Error(
              `Could not read the ${label} for this quotation: ${(res.error as { message?: string }).message ?? res.error}`,
            );
          }
        }

        data = {
          quote,
          company: companyRes.data ?? null,
          master: masterRes.data ?? null,
          // A closed or inactive account must not be printed as "pay us here".
          banking: bankRes.data && bankRes.data.status === 'active' ? bankRes.data : null,
          taxRates: ratesRes.data ?? [],
          invoices: invoiceRes.data ?? [],
        };
        break;
      }

      case 'POST':
        const { items: postItems, ...postQuoteData } = body.quoteData;
        const { data: newQuote, error: postError } = await supabaseAdmin
          .from('quotes')
          .insert({ ...postQuoteData, company_id })
          .select('id')
          .single();
        if (postError) throw postError;
        
        const itemsToInsert = postItems.map(item => ({ ...item, quote_id: newQuote.id }));
        const { error: postItemsError } = await supabaseAdmin.from('quote_items').insert(itemsToInsert);
        if (postItemsError) throw postItemsError;
        data = newQuote;
        break;

      case 'PUT': {
        if (!body.quoteId) throw new Error('quoteId is required.');
        const { items: putItems, ...putQuoteData } = body.quoteData ?? {};
        const { error: putError } = await supabaseAdmin
          .from('quotes')
          .update(putQuoteData)
          .eq('id', body.quoteId)
          .eq('company_id', company_id);
        if (putError) throw putError;

        // Status-only updates (accept / decline) send no lines. Replacing
        // items then would throw, or wipe the quote, which is how Mark as
        // Accepted returned 500.
        if (Array.isArray(putItems)) {
          const { error: deleteItemsError } = await supabaseAdmin
            .from('quote_items')
            .delete()
            .eq('quote_id', body.quoteId);
          if (deleteItemsError) throw deleteItemsError;
          const putItemsToInsert = putItems.map(item => ({ ...item, quote_id: body.quoteId }));
          const { error: putItemsError } = await supabaseAdmin.from('quote_items').insert(putItemsToInsert);
          if (putItemsError) throw putItemsError;
        }
        data = { id: body.quoteId };
        break;
      }

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('quotes')
          .delete()
          .eq('id', body.quoteId)
          .eq('company_id', company_id));
        break;

      case 'GET_NEXT_QUOTE_NUMBER':
        ({ data, error } = await userSupabase.rpc('get_next_quote_number_for_user'));
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
    return edgeFailure(_ctx, error);
  }
}))
