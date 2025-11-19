// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sampleAccounts = [
    // Assets
    { name: 'Checking Account', type: 'Asset', description: 'Primary business bank account.' },
    { name: 'Savings Account', type: 'Asset', description: 'Business savings and reserve funds.' },
    { name: 'Accounts Receivable', type: 'Asset', description: 'Money owed to the business by customers.' },
    { name: 'Inventory Asset', type: 'Asset', description: 'Value of inventory on hand.' },
    { name: 'Office Equipment', type: 'Asset', description: 'Computers, desks, and other office equipment.' },
    { name: 'Accumulated Depreciation - Equipment', type: 'Asset', description: 'Contra-asset for equipment depreciation.' },
    // Liabilities
    { name: 'Accounts Payable', type: 'Liability', description: 'Money the business owes to its suppliers.' },
    { name: 'Credit Card', type: 'Liability', description: 'Business credit card balance.' },
    { name: 'Sales Tax Payable', type: 'Liability', description: 'Sales tax collected and owed to the government.' },
    // Equity
    { name: 'Owner\'s Equity', type: 'Equity', description: 'Owner\'s investment in the company.' },
    { name: 'Retained Earnings', type: 'Equity', description: 'Cumulative net income retained by the business.' },
    // Income
    { name: 'Sales Revenue', type: 'Income', description: 'Revenue from selling products.' },
    { name: 'Service Revenue', type: 'Income', description: 'Revenue from providing services.' },
    { name: 'Interest Income', type: 'Income', description: 'Interest earned from bank accounts.' },
    // Expenses
    { name: 'Cost of Goods Sold', type: 'Expense', description: 'Direct costs of goods sold.' },
    { name: 'Advertising & Marketing', type: 'Expense', description: 'Costs for promoting the business.' },
    { name: 'Bank Fees', type: 'Expense', description: 'Fees charged by the bank.' },
    { name: 'Office Supplies', type: 'Expense', description: 'Expendable office items.' },
    { name: 'Rent Expense', type: 'Expense', description: 'Rent for office or workspace.' },
    { name: 'Salaries & Wages', type: 'Expense', description: 'Employee salaries and wages.' },
    { name: 'Utilities', type: 'Expense', description: 'Electricity, water, internet, etc.' },
    { name: 'Depreciation Expense', type: 'Expense', description: 'Depreciation of fixed assets.' },
];

const sampleVendors = [
    { name: 'Office Supply Co.', email: 'sales@officesupply.co' },
    { name: 'City Utilities', email: 'billing@cityutilities.com' },
    { name: 'Pro Marketing Agency', email: 'contact@promarketing.com' },
];

const sampleCustomers = [
    { name: 'ACME Corporation', email: 'contact@acme.corp' },
    { name: 'Innovate Inc.', email: 'hello@innovate.inc' },
    { name: 'Global Solutions Ltd.', email: 'support@globalsolutions.ltd' },
];

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

    const { data: profile, error: profileError } = await supabase.from('profiles').select('active_company_id').single();
    if (profileError) throw profileError;
    if (!profile.active_company_id) throw new Error("No active company found for user.");
    
    const company_id = profile.active_company_id;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Seed Accounts
    const accountsToInsert = sampleAccounts.map(acc => ({ ...acc, company_id }));
    const { error: accError } = await supabaseAdmin.from('chart_of_accounts').insert(accountsToInsert, { onConflict: 'company_id, name' });
    if (accError) throw accError;

    // Seed Vendors
    const vendorsToInsert = sampleVendors.map(v => ({ ...v, company_id }));
    const { error: venError } = await supabaseAdmin.from('vendors').insert(vendorsToInsert, { onConflict: 'company_id, name' });
    if (venError) throw venError;

    // Seed Customers
    const customersToInsert = sampleCustomers.map(c => ({ ...c, company_id }));
    const { error: cusError } = await supabaseAdmin.from('customers').insert(customersToInsert, { onConflict: 'company_id, name' });
    if (cusError) throw cusError;

    return new Response(JSON.stringify({ message: "Sample data seeded successfully!" }), {
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