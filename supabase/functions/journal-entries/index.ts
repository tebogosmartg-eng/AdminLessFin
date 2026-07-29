import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

type JournalEntryMethod = 'GET' | 'GET_RELATED_TO_INVOICE' | 'POST' | 'PUT' | 'DELETE';

type JournalEntryFilters = {
  id?: string;
  account_id?: string;
  date_from?: string;
  date_to?: string;
  vendor_id?: string;
  customer_id?: string;
};

type JournalEntryItemInput = {
  account_id: string;
  type: 'debit' | 'credit';
  amount: number;
  project_id?: string | null;
};

type JournalEntryInput = {
  entry_date: string;
  description?: string | null;
  vendor_id?: string | null;
  customer_id?: string | null;
  attachment_url?: string | null;
  items: JournalEntryItemInput[];
};

type JournalEntryRequestBody = {
  method: JournalEntryMethod;
  company_id: string;
  select?: string;
  filters?: JournalEntryFilters;
  entryId?: string;
  invoiceId?: string;
  entryData?: JournalEntryInput;
};

type JournalEntryItemRow = {
  journal_entry_id: string;
};

function isJournalEntryRequestBody(value: unknown): value is JournalEntryRequestBody {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.method === 'string' &&
    typeof body.company_id === 'string'
  );
}

serve(withEnterprisePlatform('journal-entries', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const rawBody: unknown = await req.json();
    if (!isJournalEntryRequestBody(rawBody)) {
      throw new Error("Invalid request payload.");
    }
    const body = rawBody;
    const { method, company_id } = body;

    if (!company_id) {
      throw new Error("Company ID is required.");
    }
    _ctx.companyId = company_id;

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

    let data: unknown = null;
    let error: Error | null = null;

    switch (method) {
      case 'GET': {
        let entryIdsFromAccountFilter = null;
        if (body.filters?.account_id && body.filters.account_id !== 'all') {
          const { data: items, error: itemsError } = await supabaseAdmin
            .from('journal_entry_items')
            .select('journal_entry_id')
            .eq('account_id', body.filters.account_id);
          if (itemsError) throw itemsError;
          entryIdsFromAccountFilter = ((items ?? []) as JournalEntryItemRow[]).map(item => item.journal_entry_id);
          if (entryIdsFromAccountFilter.length === 0) {
             return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
          }
        }

        let query = supabaseAdmin
          .from('journal_entries')
          .select(body.select || '*')
          .eq('company_id', company_id)
          .order('entry_date', { ascending: false });

        if (entryIdsFromAccountFilter) {
          query = query.in('id', entryIdsFromAccountFilter);
        }
        if (body.filters?.date_from) {
          query = query.gte('entry_date', body.filters.date_from);
        }
        if (body.filters?.date_to) {
          query = query.lte('entry_date', body.filters.date_to);
        }
        if (body.filters?.vendor_id && body.filters.vendor_id !== 'all') {
          query = query.eq('vendor_id', body.filters.vendor_id);
        }
        if (body.filters?.customer_id && body.filters.customer_id !== 'all') {
          query = query.eq('customer_id', body.filters.customer_id);
        }
        if (body.filters?.id) {
          const { data: entry, error: entryError } = await supabaseAdmin
            .from('journal_entries')
            .select(body.select || '*')
            .eq('company_id', company_id)
            .eq('id', body.filters.id)
            .maybeSingle();

          if (entryError) throw entryError;
          data = entry;
          break;
        }

        ({ data, error } = await query);
        break;
      }
      
      case 'GET_RELATED_TO_INVOICE': {
        ({ data, error } = await supabaseAdmin
          .from('journal_entries')
          .select('id, entry_date, description')
          .eq('company_id', company_id)
          .eq('invoice_id', body.invoiceId)
          .order('entry_date', { ascending: true }));
        break;
      }

      case 'POST': {
        if (!body.entryData) throw new Error("Entry data is required.");
        const { items: postItems, entry_date, description, vendor_id, customer_id, attachment_url } = body.entryData;

        // Single gateway into the GL (ERP V2.0 Phase 2 Posting Engine) — no
        // more direct journal_entries/journal_entry_items inserts here.
        const { data: postingResult, error: postError } = await supabaseAdmin.rpc('posting_engine_submit', {
          p_request: {
            company_id,
            posting_date: entry_date,
            module: 'manual_journal',
            document_type: 'manual_journal',
            description: description || null,
            vendor_id: vendor_id || null,
            customer_id: customer_id || null,
            attachment_url: attachment_url || null,
            created_by: user.id,
            lines: postItems.map((item: JournalEntryItemInput) => ({
              account_id: item.account_id,
              debit: item.type === 'debit' ? item.amount : 0,
              credit: item.type === 'credit' ? item.amount : 0,
              project_id: item.project_id || null,
            })),
          },
          p_mode: 'commit',
        });
        if (postError) throw postError;
        data = { id: postingResult.journal_id };
        break;
      }

      case 'PUT': {
        if (!body.entryData) throw new Error("Entry data is required.");
        if (!body.entryId) throw new Error("Entry ID is required.");
        const { items: putItems, ...putEntryData } = body.entryData;
        
        // Update Header
        const { error: headerError } = await supabaseAdmin
          .from('journal_entries')
          .update({
            entry_date: putEntryData.entry_date,
            description: putEntryData.description || null,
            vendor_id: putEntryData.vendor_id || null,
            customer_id: putEntryData.customer_id || null,
            attachment_url: putEntryData.attachment_url || null,
          })
          .eq('id', body.entryId)
          .eq('company_id', company_id);
        
        if (headerError) throw headerError;

        // Replace Items (Delete & Insert)
        await supabaseAdmin.from('journal_entry_items').delete().eq('journal_entry_id', body.entryId);
        
        const putItemsToInsert = putItems.map(item => ({ 
          ...item, 
          journal_entry_id: body.entryId,
          project_id: item.project_id || null
        }));
        
        const { error: putItemsError } = await supabaseAdmin.from('journal_entry_items').insert(putItemsToInsert);
        if (putItemsError) throw putItemsError;
        
        data = { id: body.entryId };
        break;
      }

      case 'DELETE': {
        if (!body.entryId) throw new Error("Entry ID is required.");
        ({ data, error } = await supabaseAdmin
          .from('journal_entries')
          .delete()
          .eq('id', body.entryId)
          .eq('company_id', company_id));
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

  } catch (error: unknown) {
    return edgeFailure(_ctx, error);
  }
}))
