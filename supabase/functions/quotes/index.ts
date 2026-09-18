// @ts-nocheck
/**
 * Quotations.
 *
 * Every write goes through a database function, and every one of those is
 * service_role only. This function is where the caller is authorised:
 * bootstrapTenantRequest checks the user belongs to the company, and the
 * database functions check it again against the actor they are given.
 *
 * What changed, and why: the module used to write quotes and quote_items
 * straight from here with no validation at all, and RLS let any member write
 * them by hand as well. Probed against production, it accepted a made-up
 * status, a quote with no lines, a negative quantity, another company's income
 * account, and the rewriting of a price the customer had already accepted.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
  bootstrapTenantRequest,
} from '../_shared/enterpriseEdgePlatform.ts'

const corsHeaders = ENTERPRISE_CORS_HEADERS

/** A failed read must stop the request, not come back as an empty document. */
function mustRead(label: string, res: { error: unknown }) {
  if (res.error) {
    throw new Error(
      `Could not read the ${label}: ${(res.error as { message?: string }).message ?? res.error}`,
    );
  }
}

/** The lines as the posting function wants them, tolerant of the form's 'none'. */
function itemsForRpc(items: unknown) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    product_id: item.product_id || null,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    income_account_id: item.income_account_id || null,
    tax_rate_id: item.tax_rate_id && item.tax_rate_id !== 'none' ? item.tax_rate_id : null,
  }));
}

serve(withEnterprisePlatform('quotes', 'tenant', async (req, _ctx) => {
  try {
    const { user, admin: supabaseAdmin, body, company_id } = await bootstrapTenantRequest(req, _ctx);
    const { method } = body;

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
          .order('position', { foreignTable: 'quote_items', ascending: true })
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

        const quoteRes = await supabaseAdmin
          .from('quotes')
          .select(`
            id,
            quote_number,
            quote_date,
            expiry_date,
            status,
            description,
            terms,
            accepted_at,
            declined_at,
            decline_reason,
            customers ( id, name, contact_name, address, email, phone, tax_id ),
            quote_items (
              id,
              position,
              description,
              quantity,
              unit_price,
              line_amount,
              tax_amount,
              tax_rate_id,
              products ( name )
            )
          `)
          .eq('id', body.quoteId)
          .eq('company_id', company_id)
          .order('position', { foreignTable: 'quote_items', ascending: true })
          .maybeSingle();
        mustRead('quotation', quoteRes);
        const quote = quoteRes.data;
        if (!quote) throw new Error('Quote not found in this company.');

        const [companyRes, masterRes, bankRes, ratesRes, invoiceRes, grossRes, invoicedRes] = await Promise.all([
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
          supabaseAdmin.rpc('quote_gross_amount', { p_quote_id: body.quoteId }),
          supabaseAdmin.rpc('quote_invoiced_amount', { p_quote_id: body.quoteId }),
        ]);

        for (const [label, res] of [
          ['company', companyRes],
          ['company master data', masterRes],
          ['banking details', bankRes],
          ['tax rates', ratesRes],
          ['linked invoices', invoiceRes],
          ['quotation total', grossRes],
          ['amount already invoiced', invoicedRes],
        ] as Array<[string, { error: unknown }]>) {
          if (res.error) {
            throw new Error(
              `Could not read the ${label} for this quotation: ${(res.error as { message?: string }).message ?? res.error}`,
            );
          }
        }

        const gross = Math.round(Number(grossRes.data ?? 0) * 100) / 100;
        const invoiced = Math.round(Number(invoicedRes.data ?? 0) * 100) / 100;

        data = {
          quote,
          company: companyRes.data ?? null,
          master: masterRes.data ?? null,
          // A closed or inactive account must not be printed as "pay us here".
          banking: bankRes.data && bankRes.data.status === 'active' ? bankRes.data : null,
          taxRates: ratesRes.data ?? [],
          invoices: invoiceRes.data ?? [],
          // What is left to invoice, so a part-invoiced quote does not read as
          // either untouched or finished.
          conversion: {
            total: gross,
            invoiced,
            left_to_invoice: Math.round((gross - invoiced) * 100) / 100,
          },
        };
        break;
      }

      case 'POST': {
        const quoteData = body.quoteData ?? {};
        ({ data, error } = await supabaseAdmin.rpc('save_quote_atomic', {
          p_company_id: company_id,
          p_customer_id: quoteData.customer_id ?? null,
          p_quote_date: quoteData.quote_date ?? null,
          p_items: itemsForRpc(quoteData.items),
          p_actor_user_id: user.id,
          p_quote_id: null,
          p_quote_number: quoteData.quote_number || null,
          p_expiry_date: quoteData.expiry_date || null,
          p_description: quoteData.description ?? null,
          p_terms: quoteData.terms ?? null,
        }));
        break;
      }

      case 'PUT': {
        if (!body.quoteId) throw new Error('quoteId is required.');
        const quoteData = body.quoteData ?? {};

        // Answering a quotation and rewriting one are different acts with
        // different rules: an accepted quote's lines are fixed, but the answer
        // itself is exactly what is being recorded. A status-only update is the
        // former; the form always sends lines.
        if (!Array.isArray(quoteData.items)) {
          if (!quoteData.status) {
            throw new Error('Nothing to change: send the quotation’s lines, or the answer it was given.');
          }
          ({ data, error } = await supabaseAdmin.rpc('set_quote_status_atomic', {
            p_company_id: company_id,
            p_quote_id: body.quoteId,
            p_status: quoteData.status,
            p_actor_user_id: user.id,
            p_reason: quoteData.decline_reason ?? quoteData.reason ?? null,
          }));
          break;
        }

        ({ data, error } = await supabaseAdmin.rpc('save_quote_atomic', {
          p_company_id: company_id,
          p_customer_id: quoteData.customer_id ?? null,
          p_quote_date: quoteData.quote_date ?? null,
          p_items: itemsForRpc(quoteData.items),
          p_actor_user_id: user.id,
          p_quote_id: body.quoteId,
          p_quote_number: quoteData.quote_number || null,
          p_expiry_date: quoteData.expiry_date || null,
          p_description: quoteData.description ?? null,
          p_terms: quoteData.terms ?? null,
        }));
        break;
      }

      case 'DELETE': {
        if (!body.quoteId) throw new Error('quoteId is required.');
        ({ data, error } = await supabaseAdmin.rpc('delete_quote_atomic', {
          p_company_id: company_id,
          p_quote_id: body.quoteId,
          p_actor_user_id: user.id,
        }));
        break;
      }

      case 'GET_NEXT_QUOTE_NUMBER': {
        ({ data, error } = await supabaseAdmin.rpc('get_next_quote_number', { p_company_id: company_id }));
        break;
      }

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
