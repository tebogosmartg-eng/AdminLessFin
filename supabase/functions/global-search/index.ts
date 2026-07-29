// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

/** PostgREST .or() values with % wildcards must be double-quoted. */
function quotePostgrestFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

serve(withEnterprisePlatform('global-search', 'tenant', async (req, _ctx) => {

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
    const trimmed = (query ?? '').trim();
    const looksLikeEmpNumber = /^emp/i.test(trimmed) || /^[a-z0-9]+-\d/i.test(trimmed);
    if (!trimmed || (trimmed.length < 2 && !looksLikeEmpNumber)) {
      return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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

    const searchTerm = `%${trimmed}%`;
    const exactTerm = trimmed;
    const quotedSearch = quotePostgrestFilterValue(searchTerm);

    const [
      customers,
      vendors,
      invoices,
      quotes,
      bills,
      accounts,
      projects,
      products,
      purchaseOrders,
      recurringBills,
      creditNotes,
      vendorCredits,
      employees,
    ] = await Promise.all([
      supabaseAdmin.from('customers').select('id, name, email').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('vendors').select('id, name, email').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('invoices').select('id, invoice_number, customers(name)').eq('company_id', company_id).ilike('invoice_number', searchTerm).limit(3),
      supabaseAdmin.from('quotes').select('id, quote_number, customers(name)').eq('company_id', company_id).ilike('quote_number', searchTerm).limit(3),
      supabaseAdmin.from('bills').select('id, bill_number, vendors(name)').eq('company_id', company_id).ilike('bill_number', searchTerm).limit(3),
      supabaseAdmin.from('chart_of_accounts').select('id, name, account_number').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('projects').select('id, name').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('products').select('id, name').eq('company_id', company_id).ilike('name', searchTerm).limit(3),
      supabaseAdmin.from('purchase_orders').select('id, po_number, vendors(name)').eq('company_id', company_id).ilike('po_number', searchTerm).limit(3),
      supabaseAdmin.from('recurring_bills').select('id, profile_name, vendors(name)').eq('company_id', company_id).ilike('profile_name', searchTerm).limit(3),
      supabaseAdmin.from('credit_notes').select('id, credit_note_number, customers(name)').eq('company_id', company_id).ilike('credit_note_number', searchTerm).limit(3),
      supabaseAdmin.from('vendor_credits').select('id, credit_number, vendors(name)').eq('company_id', company_id).ilike('credit_number', searchTerm).limit(3),
      supabaseAdmin.from('employees').select('id, employee_number, first_name, last_name, email, phone, id_number, department, branch, position, employment_status, manager_id').eq('company_id', company_id)
        .or(`employee_number.ilike.${quotedSearch},first_name.ilike.${quotedSearch},last_name.ilike.${quotedSearch},id_number.ilike.${quotedSearch},email.ilike.${quotedSearch},phone.ilike.${quotedSearch},department.ilike.${quotedSearch},branch.ilike.${quotedSearch},position.ilike.${quotedSearch},employment_status.ilike.${quotedSearch}`)
        .limit(8),
    ]);

    if (employees.error) throw employees.error;

    const employeeRows = employees.data || [];
    const managerIds = [...new Set(employeeRows.map((e) => e.manager_id).filter(Boolean))];
    let managerMap = {};
    if (managerIds.length) {
      const { data: managers } = await supabaseAdmin
        .from('employees')
        .select('id, first_name, last_name, employee_number')
        .in('id', managerIds);
      managerMap = Object.fromEntries((managers || []).map((m) => [m.id, m]));
    }

    const rankedEmployees = employeeRows
      .map((i) => {
        let score = 0;
        const num = (i.employee_number || '').toLowerCase();
        const q = exactTerm.toLowerCase();
        if (num === q) score = 1000;
        else if (num.startsWith(q)) score = 900;
        else score = 100;
        const mgr = i.manager_id ? managerMap[i.manager_id] : null;
        return { i, score, mgr };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const results = [
      ...(customers.data || []).map(i => ({ type: 'Customer', id: i.id, title: i.name, subtitle: i.email, url: `/customers/${i.id}` })),
      ...(vendors.data || []).map(i => ({ type: 'Vendor', id: i.id, title: i.name, subtitle: i.email, url: `/vendors/${i.id}` })),
      ...(invoices.data || []).map(i => ({ type: 'Invoice', id: i.id, title: i.invoice_number, subtitle: i.customers?.name, url: `/invoices/${i.id}` })),
      ...(quotes.data || []).map(i => ({ type: 'Quote', id: i.id, title: i.quote_number, subtitle: i.customers?.name, url: `/quotes/${i.id}` })),
      ...(bills.data || []).map(i => ({ type: 'Bill', id: i.id, title: i.bill_number || 'Bill', subtitle: i.vendors?.name, url: '/bills' })),
      ...(accounts.data || []).map(i => ({ type: 'Account', id: i.id, title: `${i.account_number} - ${i.name}`, subtitle: 'Chart of Accounts', url: '/chart-of-accounts' })),
      ...(projects.data || []).map(i => ({ type: 'Project', id: i.id, title: i.name, subtitle: 'Project', url: `/projects/${i.id}` })),
      ...(products.data || []).map(i => ({ type: 'Product', id: i.id, title: i.name, subtitle: 'Product/Service', url: '/products' })),
      ...(purchaseOrders.data || []).map(i => ({ type: 'Purchase Order', id: i.id, title: i.po_number, subtitle: i.vendors?.name, url: `/purchase-orders/${i.id}` })),
      ...(recurringBills.data || []).map(i => ({ type: 'Recurring Bill', id: i.id, title: i.profile_name, subtitle: i.vendors?.name, url: '/recurring-bills' })),
      ...(creditNotes.data || []).map(i => ({ type: 'Credit Note', id: i.id, title: i.credit_note_number, subtitle: i.customers?.name, url: '/credit-notes' })),
      ...(vendorCredits.data || []).map(i => ({ type: 'Vendor Credit', id: i.id, title: i.credit_number, subtitle: i.vendors?.name, url: '/vendor-credits' })),
      ...(rankedEmployees.map(({ i, mgr }) => ({
        type: 'Employee',
        id: i.id,
        title: i.employee_number,
        subtitle: [
          `${i.first_name} ${i.last_name}`,
          i.department,
          i.branch,
          i.position,
          mgr ? `Mgr: ${mgr.first_name} ${mgr.last_name}` : null,
          i.employment_status && i.employment_status !== 'active' ? i.employment_status : null,
          i.email,
        ].filter(Boolean).join(' · '),
        url: '/employees',
      }))),
    ];

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
