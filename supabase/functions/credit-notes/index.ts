// @ts-nocheck
/**
 * Customer credit notes.
 *
 * Every write goes through a database function that posts through the posting
 * engine or writes invoice_payment_allocations, and every one of those
 * functions is service_role only. This function is where the caller is
 * authorised: bootstrapTenantRequest checks the user belongs to the company,
 * and the database functions check it again against the actor it is given.
 *
 * A credit note is never deleted. It is voided, which reverses its journal and
 * withdraws whatever it settled.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
  bootstrapTenantRequest,
} from '../_shared/enterpriseEdgePlatform.ts'

const corsHeaders = ENTERPRISE_CORS_HEADERS

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A failed read must stop the request, not come back as an empty document. */
function mustRead(label: string, res: { error: unknown }) {
  if (res.error) {
    throw new Error(
      `Could not read the ${label}: ${(res.error as { message?: string }).message ?? res.error}`,
    );
  }
}

serve(withEnterprisePlatform('credit-notes', 'tenant', async (req, _ctx) => {
  try {
    const { user, admin: supabaseAdmin, body, company_id } = await bootstrapTenantRequest(req, _ctx);
    const { method } = body;

    let data, error;

    switch (method) {
      case 'GET_ALL': {
        const [listRes, settlementRes] = await Promise.all([
          supabaseAdmin
            .from('credit_notes')
            .select(`
              id,
              credit_note_number,
              credit_note_date,
              status,
              reason,
              customer_id,
              invoice_id,
              created_at,
              customers ( name ),
              invoices!invoice_id ( invoice_number )
            `)
            .eq('company_id', company_id)
            .order('credit_note_date', { ascending: false })
            .order('credit_note_number', { ascending: false }),
          supabaseAdmin.rpc('credit_note_settlements', { p_company_id: company_id }),
        ]);
        mustRead('credit notes', listRes);
        mustRead('credit note balances', settlementRes);

        const byId = new Map((settlementRes.data ?? []).map((s) => [s.credit_note_id, s]));
        data = (listRes.data ?? []).map((cn) => {
          const s = byId.get(cn.id);
          const total = Number(s?.total ?? 0);
          const applied = Number(s?.applied ?? 0);
          return {
            ...cn,
            total,
            applied,
            // A void credit note has nothing left to give, whatever its journal
            // once said.
            remaining: cn.status === 'void' ? 0 : Number(s?.remaining ?? 0),
          };
        });
        break;
      }

      /**
       * Everything the credit note document needs, in one round trip: the
       * credit note, its lines, the invoice it credits, what it settled, and
       * the letterhead.
       */
      case 'GET_DOCUMENT':
      case 'GET_ONE': {
        const creditNoteId = body.creditNoteId ?? body.id;
        if (!creditNoteId) throw new Error('creditNoteId is required.');

        const cnRes = await supabaseAdmin
          .from('credit_notes')
          .select(`
            id,
            credit_note_number,
            credit_note_date,
            status,
            reason,
            customer_id,
            invoice_id,
            journal_entry_id,
            created_at,
            voided_at,
            void_reason,
            customers ( id, name, contact_name, address, email, phone, tax_id ),
            invoices!invoice_id ( id, invoice_number, invoice_date ),
            journal_entries!journal_entry_id ( id, journal_number, entry_date ),
            credit_note_items (
              id,
              position,
              description,
              quantity,
              unit_price,
              line_amount,
              tax_amount,
              tax_rates ( id, name, rate )
            )
          `)
          .eq('id', creditNoteId)
          .eq('company_id', company_id)
          .order('position', { foreignTable: 'credit_note_items', ascending: true })
          .maybeSingle();
        mustRead('credit note', cnRes);
        const creditNote = cnRes.data;
        if (!creditNote) throw new Error('Credit note not found in this company.');

        const [companyRes, masterRes, totalRes, appliedRes, allocationsRes, reversalRes] = await Promise.all([
          supabaseAdmin
            .from('companies')
            .select('id, name, logo_url, address, tax_id')
            .eq('id', company_id)
            .maybeSingle(),
          supabaseAdmin
            .from('efs_company_master_data')
            .select('company_profile, addresses, tax_registrations')
            .eq('company_id', company_id)
            .maybeSingle(),
          supabaseAdmin.rpc('credit_note_total', { p_credit_note_id: creditNote.id }),
          supabaseAdmin.rpc('credit_note_applied_amount', { p_credit_note_id: creditNote.id }),
          creditNote.journal_entry_id
            ? supabaseAdmin
                .from('invoice_payment_allocations')
                .select('amount, created_at, invoices ( id, invoice_number, invoice_date, status )')
                .eq('company_id', company_id)
                .eq('journal_entry_id', creditNote.journal_entry_id)
                .order('created_at', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          supabaseAdmin
            .from('posting_requests')
            .select('journal_number, committed_at')
            .eq('company_id', company_id)
            .eq('document_type', 'credit_note')
            .eq('document_id', creditNote.id)
            .not('reversal_of_id', 'is', null)
            .maybeSingle(),
        ]);
        mustRead('company', companyRes);
        mustRead('company master data', masterRes);
        mustRead('credit note total', totalRes);
        mustRead('amount applied', appliedRes);
        mustRead('invoices this credit note settled', allocationsRes);
        mustRead('reversal of this credit note', reversalRes);

        const total = round2(Number(totalRes.data ?? 0));
        const applied = round2(Number(appliedRes.data ?? 0));

        data = {
          credit_note: creditNote,
          company: companyRes.data ?? null,
          master: masterRes.data ?? null,
          settlement: {
            total,
            applied,
            remaining: creditNote.status === 'void' ? 0 : round2(total - applied),
          },
          allocations: allocationsRes.data ?? [],
          reversal: reversalRes.data ?? null,
        };
        break;
      }

      case 'GET_NEXT_NUMBER': {
        ({ data, error } = await supabaseAdmin.rpc('credit_note_next_number', { p_company_id: company_id }));
        break;
      }

      /**
       * The customer's invoices that can still be credited, with how much.
       * An invoice that has been paid can still be credited -- the credit then
       * sits on the account to be refunded or set against the next invoice.
       */
      case 'GET_CREDITABLE_INVOICES': {
        if (!body.customerId) throw new Error('customerId is required.');
        const invRes = await supabaseAdmin
          .from('invoices')
          .select('id, invoice_number, invoice_date, due_date, status')
          .eq('company_id', company_id)
          .eq('customer_id', body.customerId)
          // invoice_status has no 'cancelled' label; naming one is an error.
          .not('status', 'in', '("void","draft")')
          .order('invoice_date', { ascending: false })
          .order('invoice_number', { ascending: false });
        mustRead('invoices', invRes);

        const figures = await Promise.all((invRes.data ?? []).map(async (inv) => {
          const [grossRes, creditedRes, outstandingRes] = await Promise.all([
            supabaseAdmin.rpc('invoice_gross_amount', { p_invoice_id: inv.id }),
            supabaseAdmin.rpc('invoice_credited_amount', { p_invoice_id: inv.id }),
            supabaseAdmin.rpc('invoice_outstanding_amount', { p_invoice_id: inv.id }),
          ]);
          mustRead(`value of invoice ${inv.invoice_number}`, grossRes);
          mustRead(`credits against invoice ${inv.invoice_number}`, creditedRes);
          mustRead(`balance of invoice ${inv.invoice_number}`, outstandingRes);
          const gross = round2(Number(grossRes.data ?? 0));
          const credited = round2(Number(creditedRes.data ?? 0));
          return {
            ...inv,
            gross,
            credited,
            creditable: round2(gross - credited),
            outstanding: round2(Number(outstandingRes.data ?? 0)),
          };
        }));
        data = figures.filter((inv) => inv.creditable > 0);
        break;
      }

      /**
       * An invoice's lines, shaped as credit note lines, so crediting an
       * invoice starts from what was actually invoiced rather than a blank form.
       *
       * The VAT rate is suggested only when it can be proved: the invoice's tax
       * lines all carry the same rate, and applying that rate to every line,
       * rounded per line as the invoice was, reproduces the invoice's VAT to the
       * cent. Otherwise no rate is guessed and the clerk chooses.
       */
      case 'GET_INVOICE_FOR_CREDIT': {
        if (!body.invoiceId) throw new Error('invoiceId is required.');
        const invRes = await supabaseAdmin
          .from('invoices')
          .select(`
            id,
            invoice_number,
            invoice_date,
            status,
            customer_id,
            journal_entries!journal_entry_id (
              journal_entry_items (
                amount,
                type,
                description,
                quantity,
                unit_price,
                account_id,
                chart_of_accounts ( id, name, type, account_role, tax_treatment ),
                journal_entry_item_tax_rates ( tax_rate_id, tax_rates ( id, rate ) )
              )
            )
          `)
          .eq('id', body.invoiceId)
          .eq('company_id', company_id)
          .maybeSingle();
        mustRead('invoice', invRes);
        const invoice = invRes.data;
        if (!invoice) throw new Error('Invoice not found in this company.');

        const [grossRes, creditedRes, outstandingRes] = await Promise.all([
          supabaseAdmin.rpc('invoice_gross_amount', { p_invoice_id: invoice.id }),
          supabaseAdmin.rpc('invoice_credited_amount', { p_invoice_id: invoice.id }),
          supabaseAdmin.rpc('invoice_outstanding_amount', { p_invoice_id: invoice.id }),
        ]);
        mustRead('invoice total', grossRes);
        mustRead('credits against the invoice', creditedRes);
        mustRead('invoice balance', outstandingRes);

        const journal = Array.isArray(invoice.journal_entries) ? invoice.journal_entries[0] : invoice.journal_entries;
        const items = journal?.journal_entry_items ?? [];
        const accountOf = (i) => (Array.isArray(i.chart_of_accounts) ? i.chart_of_accounts[0] : i.chart_of_accounts);
        const isVat = (a) =>
          !!a && (['output_vat', 'vat_control', 'input_vat'].includes(a.account_role) ||
            ['vat_output', 'vat_control', 'vat_input'].includes(a.tax_treatment));

        const revenue = items.filter((i) => i.type === 'credit' && accountOf(i)?.type === 'Income');
        const vatLines = items.filter((i) => i.type === 'credit' && isVat(accountOf(i)));

        const lines = revenue.map((i) => {
          const amount = Number(i.amount) || 0;
          const quantity = i.quantity == null ? 1 : Number(i.quantity);
          const unitPrice = i.unit_price == null ? amount : Number(i.unit_price);
          return {
            description: (i.description ?? '').trim() || accountOf(i)?.name || 'Goods and services supplied',
            quantity,
            unit_price: unitPrice,
            account_id: i.account_id,
            amount: round2(amount),
          };
        });

        const vatTotal = round2(vatLines.reduce((t, i) => t + (Number(i.amount) || 0), 0));
        const rateIds = new Set(
          vatLines.map((i) => i.journal_entry_item_tax_rates?.[0]?.tax_rate_id).filter(Boolean),
        );
        let suggestedTaxRateId = null;
        if (vatTotal > 0 && rateIds.size === 1 && vatLines.every((i) => i.journal_entry_item_tax_rates?.[0]?.tax_rate_id)) {
          const rate = Number(vatLines[0].journal_entry_item_tax_rates[0].tax_rates?.rate ?? NaN);
          if (Number.isFinite(rate)) {
            const reproduced = round2(lines.reduce((t, l) => t + round2((l.amount * rate) / 100), 0));
            if (Math.abs(reproduced - vatTotal) < 0.005) suggestedTaxRateId = [...rateIds][0];
          }
        }

        const gross = round2(Number(grossRes.data ?? 0));
        const credited = round2(Number(creditedRes.data ?? 0));
        data = {
          invoice: {
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.invoice_date,
            status: invoice.status,
            customer_id: invoice.customer_id,
          },
          gross,
          credited,
          creditable: round2(gross - credited),
          outstanding: round2(Number(outstandingRes.data ?? 0)),
          vat_total: vatTotal,
          suggested_tax_rate_id: suggestedTaxRateId,
          lines,
        };
        break;
      }

      case 'CREATE': {
        const cn = body.creditNoteData;
        if (!cn) throw new Error('creditNoteData is required.');
        if (!cn.customer_id) throw new Error('Choose the customer being credited.');
        if (!cn.credit_note_date) throw new Error('A credit note needs a date.');
        if (!Array.isArray(cn.items) || cn.items.length === 0) throw new Error('A credit note needs at least one line.');

        ({ data, error } = await supabaseAdmin.rpc('post_credit_note_atomic', {
          p_company_id: company_id,
          p_customer_id: cn.customer_id,
          p_credit_note_date: cn.credit_note_date,
          p_reason: cn.reason ?? null,
          p_items: cn.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            account_id: item.account_id,
            tax_rate_id: item.tax_rate_id && item.tax_rate_id !== 'none' ? item.tax_rate_id : null,
            product_id: item.product_id || null,
          })),
          p_actor_user_id: user.id,
          p_credit_note_number: cn.credit_note_number ?? null,
          p_invoice_id: cn.invoice_id || null,
          p_apply_to_invoice: cn.apply_to_invoice !== false,
          p_tax_account_id: cn.tax_account_id || null,
        }));
        break;
      }

      case 'APPLY':
      case 'ALLOCATE': {
        const creditNoteId = body.creditNoteId;
        if (!creditNoteId) throw new Error('creditNoteId is required.');
        // ALLOCATE is the old single-invoice shape; it now means the same thing
        // as APPLY and goes through the same controls.
        const allocations = Array.isArray(body.allocations)
          ? body.allocations
          : body.invoiceId
            ? [{ invoice_id: body.invoiceId, amount: body.amount }]
            : null;
        if (!allocations || allocations.length === 0) {
          throw new Error('Say which invoices the credit is applied to.');
        }
        ({ data, error } = await supabaseAdmin.rpc('apply_credit_note_atomic', {
          p_company_id: company_id,
          p_credit_note_id: creditNoteId,
          p_allocations: allocations.map((a) => ({ invoice_id: a.invoice_id ?? a.invoiceId, amount: a.amount })),
          p_actor_user_id: user.id,
        }));
        break;
      }

      case 'UNAPPLY': {
        if (!body.creditNoteId) throw new Error('creditNoteId is required.');
        if (!body.invoiceId) throw new Error('invoiceId is required.');
        ({ data, error } = await supabaseAdmin.rpc('unapply_credit_note_atomic', {
          p_company_id: company_id,
          p_credit_note_id: body.creditNoteId,
          p_invoice_id: body.invoiceId,
          p_actor_user_id: user.id,
        }));
        break;
      }

      case 'VOID': {
        const creditNoteId = body.creditNoteId ?? body.id;
        if (!creditNoteId) throw new Error('creditNoteId is required.');
        ({ data, error } = await supabaseAdmin.rpc('void_credit_note_atomic', {
          p_company_id: company_id,
          p_credit_note_id: creditNoteId,
          p_reason: body.reason ?? null,
          p_actor_user_id: user.id,
        }));
        break;
      }

      case 'DELETE':
        // Deleting erased the posted journal. A posted document is corrected by
        // reversal, never by removal.
        throw new Error('A credit note cannot be deleted once issued. Void it instead: that reverses its journal and keeps the record.');

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
