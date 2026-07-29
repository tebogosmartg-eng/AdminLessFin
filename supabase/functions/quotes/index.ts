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
          .select('*, customers ( name ), quote_items(quantity, unit_price)')
          .eq('company_id', company_id)
          .order('quote_date', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('quotes')
          .select('*, customers ( name, address, email ), quote_items(*, products(name))')
          .eq('id', body.quoteId)
          .eq('company_id', company_id)
          .single());
        break;

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

      case 'PUT':
        const { items: putItems, ...putQuoteData } = body.quoteData;
        const { error: putError } = await supabaseAdmin
          .from('quotes')
          .update(putQuoteData)
          .eq('id', body.quoteId)
          .eq('company_id', company_id);
        if (putError) throw putError;

        await supabaseAdmin.from('quote_items').delete().eq('quote_id', body.quoteId);
        const putItemsToInsert = putItems.map(item => ({ ...item, quote_id: body.quoteId }));
        const { error: putItemsError } = await supabaseAdmin.from('quote_items').insert(putItemsToInsert);
        if (putItemsError) throw putItemsError;
        data = { id: body.quoteId };
        break;

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
