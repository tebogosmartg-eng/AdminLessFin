// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import { computeArAgeAnalysis } from '../_shared/controlAccountAgeing.ts'
import { computeControlAccountLedger } from '../_shared/controlAccountLedger.ts'
import {
  buildStatementRows,
  closingBalance,
  fetchControlAccountIds,
  fetchOpeningBalance,
} from '../_shared/partyStatement.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

const DATE_ONLY_LEDGER = /^\d{4}-\d{2}-\d{2}$/;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * journal_entries has TWO relationships to invoices: the journal's own
 * invoice_id, and the invoice's journal_entry_id. An embed must name the one
 * it means or PostgREST refuses the whole query. Statement rows quote the
 * invoice the journal is FOR, which is the forward invoice_id -- the same
 * column the row already returns, so the reference and the number agree.
 */
function invoiceNumberFromRelation(invoices: { invoice_number?: string } | { invoice_number?: string }[] | null | undefined) {
  if (!invoices) return undefined;
  return Array.isArray(invoices) ? invoices[0]?.invoice_number : invoices.invoice_number;
}

serve(withEnterprisePlatform('customers', 'tenant', async (req, _ctx) => {

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

    let data, error;

    switch (method) {
      /**
       * Debtors age analysis for EVERY customer, as at a date, with the
       * reconciliation to the control account that makes it auditable.
       * Shares one implementation with the creditors analysis, so the two
       * sides of the ledger cannot age by different rules.
       */
      /**
       * The control account as a general ledger, tied to the age analysis.
       * Optional date_from gives an opening balance and a period movement;
       * without it the ledger runs from inception.
       */
      case 'GET_CONTROL_LEDGER': {
        const asOf = body.as_of || new Date().toISOString().slice(0, 10);
        if (!DATE_ONLY_LEDGER.test(asOf)) {
          throw new Error('as_of must be a date in YYYY-MM-DD format.');
        }
        if (body.date_from && !DATE_ONLY_LEDGER.test(body.date_from)) {
          throw new Error('date_from must be a date in YYYY-MM-DD format.');
        }
        data = await computeControlAccountLedger(supabaseAdmin, company_id, asOf, 'receivable', body.date_from ?? null);
        break;
      }

      case 'GET_AGE_ANALYSIS': {
        const asOf = body.as_of || new Date().toISOString().slice(0, 10);
        if (!DATE_ONLY.test(asOf)) {
          throw new Error('as_of must be a date in YYYY-MM-DD format.');
        }
        data = await computeArAgeAnalysis(supabaseAdmin, company_id, asOf);
        break;
      }

      case 'GET':
        ({ data, error } = await supabaseAdmin
          .from('customers')
          .select('*')
          .eq('company_id', company_id)
          .order('name', { ascending: true }));
        break;
      
      case 'GET_DETAILS':
        const { customerId, date_from, date_to } = body;
        
        // 1. Fetch Customer Profile
        const { data: customer, error: custError } = await supabaseAdmin
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .eq('company_id', company_id)
          .single();
        if (custError) throw custError;

        // 2-5. The statement itself. Worked out in _shared/partyStatement.ts,
        //      which the vendors function and the statement email also use, so
        //      the screen, the PDF and the email cannot disagree. Every figure
        //      comes from control-account movements only: summing every line of
        //      the customer's journals -- what all three copies used to do --
        //      nets to zero by construction and opened every statement at 0.00.
        const arAccountIds = await fetchControlAccountIds(supabaseAdmin, company_id, 'receivable');
        const { opening_balance, opening_balance_known } = await fetchOpeningBalance(supabaseAdmin, {
          companyId: company_id,
          side: 'receivable',
          partyId: customerId,
          dateFrom: date_from,
          controlIds: arAccountIds,
        });

        let query = supabaseAdmin
          .from('journal_entries')
          .select(`
            id,
            entry_date,
            description,
            invoice_id,
            invoices!invoice_id ( invoice_number ),
            journal_entry_items (
              amount,
              type,
              account_id
            )
          `)
          .eq('company_id', company_id)
          .eq('customer_id', customerId)
          .order('entry_date', { ascending: true });

        if (date_from) query = query.gte('entry_date', date_from);
        if (date_to) query = query.lte('entry_date', date_to);

        const { data: transactions, error: transError } = await query;
        if (transError) throw transError;

        const statement = buildStatementRows(transactions, arAccountIds, 'receivable', (t: any) => ({
          invoice_id: t.invoice_id,
          invoice_number: invoiceNumberFromRelation(t.invoices),
        }));
        const closing_balance = closingBalance(opening_balance, statement);

        // The statement is a document that leaves the company, so it needs the
        // same letterhead, identity and banking details the invoice does.
        // Gathered here rather than by the browser: three more edge calls at
        // roughly half a second each would be paid before a statement could be
        // drawn, and this method is already the one round trip for the page.
        const [stmtCompanyRes, stmtMasterRes, stmtBankRes] = await Promise.all([
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
          supabaseAdmin
            .from('bank_accounts')
            .select('name, bank_name, account_number, branch_code, account_type, currency, status')
            .eq('company_id', company_id)
            .eq('is_default', true)
            .maybeSingle(),
        ]);
        for (const [label, res] of [
          ['company', stmtCompanyRes],
          ['company master data', stmtMasterRes],
          ['banking details', stmtBankRes],
        ] as Array<[string, { error: unknown }]>) {
          if (res.error) {
            throw new Error(
              `Could not read the ${label} for this statement: ${(res.error as { message?: string }).message ?? res.error}`,
            );
          }
        }

        data = {
          customer,
          statement,
          opening_balance,
          opening_balance_known,
          closing_balance,
          company: stmtCompanyRes.data ?? null,
          master: stmtMasterRes.data ?? null,
          // A closed or inactive account must not be printed as "pay us here".
          banking: stmtBankRes.data && stmtBankRes.data.status === 'active' ? stmtBankRes.data : null,
        };
        break;

      case 'POST':
        ({ data, error } = await supabaseAdmin
          .from('customers')
          .insert({ ...body.customerData, company_id })
          .select()
          .single());
        break;

      case 'PUT':
        ({ data, error } = await supabaseAdmin
          .from('customers')
          .update(body.customerData)
          .eq('id', body.customerId)
          .eq('company_id', company_id)
          .select()
          .single());
        break;

      case 'DELETE':
        ({ data, error } = await supabaseAdmin
          .from('customers')
          .delete()
          .eq('id', body.customerId)
          .eq('company_id', company_id));
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
