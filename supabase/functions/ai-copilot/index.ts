// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('ai-copilot', 'tenant', async (req, _ctx) => {

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured. Please add it to your Supabase secrets.");
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    const body = await req.json();
    const { method, company_id } = body;

    if (!company_id) throw new Error("Company ID is required.");

    
    _ctx.companyId = company_id;// Security Check
    const { data: member, error: memberError } = await supabase
      .from('company_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !member) throw new Error("Permission denied.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data;

    if (method === 'JOURNAL_ENTRY') {
      const { prompt } = body;
      
      // Fetch Chart of Accounts context for the AI
      const { data: accounts } = await supabaseAdmin
        .from('chart_of_accounts')
        .select('id, name, type')
        .eq('company_id', company_id);

      const systemPrompt = `You are an expert AI accounting assistant. You will receive a user's natural language description of a financial transaction, along with their specific Chart of Accounts (JSON). 
Your job is to translate the user's prompt into a perfectly balanced double-entry journal entry using ONLY the provided account IDs. 
Respond ONLY with a JSON object in this exact format: { "items": [ { "account_id": "uuid", "type": "debit" | "credit", "amount": 123.45 } ], "description": "A clean, concise description of the transaction" }. 
Ensure total debits exactly equal total credits. DO NOT return markdown formatting, just raw JSON.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: "json_object" },
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Accounts: ${JSON.stringify(accounts)}\n\nUser Prompt: ${prompt}` }
          ]
        })
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error.message);
      
      data = JSON.parse(result.choices[0].message.content);
    } 
    else if (method === 'CATEGORIZE_EXPENSES') {
      const { items } = body; // Array of { index, description }
      
      // Fetch Expense Accounts
      const { data: accounts } = await supabaseAdmin
        .from('chart_of_accounts')
        .select('id, name')
        .eq('company_id', company_id)
        .eq('type', 'Expense');

      const systemPrompt = `You are an expert AI accounting assistant. You will be provided a list of expense descriptions and a list of valid Expense Accounts (JSON). 
Your job is to map each description to the most appropriate account_id. 
Respond ONLY with a JSON object in this format: { "mappings": [ { "index": number, "account_id": "uuid" } ] }. DO NOT return markdown.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: "json_object" },
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Accounts: ${JSON.stringify(accounts)}\n\nItems to Categorize: ${JSON.stringify(items)}` }
          ]
        })
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error.message);
      
      data = JSON.parse(result.choices[0].message.content);
    } 
    else {
      throw new Error(`Unsupported AI method: ${method}`);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
