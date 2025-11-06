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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get the user from the auth header
    const authHeader = req.headers.get('Authorization')!
    const jwt = authHeader.split(' ')[1]
    const { data: { user } } = await supabaseAdmin.auth.getUser(jwt)
    if (!user) throw new Error("User not found");

    // 2. Get user's current financial year settings
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('current_financial_year_start, financial_year_end_month, financial_year_end_day')
      .eq('id', user.id)
      .single();
    if (profileError) throw profileError;

    const startDate = new Date(profile.current_financial_year_start);
    const year = startDate.getFullYear();
    // JS months are 0-indexed, so subtract 1
    const endDate = new Date(year, profile.financial_year_end_month - 1, profile.financial_year_end_day);
    
    // If year-end is in the next calendar year (e.g. starts in July, ends in June)
    if (endDate < startDate) {
        endDate.setFullYear(year + 1);
    }

    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = endDate.toISOString().split('T')[0];

    // 3. Calculate Net Income for the period
    const { data: activity, error: activityError } = await supabaseAdmin.rpc('get_period_activity', {
        p_start_date: startDateString,
        p_end_date: endDateString,
    });
    if (activityError) throw activityError;

    const totalIncome = activity.filter(a => a.type === 'Income').reduce((sum, a) => sum + a.activity, 0);
    const totalExpenses = activity.filter(a => a.type === 'Expense').reduce((sum, a) => sum + a.activity, 0);
    const netIncome = totalIncome - totalExpenses;

    // 4. Get Retained Earnings account
    const { data: retainedEarningsAccount, error: reError } = await supabaseAdmin
      .from('chart_of_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', 'Retained Earnings')
      .single();
    if (reError || !retainedEarningsAccount) throw new Error("Retained Earnings account not found.");

    // 5. Create the closing journal entry
    const { data: closingEntry, error: entryError } = await supabaseAdmin.from('journal_entries').insert({
        user_id: user.id,
        entry_date: endDateString,
        description: `Closing Entry for Financial Year Ending ${endDateString}`,
    }).select('id').single();
    if (entryError) throw entryError;

    // 6. Create items to zero out income/expense accounts and transfer net income
    const closingItems = [];
    // Zero out income accounts (debit)
    activity.filter(a => a.type === 'Income' && a.activity !== 0).forEach(acc => {
        closingItems.push({ journal_entry_id: closingEntry.id, account_id: acc.id, type: 'debit', amount: acc.activity });
    });
    // Zero out expense accounts (credit)
    activity.filter(a => a.type === 'Expense' && a.activity !== 0).forEach(acc => {
        closingItems.push({ journal_entry_id: closingEntry.id, account_id: acc.id, type: 'credit', amount: acc.activity });
    });
    // Transfer net income to Retained Earnings
    if (netIncome > 0) { // Profit
        closingItems.push({ journal_entry_id: closingEntry.id, account_id: retainedEarningsAccount.id, type: 'credit', amount: netIncome });
    } else if (netIncome < 0) { // Loss
        closingItems.push({ journal_entry_id: closingEntry.id, account_id: retainedEarningsAccount.id, type: 'debit', amount: -netIncome });
    }

    if (closingItems.length > 0) {
        const { error: itemsError } = await supabaseAdmin.from('journal_entry_items').insert(closingItems);
        if (itemsError) throw itemsError;
    }

    // 7. Update user's profile to the next financial year
    const newFinancialYearStart = new Date(endDate);
    newFinancialYearStart.setDate(newFinancialYearStart.getDate() + 1);
    
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({ current_financial_year_start: newFinancialYearStart.toISOString().split('T')[0] })
      .eq('id', user.id);
    if (updateProfileError) throw updateProfileError;

    return new Response(JSON.stringify({ message: "Year-end close successful." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error during year-end close:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})