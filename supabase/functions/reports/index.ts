// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { format, subMonths, subYears, startOfMonth, endOfMonth } from "https://esm.sh/date-fns@3.6.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('reports', 'tenant', async (req, _ctx) => {

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const { company_id, start_date, end_date, prior_date, method } = await req.json();

    if (!company_id) throw new Error("Company ID is required.");

    // Security Check
    const { data: companyMember, error: memberError } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) throw new Error("Permission denied.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const userSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // --- Comparative Balance Sheet ---
    if (method === 'GET_COMPARATIVE_BS') {
        const currentDate = end_date;
        const priorDate = format(subYears(new Date(currentDate), 1), 'yyyy-MM-dd');

        const { data: currentBalances, error: currError } = await userSupabase.rpc('get_balances_as_of_date', {
            p_end_date: currentDate,
            p_company_id: company_id
        });
        if (currError) throw currError;

        const { data: priorBalances, error: priorError } = await userSupabase.rpc('get_balances_as_of_date', {
            p_end_date: priorDate,
            p_company_id: company_id
        });
        if (priorError) throw priorError;

        // Merge logic
        const reportData = {};
        
        [...(currentBalances || []), ...(priorBalances || [])].forEach(acc => {
            if (!reportData[acc.id]) {
                reportData[acc.id] = { 
                    name: acc.name, 
                    type: acc.type, 
                    current: 0, 
                    prior: 0 
                };
            }
        });

        currentBalances?.forEach(acc => { reportData[acc.id].current = acc.balance; });
        priorBalances?.forEach(acc => { reportData[acc.id].prior = acc.balance; });

        return new Response(JSON.stringify({ 
            accounts: Object.values(reportData),
            dates: { current: currentDate, prior: priorDate }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // --- Comparative P&L ---
    if (method === 'GET_COMPARATIVE_PL') {
        const monthsCount = 3;
        const months = [];
        for (let i = 0; i < monthsCount; i++) {
            const date = subMonths(new Date(end_date), i);
            months.push({
                start: format(startOfMonth(date), 'yyyy-MM-dd'),
                end: format(endOfMonth(date), 'yyyy-MM-dd'),
                label: format(date, 'MMM yyyy')
            });
        }

        const reportData = {};

        for (const month of months) {
            const { data, error } = await userSupabase.rpc('get_period_activity', {
                p_start_date: month.start,
                p_end_date: month.end,
                p_company_id: company_id,
            });
            if (error) throw error;

            data.forEach(acc => {
                if (!reportData[acc.id]) {
                    reportData[acc.id] = { name: acc.name, type: acc.type, values: {} };
                }
                reportData[acc.id].values[month.label] = acc.activity;
            });
        }

        return new Response(JSON.stringify({ months, accounts: Object.values(reportData) }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // --- (Keep existing methods...) ---
    if (method === 'GET_INVENTORY_VALUATION') {
        const { data: products, error } = await supabaseAdmin
          .from('products')
          .select('*')
          .eq('company_id', company_id)
          .eq('type', 'inventory')
          .order('name');
        if (error) throw error;

        const { data: balances } = await supabaseAdmin
          .from('inv_balances')
          .select('product_id, qty_on_hand, avg_unit_cost')
          .eq('company_id', company_id);

        const byProduct = {};
        for (const b of balances || []) {
          byProduct[b.product_id] = byProduct[b.product_id] || { qty: 0, value: 0 };
          byProduct[b.product_id].qty += Number(b.qty_on_hand || 0);
          byProduct[b.product_id].value += Number(b.qty_on_hand || 0) * Number(b.avg_unit_cost || 0);
        }

        const valuation = (products || []).map((p) => {
          const agg = byProduct[p.id];
          const quantity = agg ? agg.qty : Number(p.quantity_on_hand || 0);
          const cost = agg && agg.qty > 0
            ? agg.value / agg.qty
            : Number(p.cost || p.standard_cost || 0);
          return {
            id: p.id,
            name: p.name,
            quantity,
            cost,
            totalValue: quantity * cost,
          };
        });
        return new Response(JSON.stringify(valuation), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (method === 'GET_PROJECT_PROFITABILITY') {
        const { data: projects, error: projError } = await supabaseAdmin.from('projects').select('id, name, status, customers(name)').eq('company_id', company_id).order('name');
        if (projError) throw projError;
        if (!projects || projects.length === 0) return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        const { data: projectItems, error: piError } = await supabaseAdmin.from('journal_entry_items').select(`amount, type, project_id, chart_of_accounts ( type )`).in('project_id', projects.map(p => p.id));
        if (piError) throw piError;
        const projectStats = {};
        projects.forEach(p => { projectStats[p.id] = { id: p.id, name: p.name, customer: p.customers?.name || '-', status: p.status, revenue: 0, expenses: 0, profit: 0, margin: 0 }; });
        projectItems.forEach(item => {
            const pid = item.project_id;
            const accType = item.chart_of_accounts?.type;
            if (projectStats[pid]) {
                if (accType === 'Income') projectStats[pid].revenue += item.type === 'credit' ? item.amount : -item.amount;
                else if (accType === 'Expense' || accType === 'Cost of Goods Sold') projectStats[pid].expenses += item.type === 'debit' ? item.amount : -item.amount;
            }
        });
        const result = Object.values(projectStats).map(p => { p.profit = p.revenue - p.expenses; p.margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0; return p; });
        result.sort((a, b) => b.profit - a.profit);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (method === 'GET_TAX_REPORT') {
        const { data: taxData, error: taxError } = await supabaseAdmin.from('journal_entry_item_tax_rates').select(`tax_rates ( name, rate ), journal_entry_items!inner ( amount, type, journal_entries!inner ( entry_date, company_id ) )`).eq('journal_entry_items.journal_entries.company_id', company_id).gte('journal_entry_items.journal_entries.entry_date', start_date).lte('journal_entry_items.journal_entries.entry_date', end_date);
        if (taxError) throw taxError;
        const report = {};
        taxData.forEach(row => {
            const name = row.tax_rates?.name || 'Unknown';
            const rate = row.tax_rates?.rate || 0;
            const netAmount = row.journal_entry_items?.amount || 0;
            const itemType = row.journal_entry_items?.type;
            const taxAmount = netAmount * (rate / 100);
            if (!report[name]) report[name] = { name, rate, netSales: 0, taxCollected: 0, netPurchases: 0, taxPaid: 0, netTax: 0 };
            if (itemType === 'credit') { report[name].netSales += netAmount; report[name].taxCollected += taxAmount; }
            else if (itemType === 'debit') { report[name].netPurchases += netAmount; report[name].taxPaid += taxAmount; }
            report[name].netTax = report[name].taxCollected - report[name].taxPaid;
        });
        return new Response(JSON.stringify(Object.values(report)), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const promises = [];
    if (end_date) promises.push(userSupabase.rpc('get_balances_as_of_date', { p_end_date: end_date, p_company_id: company_id }));
    if (start_date && end_date) {
        promises.push(userSupabase.rpc('get_period_activity', { p_start_date: start_date, p_end_date: end_date, p_company_id: company_id }));
        promises.push(userSupabase.rpc('get_cash_flow_statement', { p_start_date: start_date, p_end_date: end_date, p_company_id: company_id }));
    }
    if (prior_date) promises.push(userSupabase.rpc('get_balances_as_of_date', { p_end_date: prior_date, p_company_id: company_id }));
    promises.push(userSupabase.rpc('get_aged_receivables', { p_company_id: company_id }));
    promises.push(userSupabase.rpc('get_aged_payables', { p_company_id: company_id }));

    const [balancesAsOfRes, periodActivityRes, cashFlowRes, openingBalancesRes, agedReceivablesRes, agedPayablesRes] = await Promise.all(promises);
    if (balancesAsOfRes?.error) throw balancesAsOfRes.error;

    return new Response(JSON.stringify({
      balancesAsOf: balancesAsOfRes?.data,
      periodActivity: periodActivityRes?.data,
      cashFlowData: cashFlowRes?.data,
      openingBalances: openingBalancesRes?.data,
      agedReceivables: agedReceivablesRes?.data,
      agedPayables: agedPayablesRes?.data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
