// @ts-nocheck
/**
 * Supplier credits.
 *
 * Every write goes through a database function that posts through the posting
 * engine or writes bill_payment_allocations, and every one of those functions
 * is service_role only. This function is where the caller is authorised:
 * bootstrapTenantRequest checks the user belongs to the company, and the
 * database functions check it again against the actor they are given.
 *
 * A supplier credit is never deleted. It is voided, which reverses its journal
 * and withdraws whatever it settled.
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

serve(withEnterprisePlatform('vendor-credits', 'tenant', async (req, _ctx) => {
  try {
    const { user, admin: supabaseAdmin, body, company_id } = await bootstrapTenantRequest(req, _ctx);
    const { method } = body;

    let data, error;

    switch (method) {
      case 'GET_ALL': {
        const [listRes, settlementRes] = await Promise.all([
          supabaseAdmin
            .from('vendor_credits')
            .select(`
              id,
              credit_number,
              credit_date,
              status,
              reason,
              vendor_id,
              bill_id,
              created_at,
              vendors ( name ),
              bills!bill_id ( bill_number )
            `)
            .eq('company_id', company_id)
            .order('credit_date', { ascending: false })
            .order('credit_number', { ascending: false }),
          supabaseAdmin.rpc('vendor_credit_settlements', { p_company_id: company_id }),
        ]);
        mustRead('supplier credits', listRes);
        mustRead('supplier credit balances', settlementRes);

        const byId = new Map((settlementRes.data ?? []).map((s) => [s.vendor_credit_id, s]));
        data = (listRes.data ?? []).map((vc) => {
          const s = byId.get(vc.id);
          const total = Number(s?.total ?? 0);
          const applied = Number(s?.applied ?? 0);
          return {
            ...vc,
            total,
            applied,
            // A void credit has nothing left to give, whatever its journal once
            // said.
            remaining: vc.status === 'void' ? 0 : Number(s?.remaining ?? 0),
          };
        });
        break;
      }

      /**
       * Everything the supplier credit document needs, in one round trip: the
       * credit, its lines, the bill it credits, what it settled, and the
       * letterhead.
       */
      case 'GET_DOCUMENT':
      case 'GET_ONE': {
        const vendorCreditId = body.vendorCreditId ?? body.id;
        if (!vendorCreditId) throw new Error('vendorCreditId is required.');

        const vcRes = await supabaseAdmin
          .from('vendor_credits')
          .select(`
            id,
            credit_number,
            credit_date,
            status,
            reason,
            vendor_id,
            bill_id,
            journal_entry_id,
            created_at,
            voided_at,
            void_reason,
            vendors ( id, name, contact_name, address, email, phone, tax_id ),
            bills!bill_id ( id, bill_number, bill_date ),
            journal_entries!journal_entry_id ( id, journal_number, entry_date ),
            vendor_credit_items (
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
          .eq('id', vendorCreditId)
          .eq('company_id', company_id)
          .order('position', { foreignTable: 'vendor_credit_items', ascending: true })
          .maybeSingle();
        mustRead('supplier credit', vcRes);
        const vendorCredit = vcRes.data;
        if (!vendorCredit) throw new Error('Supplier credit not found in this company.');

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
          supabaseAdmin.rpc('vendor_credit_total', { p_vendor_credit_id: vendorCredit.id }),
          supabaseAdmin.rpc('vendor_credit_applied_amount', { p_vendor_credit_id: vendorCredit.id }),
          vendorCredit.journal_entry_id
            ? supabaseAdmin
                .from('bill_payment_allocations')
                .select('amount, created_at, bills ( id, bill_number, bill_date, status )')
                .eq('company_id', company_id)
                .eq('journal_entry_id', vendorCredit.journal_entry_id)
                .order('created_at', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          supabaseAdmin
            .from('posting_requests')
            .select('journal_number, committed_at')
            .eq('company_id', company_id)
            .eq('document_type', 'vendor_credit')
            .eq('document_id', vendorCredit.id)
            .not('reversal_of_id', 'is', null)
            .maybeSingle(),
        ]);
        mustRead('company', companyRes);
        mustRead('company master data', masterRes);
        mustRead('supplier credit total', totalRes);
        mustRead('amount applied', appliedRes);
        mustRead('bills this credit settled', allocationsRes);
        mustRead('reversal of this credit', reversalRes);

        const total = round2(Number(totalRes.data ?? 0));
        const applied = round2(Number(appliedRes.data ?? 0));

        data = {
          vendor_credit: vendorCredit,
          company: companyRes.data ?? null,
          master: masterRes.data ?? null,
          settlement: {
            total,
            applied,
            remaining: vendorCredit.status === 'void' ? 0 : round2(total - applied),
          },
          allocations: allocationsRes.data ?? [],
          reversal: reversalRes.data ?? null,
        };
        break;
      }

      case 'GET_NEXT_NUMBER': {
        ({ data, error } = await supabaseAdmin.rpc('vendor_credit_next_number', { p_company_id: company_id }));
        break;
      }

      /**
       * The supplier's bills that can still be credited, with how much. A bill
       * that has been paid can still be credited -- the credit then sits on the
       * supplier's account against the next bill.
       */
      case 'GET_CREDITABLE_BILLS': {
        if (!body.vendorId) throw new Error('vendorId is required.');
        const billRes = await supabaseAdmin
          .from('bills')
          .select('id, bill_number, bill_date, due_date, status')
          .eq('company_id', company_id)
          .eq('vendor_id', body.vendorId)
          .not('status', 'in', '("void","draft","cancelled")')
          .order('bill_date', { ascending: false })
          .order('bill_number', { ascending: false });
        mustRead('bills', billRes);

        const figures = await Promise.all((billRes.data ?? []).map(async (bill) => {
          const [grossRes, creditedRes, outstandingRes] = await Promise.all([
            supabaseAdmin.rpc('bill_gross_amount', { p_bill_id: bill.id }),
            supabaseAdmin.rpc('bill_credited_amount', { p_bill_id: bill.id }),
            supabaseAdmin.rpc('bill_outstanding_amount', { p_bill_id: bill.id }),
          ]);
          mustRead(`value of bill ${bill.bill_number}`, grossRes);
          mustRead(`credits against bill ${bill.bill_number}`, creditedRes);
          mustRead(`balance of bill ${bill.bill_number}`, outstandingRes);
          const gross = round2(Number(grossRes.data ?? 0));
          const credited = round2(Number(creditedRes.data ?? 0));
          return {
            ...bill,
            gross,
            credited,
            creditable: round2(gross - credited),
            outstanding: round2(Number(outstandingRes.data ?? 0)),
          };
        }));
        data = figures.filter((bill) => bill.creditable > 0);
        break;
      }

      /** The supplier's bills with something still owing, for the apply dialog. */
      case 'GET_OPEN_BILLS': {
        if (!body.vendorId) throw new Error('vendorId is required.');
        const billRes = await supabaseAdmin
          .from('bills')
          .select('id, bill_number, bill_date, due_date, status')
          .eq('company_id', company_id)
          .eq('vendor_id', body.vendorId)
          .not('status', 'in', '("void","draft","cancelled","paid")')
          // The same order a clerk settles in, bill_number included, so the
          // screen's oldest-first preview is what actually happens.
          .order('bill_date', { ascending: true })
          .order('bill_number', { ascending: true });
        mustRead('open bills', billRes);

        const rows = [];
        for (const bill of billRes.data ?? []) {
          const [grossRes, allocatedRes] = await Promise.all([
            supabaseAdmin.rpc('bill_gross_amount', { p_bill_id: bill.id }),
            supabaseAdmin.rpc('bill_allocated_amount', { p_bill_id: bill.id }),
          ]);
          mustRead(`value of bill ${bill.bill_number}`, grossRes);
          mustRead(`settlements against bill ${bill.bill_number}`, allocatedRes);
          const gross = round2(Number(grossRes.data ?? 0));
          const allocated = round2(Number(allocatedRes.data ?? 0));
          const outstanding = round2(gross - allocated);
          if (outstanding <= 0) continue;
          rows.push({ ...bill, gross, allocated, outstanding });
        }
        data = rows;
        break;
      }

      /**
       * A bill's lines, shaped as supplier credit lines, so crediting a bill
       * starts from what was actually billed rather than a blank form.
       *
       * The VAT rate is suggested only when it can be proved: the bill's tax
       * lines all carry the same rate, and applying that rate to every line,
       * rounded per line as the bill was, reproduces the bill's VAT to the
       * cent. Otherwise no rate is guessed and the clerk chooses.
       */
      case 'GET_BILL_FOR_CREDIT': {
        if (!body.billId) throw new Error('billId is required.');
        const billRes = await supabaseAdmin
          .from('bills')
          .select(`
            id,
            bill_number,
            bill_date,
            status,
            vendor_id,
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
          .eq('id', body.billId)
          .eq('company_id', company_id)
          .maybeSingle();
        mustRead('bill', billRes);
        const bill = billRes.data;
        if (!bill) throw new Error('Bill not found in this company.');

        const [grossRes, creditedRes, outstandingRes] = await Promise.all([
          supabaseAdmin.rpc('bill_gross_amount', { p_bill_id: bill.id }),
          supabaseAdmin.rpc('bill_credited_amount', { p_bill_id: bill.id }),
          supabaseAdmin.rpc('bill_outstanding_amount', { p_bill_id: bill.id }),
        ]);
        mustRead('bill total', grossRes);
        mustRead('credits against the bill', creditedRes);
        mustRead('bill balance', outstandingRes);

        const journal = Array.isArray(bill.journal_entries) ? bill.journal_entries[0] : bill.journal_entries;
        const items = journal?.journal_entry_items ?? [];
        const accountOf = (i) => (Array.isArray(i.chart_of_accounts) ? i.chart_of_accounts[0] : i.chart_of_accounts);
        const isVat = (a) =>
          !!a && (['output_vat', 'vat_control', 'input_vat'].includes(a.account_role) ||
            ['vat_output', 'vat_control', 'vat_input'].includes(a.tax_treatment));

        // A bill DEBITS what it bought: an expense, or the asset it acquired.
        const cost = items.filter((i) => {
          const a = accountOf(i);
          return i.type === 'debit' && !!a && ['Expense', 'Asset'].includes(a.type) && !isVat(a) &&
            !['trade_payable', 'trade_receivable', 'bank'].includes(a.account_role);
        });
        const vatLines = items.filter((i) => i.type === 'debit' && isVat(accountOf(i)));

        const lines = cost.map((i) => {
          const amount = Number(i.amount) || 0;
          const quantity = i.quantity == null ? 1 : Number(i.quantity);
          const unitPrice = i.unit_price == null ? amount : Number(i.unit_price);
          return {
            description: (i.description ?? '').trim() || accountOf(i)?.name || 'Goods and services received',
            quantity,
            unit_price: unitPrice,
            account_id: i.account_id,
            amount: round2(amount),
          };
        });

        const vatTotal = round2(vatLines.reduce((t, i) => t + (Number(i.amount) || 0), 0));

        // Where the rate is recorded differs by document. record_bill_with_taxes
        // links the tax rate to the COST line it was charged on, while a sales
        // invoice links it to the VAT line. Reading only the VAT lines, as the
        // credit-notes function does, finds nothing on a bill and silently
        // suggests no rate -- so the clerk crediting a VAT-inclusive bill in
        // full would have reversed the goods and left the VAT behind.
        const rateOf = (i) => i.journal_entry_item_tax_rates?.[0];
        const carrier = cost.some((i) => rateOf(i)?.tax_rate_id) ? cost : vatLines;
        const rateIds = new Set(carrier.map((i) => rateOf(i)?.tax_rate_id).filter(Boolean));

        let suggestedTaxRateId = null;
        if (vatTotal > 0 && rateIds.size === 1 && carrier.every((i) => rateOf(i)?.tax_rate_id)) {
          const rate = Number(rateOf(carrier[0])?.tax_rates?.rate ?? NaN);
          if (Number.isFinite(rate)) {
            // Only suggested when applying it to every line, rounded per line as
            // the bill was, reproduces the bill's VAT to the cent.
            const reproduced = round2(lines.reduce((t, l) => t + round2((l.amount * rate) / 100), 0));
            if (Math.abs(reproduced - vatTotal) < 0.005) suggestedTaxRateId = [...rateIds][0];
          }
        }

        const gross = round2(Number(grossRes.data ?? 0));
        const credited = round2(Number(creditedRes.data ?? 0));
        data = {
          bill: {
            id: bill.id,
            bill_number: bill.bill_number,
            bill_date: bill.bill_date,
            status: bill.status,
            vendor_id: bill.vendor_id,
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
        const vc = body.creditData ?? body.vendorCreditData;
        if (!vc) throw new Error('creditData is required.');
        if (!vc.vendor_id) throw new Error('Choose the supplier being credited.');
        if (!vc.credit_date) throw new Error('A supplier credit needs a date.');
        if (!Array.isArray(vc.items) || vc.items.length === 0) {
          throw new Error('A supplier credit needs at least one line.');
        }

        ({ data, error } = await supabaseAdmin.rpc('post_vendor_credit_atomic', {
          p_company_id: company_id,
          p_vendor_id: vc.vendor_id,
          p_credit_date: vc.credit_date,
          p_reason: vc.reason ?? null,
          p_items: vc.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            account_id: item.account_id,
            tax_rate_id: item.tax_rate_id && item.tax_rate_id !== 'none' ? item.tax_rate_id : null,
            product_id: item.product_id || null,
          })),
          p_actor_user_id: user.id,
          p_credit_number: vc.credit_number ?? null,
          p_bill_id: vc.bill_id || null,
          p_apply_to_bill: vc.apply_to_bill !== false,
          p_tax_account_id: vc.tax_account_id || null,
        }));
        break;
      }

      case 'APPLY':
      case 'ALLOCATE': {
        const vendorCreditId = body.vendorCreditId;
        if (!vendorCreditId) throw new Error('vendorCreditId is required.');
        // ALLOCATE is the old single-bill shape; it now means the same thing as
        // APPLY and goes through the same controls.
        const allocations = Array.isArray(body.allocations)
          ? body.allocations
          : body.billId
            ? [{ bill_id: body.billId, amount: body.amount }]
            : null;
        if (!allocations || allocations.length === 0) {
          throw new Error('Say which bills the credit is applied to.');
        }
        ({ data, error } = await supabaseAdmin.rpc('apply_vendor_credit_atomic', {
          p_company_id: company_id,
          p_vendor_credit_id: vendorCreditId,
          p_allocations: allocations.map((a) => ({ bill_id: a.bill_id ?? a.billId, amount: a.amount })),
          p_actor_user_id: user.id,
        }));
        break;
      }

      case 'UNAPPLY': {
        if (!body.vendorCreditId) throw new Error('vendorCreditId is required.');
        if (!body.billId) throw new Error('billId is required.');
        ({ data, error } = await supabaseAdmin.rpc('unapply_vendor_credit_atomic', {
          p_company_id: company_id,
          p_vendor_credit_id: body.vendorCreditId,
          p_bill_id: body.billId,
          p_actor_user_id: user.id,
        }));
        break;
      }

      case 'VOID': {
        const vendorCreditId = body.vendorCreditId ?? body.id;
        if (!vendorCreditId) throw new Error('vendorCreditId is required.');
        ({ data, error } = await supabaseAdmin.rpc('void_vendor_credit_atomic', {
          p_company_id: company_id,
          p_vendor_credit_id: vendorCreditId,
          p_reason: body.reason ?? null,
          p_actor_user_id: user.id,
        }));
        break;
      }

      case 'DELETE':
        // Deleting erased the posted journal, and looked it up without the
        // company. A posted document is corrected by reversal, never removal.
        throw new Error('A supplier credit cannot be deleted once issued. Void it instead: that reverses its journal and keeps the record.');

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
