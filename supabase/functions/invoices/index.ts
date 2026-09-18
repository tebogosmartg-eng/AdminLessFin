// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
  bootstrapTenantRequest,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('invoices', 'tenant', async (req, _ctx) => {

  try {
    // ERP Context (V10 Foundation): auth + company membership + financial
    // year/period resolved centrally instead of reimplemented per function.
    const { user, admin: supabaseAdmin, body, company_id } = await bootstrapTenantRequest(req, _ctx);
    const { method } = body;

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY edge function secret.");
    }

    // get_next_invoice_number_for_user needs auth.uid() from the caller's own
    // JWT (not the service role) even while using the service-role key for
    // elevated access — kept as its own client, unrelated to ERP Context.
    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
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
            notes,
            customers ( name ),
            journal_entries!journal_entry_id (
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
            notes,
            customers ( id, name, address, email, payment_terms ),
            journal_entries!journal_entry_id (
              id,
              journal_entry_items (
                id,
                amount,
                type,
                project_id,
                account_id, 
                chart_of_accounts ( name, account_role, tax_treatment ),
                journal_entry_item_tax_rates (
                  tax_rates ( id, rate )
                )
              )
            )
          `)
          .eq('id', body.invoiceId)
          .eq('company_id', company_id)
          .single());
        break;

      /**
       * Everything the printed invoice needs, in one round trip.
       *
       * The document draws on six different places -- the invoice, the customer,
       * the journal, company identity, the bank account to be paid into, and
       * how much of the invoice has already been settled. Fetching those from
       * the browser would be six edge calls at roughly half a second each
       * before a single page could be drawn, so they are gathered here and
       * returned as one payload.
       *
       * Every read is checked. A statement that silently omits the banking
       * details is worse than one that fails, because the customer pays
       * nothing and nobody finds out why.
       */
      case 'GET_DOCUMENT': {
        if (!body.invoiceId) throw new Error('invoiceId is required.');

        const { data: invoice, error: invoiceError } = await supabaseAdmin
          .from('invoices')
          .select(`
            id,
            invoice_number,
            invoice_date,
            due_date,
            status,
            notes,
            customers ( id, name, contact_name, address, email, phone, tax_id, payment_terms ),
            journal_entries!journal_entry_id (
              id,
              journal_number,
              description,
              journal_entry_items (
                id,
                amount,
                type,
                description,
                quantity,
                unit_price,
                account_id,
                chart_of_accounts ( id, name, account_number, type, account_role, tax_treatment ),
                journal_entry_item_tax_rates (
                  tax_rates ( id, name, rate )
                )
              )
            )
          `)
          .eq('id', body.invoiceId)
          .eq('company_id', company_id)
          .maybeSingle();
        if (invoiceError) throw invoiceError;
        if (!invoice) throw new Error('Invoice not found in this company.');

        const [companyRes, masterRes, bankRes, grossRes, allocatedRes] = await Promise.all([
          supabaseAdmin
            .from('companies')
            .select('id, name, logo_url, address, tax_id, default_invoice_notes')
            .eq('id', company_id)
            .maybeSingle(),
          supabaseAdmin
            .from('efs_company_master_data')
            .select('company_profile, addresses, tax_registrations')
            .eq('company_id', company_id)
            .maybeSingle(),
          // The company's default account is the one customers are asked to pay
          // into. A company with no default has not nominated one, and the
          // document says so rather than inventing a choice between the rest.
          supabaseAdmin
            .from('bank_accounts')
            .select('name, bank_name, account_number, branch_code, account_type, currency, status')
            .eq('company_id', company_id)
            .eq('is_default', true)
            .maybeSingle(),
          supabaseAdmin.rpc('invoice_gross_amount', { p_invoice_id: invoice.id }),
          supabaseAdmin.rpc('invoice_allocated_amount', { p_invoice_id: invoice.id }),
        ]);

        for (const [label, res] of [
          ['company', companyRes],
          ['company master data', masterRes],
          ['banking details', bankRes],
          ['invoice total', grossRes],
          ['amount received', allocatedRes],
        ] as Array<[string, { error: unknown }]>) {
          if (res.error) {
            throw new Error(
              `Could not read the ${label} for this invoice: ${(res.error as { message?: string }).message ?? res.error}`,
            );
          }
        }

        const gross = Number(grossRes.data ?? 0);
        const allocated = Number(allocatedRes.data ?? 0);

        // Allocations settle an invoice whether the money arrived or a credit
        // note took the debt away, and the document must not call a credit
        // "received". A settlement whose journal is a credit note's is a credit.
        const { data: allocationRows, error: allocationError } = await supabaseAdmin
          .from('invoice_payment_allocations')
          .select('amount, journal_entry_id')
          .eq('company_id', company_id)
          .eq('invoice_id', invoice.id);
        if (allocationError) {
          throw new Error(`Could not read how this invoice was settled: ${allocationError.message}`);
        }
        const settlingJournals = [...new Set((allocationRows ?? []).map((a) => a.journal_entry_id))];
        let creditNotes = [];
        if (settlingJournals.length > 0) {
          const { data: creditNoteRows, error: creditNoteError } = await supabaseAdmin
            .from('credit_notes')
            .select('credit_note_number, journal_entry_id')
            .eq('company_id', company_id)
            .in('journal_entry_id', settlingJournals);
          if (creditNoteError) {
            throw new Error(`Could not read the credit notes applied to this invoice: ${creditNoteError.message}`);
          }
          const numberByJournal = new Map((creditNoteRows ?? []).map((c) => [c.journal_entry_id, c.credit_note_number]));
          creditNotes = (allocationRows ?? [])
            .filter((a) => numberByJournal.has(a.journal_entry_id))
            .map((a) => ({ credit_note_number: numberByJournal.get(a.journal_entry_id), amount: Number(a.amount) }));
        }
        const credited = Math.round(creditNotes.reduce((t, c) => t + c.amount, 0) * 100) / 100;

        data = {
          invoice,
          company: companyRes.data ?? null,
          master: masterRes.data ?? null,
          // A closed or inactive account must not be printed as "pay us here".
          banking: bankRes.data && bankRes.data.status === 'active' ? bankRes.data : null,
          settlement: {
            gross,
            allocated,
            credited,
            credit_notes: creditNotes,
            outstanding: Math.round((gross - allocated) * 100) / 100,
          },
        };
        break;
      }

      case 'CREATE_WITH_TIMESHEETS':
        const { invoiceData, timesheetIds } = body;
        const { p_items, notes, ...rpcParams } = invoiceData;

        // Single-transaction posting: AR/Revenue/Tax + Inventory/COGS, balanced
        // journal, project tagging all happen inside post_sales_invoice_atomic.
        const { data: newInvoiceId, error: rpcError } = await supabaseAdmin.rpc('post_sales_invoice_atomic', {
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
            p_notes: notes || null,
            p_quote_id: null,
            p_actor_user_id: user.id,
        });

        if (rpcError) throw rpcError;

        if (newInvoiceId && timesheetIds && timesheetIds.length > 0) {
            await supabaseAdmin.from('timesheets').update({ is_billed: true, invoice_id: newInvoiceId }).in('id', timesheetIds);
        }

        data = { id: newInvoiceId };
        break;

      case 'PUT':
        if (body.invoiceData.p_items) {
           const { p_items: updateItems, notes: updateNotes, ...updateParams } = body.invoiceData;
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

           if (!error && updateNotes !== undefined) {
               await supabaseAdmin.from('invoices').update({ notes: updateNotes }).eq('id', body.invoiceId);
           }
           
           if (!error) {
               // Post-process projects similar to CREATE
                const { data: invoice } = await supabaseAdmin.from('invoices').select('journal_entry_id').eq('id', body.invoiceId).single();
                if (invoice && invoice.journal_entry_id) {
                    const { data: createdItems } = await supabaseAdmin
                        .from('journal_entry_items')
                        .select('id, account_id, amount')
                        .eq('journal_entry_id', invoice.journal_entry_id)
                        .eq('type', 'credit');
                    
                    const updatedItemIds = new Set();
                    for (const inputItem of updateItems) {
                        if (inputItem.project_id) {
                            const targetAmount = inputItem.quantity * inputItem.unit_price;
                            const match = createdItems?.find(ci => 
                                ci.account_id === inputItem.income_account_id && 
                                Math.abs(ci.amount - targetAmount) < 0.01 &&
                                !updatedItemIds.has(ci.id)
                            );
                            if (match) {
                                await supabaseAdmin.from('journal_entry_items').update({ project_id: inputItem.project_id }).eq('id', match.id);
                                updatedItemIds.add(match.id);
                            }
                        }
                    }
                }
           }
           
           data = { id: body.invoiceId };
        } else {
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

      case 'GET_NEXT_INVOICE_NUMBER': {
        // Asked of the company this request is FOR. The old call took no
        // company and the routine resolved one from the user's active company,
        // so asking about one company could be answered about another.
        const rpcResult = await supabaseAdmin.rpc('invoice_next_number', { p_company_id: company_id });

        // Whatever the routine says, the number must actually be free. The
        // previous routine returned INV-00001 for any company whose newest
        // invoice was not an INV-#####, and the fallback below never ran
        // because that is a wrong ANSWER, not an error -- so the form offered a
        // number that already existed and saving failed on a duplicate key.
        let candidate = typeof rpcResult.data === 'string' ? rpcResult.data : null;
        if (candidate) {
          const { data: clash, error: clashErr } = await supabaseAdmin
            .from('invoices')
            .select('id')
            .eq('company_id', company_id)
            .eq('invoice_number', candidate)
            .maybeSingle();
          if (clashErr) throw clashErr;
          if (clash) candidate = null;
        }
        if (candidate) {
          data = candidate;
          break;
        }

        // Fall back to working it out here, BigInt-safe, over the same bounded
        // digit run the routine uses.
        const { data: existingNums, error: listErr } = await supabaseAdmin
          .from('invoices')
          .select('invoice_number')
          .eq('company_id', company_id);
        if (listErr) throw rpcResult.error ?? listErr;
        let maxSeq = 0n;
        for (const row of existingNums ?? []) {
          const match = /^INV-(\d{1,9})$/.exec(String(row.invoice_number ?? ''));
          if (!match) continue;
          try {
            const n = BigInt(match[1]);
            if (n > maxSeq) maxSeq = n;
          } catch { /* ignore unparseable */ }
        }
        data = `INV-${(maxSeq + 1n).toString().padStart(5, '0')}`;
        error = null;
        break;
      }

      /**
       * Raise an invoice from an accepted quotation.
       *
       * The whole of it now happens inside convert_quote_to_invoice_atomic,
       * which locks the quote first. Building the lines here and posting them
       * in a second call left a gap wide enough to drive two full invoices
       * through from one quote -- and nothing checked the percentage, the
       * quote's status, or what had already been invoiced against it. Probed
       * against production, one quote was invoiced four times over, once at
       * 500%, and once after being declined.
       */
      case 'CREATE_FROM_QUOTE': {
        const { quoteId, invoiceData: quoteInvoiceData, percentage } = body;
        if (!quoteId) throw new Error('quoteId is required.');
        const quoteInvoice = quoteInvoiceData ?? {};
        if (!quoteInvoice.invoice_number) {
          throw new Error('An invoice number is required. Ask for the next one first.');
        }

        ({ data, error } = await supabaseAdmin.rpc('convert_quote_to_invoice_atomic', {
          p_company_id: company_id,
          p_quote_id: quoteId,
          p_percentage: percentage,
          p_invoice_date: quoteInvoice.invoice_date ?? null,
          p_due_date: quoteInvoice.due_date ?? null,
          p_invoice_number: quoteInvoice.invoice_number,
          p_ar_account_id: quoteInvoice.accounts_receivable_id ?? null,
          p_actor_user_id: user.id,
          p_inventory_asset_account_id: quoteInvoice.inventory_asset_account_id || null,
          p_tax_payable_account_id: quoteInvoice.tax_payable_account_id || null,
          p_description: quoteInvoice.description || null,
          p_notes: quoteInvoice.notes || null,
        }));
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
