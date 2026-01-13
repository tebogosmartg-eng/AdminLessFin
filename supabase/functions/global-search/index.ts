// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { query, company_id } = await req.json();

    if (!company_id) throw new Error("Company ID is required.");
    if (!query || query.trim().length < 2) return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Security Check
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

    const searchTerm = `%${query}%`;

    const [
      customers,
      vendors,
      invoices,
      bills,
      accounts,
      projects,
      products
    ] = await Promise.all([
      supabaseAdmin.from('customers').select('id, name, email').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('vendors').select('id, name, email').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('invoices').select('id, invoice_number, customers(name)').eq('company_id', company_id).ilike('invoice_number', searchTerm).limit(3),
      supabaseAdmin.from('bills').select('id, bill_number, vendors(name)').eq('company_id', company_id).ilike('bill_number', searchTerm).limit(3),
      supabaseAdmin.from('chart_of_accounts').select('id, name, account_number').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('projects').select('id, name').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('products').select('id, name').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
    ]);

    const results = [
      ...(customers.data || []).map(i => ({ type: 'Customer', id: i.id, title: i.name, subtitle: i.email, url: '/customers' })),
      ...(vendors.data || []).map(i => ({ type: 'Vendor', id: i.id, title: i.name, subtitle: i.email, url: '/vendors' })),
      ...(invoices.data || []).map(i => ({ type: 'Invoice', id: i.id, title: i.invoice_number, subtitle: i.customers?.name, url: `/invoices/${i.id}` })),
      ...(bills.data || []).map(i => ({ type: 'Bill', id: i.id, title: i.bill_number || 'Bill', subtitle: i.vendors?.name, url: '/bills' })),
      ...(accounts.data || []).map(i => ({ type: 'Account', id: i.id, title: `${i.account_number} - ${i.name}`, subtitle: 'Chart of Accounts', url: '/chart-of-accounts' })),
      ...(projects.data || []).map(i => ({ type: 'Project', id: i.id, title: i.name, subtitle: 'Project', url: `/projects/${i.id}` })),
      ...(products.data || []).map(i => ({ type: 'Product', id: i.id, title: i.name, subtitle: 'Product/Service', url: '/products' })),
    ];

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})