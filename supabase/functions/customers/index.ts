// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import { computeArAgeAnalysis } from '../_shared/controlAccountAgeing.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

        // 2. Identify AR control accounts by account_role (never display name)
        const { data: arAccounts } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', company_id)
          .eq('type', 'Asset')
          .eq('account_role', 'trade_receivable');
        const arAccountIds = new Set(arAccounts?.map((a: any) => a.id) || []);

        // 3. Calculate Opening Balance (Sum of AR moves before date_from)
        let opening_balance = 0;
        if (date_from) {
            const { data: openingMoves, error: openingError } = await supabaseAdmin
                .from('journal_entry_items')
                .select('amount, type, account_id')
                .eq('journal_entries.company_id', company_id)
                .eq('journal_entries.customer_id', customerId)
                .lt('journal_entries.entry_date', date_from)
                .select(`
                    amount, type, account_id,
                    journal_entries!inner (company_id, customer_id, entry_date)
                `);
            
            if (openingError) throw openingError;

            openingMoves.forEach((item: any) => {
                // If it hits AR account: Debit = +Balance, Credit = -Balance
                if (arAccountIds.has(item.account_id)) {
                    opening_balance += item.type === 'debit' ? item.amount : -item.amount;
                } else {
                    // Fallback: assume mostly Debit normal if not specific (Sales often Credit, but we track Customer balance here)
                    // Simplified: Debits increase owing, Credits decrease owing
                    opening_balance += item.type === 'debit' ? item.amount : -item.amount;
                }
            });
        }

        // 4. Fetch Transactions in range
        let query = supabaseAdmin
          .from('journal_entries')
          .select(`
            id,
            entry_date,
            description,
            invoice_id,
            invoices ( invoice_number ),
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

        const statement = transactions.map((t: any) => {
          let amount = 0;
          let type = 'other';

          // AR specific calculation
          const arItems = t.journal_entry_items.filter((item: any) => arAccountIds.has(item.account_id));
          
          if (arItems.length > 0) {
            const debits = arItems.filter((i: any) => i.type === 'debit').reduce((sum: number, i: any) => sum + i.amount, 0);
            const credits = arItems.filter((i: any) => i.type === 'credit').reduce((sum: number, i: any) => sum + i.amount, 0);
            
            if (debits > 0) {
              amount = debits;
              type = 'invoice';
            } else {
              amount = credits;
              type = 'payment';
            }
          } else {
             // Fallback
             const debits = t.journal_entry_items.filter((i: any) => i.type === 'debit').reduce((sum: number, i: any) => sum + i.amount, 0);
             const credits = t.journal_entry_items.filter((i: any) => i.type === 'credit').reduce((sum: number, i: any) => sum + i.amount, 0);
             if (debits > credits) {
                 amount = debits;
                 type = 'invoice';
             } else {
                 amount = credits;
                 type = 'payment';
             }
          }

          return {
            id: t.id,
            date: t.entry_date,
            description: t.description,
            invoice_id: t.invoice_id,
            invoice_number: t.invoices?.invoice_number,
            type,
            amount,
          };
        });

        data = { customer, statement, opening_balance };
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
