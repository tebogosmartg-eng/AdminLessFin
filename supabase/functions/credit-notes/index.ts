// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('credit-notes', 'tenant', async (req, _ctx) => {

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
          .from('credit_notes')
          .select('*, customers(name)')
          .eq('company_id', company_id)
          .order('credit_note_date', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('credit_notes')
          .select('*, customers(name, email, address), credit_note_items(*)')
          .eq('id', body.id)
          .eq('company_id', company_id)
          .single());
        break;

      case 'GET_NEXT_NUMBER':
        const { data: lastCN } = await supabaseAdmin
          .from('credit_notes')
          .select('credit_note_number')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        let nextNum = 1;
        if (lastCN && lastCN.credit_note_number) {
            const matches = lastCN.credit_note_number.match(/CN-(\d+)/);
            if (matches && matches[1]) nextNum = parseInt(matches[1]) + 1;
        }
        data = `CN-${String(nextNum).padStart(5, '0')}`;
        break;

      case 'CREATE':
        const { creditNoteData } = body;
        ({ data, error } = await supabaseAdmin.rpc('create_credit_note', {
          p_company_id: company_id,
          p_customer_id: creditNoteData.customer_id,
          p_credit_note_number: creditNoteData.credit_note_number,
          p_date: creditNoteData.credit_note_date,
          p_ar_account_id: creditNoteData.ar_account_id,
          p_tax_account_id: creditNoteData.tax_account_id,
          p_reason: creditNoteData.reason,
          p_items: creditNoteData.items
        }));
        break;

      case 'DELETE':
        // Delete JE first (reverse effect) then CN
        // First get JE ID
        const { data: cn } = await supabaseAdmin.from('credit_notes').select('journal_entry_id').eq('id', body.id).single();
        
        if (cn?.journal_entry_id) {
            await supabaseAdmin.from('journal_entry_items').delete().eq('journal_entry_id', cn.journal_entry_id);
            await supabaseAdmin.from('journal_entries').delete().eq('id', cn.journal_entry_id);
        }
        
        ({ data, error } = await supabaseAdmin
          .from('credit_notes')
          .delete()
          .eq('id', body.id)
          .eq('company_id', company_id));
        break;
        
      case 'ALLOCATE':
        const { creditNoteId, invoiceId, amount, arAccountId } = body;
        ({ data, error } = await supabaseAdmin.rpc('allocate_credit_note', {
            p_company_id: company_id,
            p_credit_note_id: creditNoteId,
            p_invoice_id: invoiceId,
            p_amount: amount,
            p_ar_account_id: arAccountId
        }));
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
