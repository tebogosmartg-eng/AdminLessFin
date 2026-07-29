// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { formatEmployeeIdentityContext } from '../_shared/employeeTimelineEngine.ts'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS

serve(withEnterprisePlatform('expense-claims', 'tenant', async (req, _ctx) => {

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
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !companyMember) {
      throw new Error("Permission denied.");
    }

    const isAdmin = ['owner', 'admin'].includes(companyMember.role);
    const requireAdmin = () => {
      if (!isAdmin) throw new Error("Access Denied: This action requires Admin privileges.");
    };

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data, error;

    switch (method) {
      case 'GET_ALL':
        ({ data, error } = await supabaseAdmin
          .from('expense_claims')
          .select('*, employees(employee_number, first_name, last_name, department)')
          .eq('company_id', company_id)
          .order('submission_date', { ascending: false }));
        break;
      
      case 'GET_ONE':
        ({ data, error } = await supabaseAdmin
          .from('expense_claims')
          .select('*, employees(employee_number, first_name, last_name, department), expense_claim_items(*, projects(name))')
          .eq('id', body.claimId)
          .eq('company_id', company_id)
          .single());
        break;

      case 'GET_NEXT_NUMBER':
        const { data: lastClaim } = await supabaseAdmin
          .from('expense_claims')
          .select('claim_number')
          .eq('company_id', company_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        let nextNum = 1;
        if (lastClaim && lastClaim.claim_number) {
            const matches = lastClaim.claim_number.match(/EXP-(\d+)/);
            if (matches && matches[1]) nextNum = parseInt(matches[1]) + 1;
        }
        data = `EXP-${String(nextNum).padStart(5, '0')}`;
        break;

      case 'POST':
        requireAdmin();
        const { items: postItems, ...postData } = body.claimData;
        const totalAmount = postItems.reduce((sum: number, item: any) => sum + item.amount, 0);

        const { data: newClaim, error: postError } = await supabaseAdmin
          .from('expense_claims')
          .insert({ ...postData, total_amount: totalAmount, company_id })
          .select('id')
          .single();
        if (postError) throw postError;

        const itemsToInsert = postItems.map(item => ({ 
          ...item, 
          expense_claim_id: newClaim.id,
          project_id: item.project_id || null
        }));
        
        const { error: itemsError } = await supabaseAdmin.from('expense_claim_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
        
        data = newClaim;
        break;

      case 'PUT':
        requireAdmin();
        const { data: existingClaim, error: existingClaimError } = await supabaseAdmin
          .from('expense_claims')
          .select('status')
          .eq('id', body.claimId)
          .eq('company_id', company_id)
          .single();
        if (existingClaimError) throw existingClaimError;
        if (existingClaim.status !== 'draft') throw new Error('Only draft claims can be edited.');

        const { items: putItems, ...putData } = body.claimData;
        const totalPutAmount = putItems.reduce((sum: number, item: any) => sum + item.amount, 0);

        const { error: putError } = await supabaseAdmin
          .from('expense_claims')
          .update({ ...putData, total_amount: totalPutAmount })
          .eq('id', body.claimId)
          .eq('company_id', company_id);
        if (putError) throw putError;

        await supabaseAdmin.from('expense_claim_items').delete().eq('expense_claim_id', body.claimId);
        
        const putItemsToInsert = putItems.map(item => ({ 
          ...item, 
          expense_claim_id: body.claimId,
          project_id: item.project_id || null
        }));
        
        const { error: putItemsError } = await supabaseAdmin.from('expense_claim_items').insert(putItemsToInsert);
        if (putItemsError) throw putItemsError;
        
        data = { id: body.claimId };
        break;

      case 'DELETE':
        requireAdmin();
        const { data: claimToDelete, error: claimToDeleteError } = await supabaseAdmin
          .from('expense_claims')
          .select('status')
          .eq('id', body.claimId)
          .eq('company_id', company_id)
          .single();
        if (claimToDeleteError) throw claimToDeleteError;
        if (claimToDelete.status !== 'draft') throw new Error('Only draft claims can be deleted.');

        ({ data, error } = await supabaseAdmin
          .from('expense_claims')
          .delete()
          .eq('id', body.claimId)
          .eq('company_id', company_id));
        break;

      case 'APPROVE':
        requireAdmin();
        const { claimId, liabilityAccountId } = body;
        
        // 1. Get Claim Details
        const { data: claim, error: fetchClaimError } = await supabaseAdmin
          .from('expense_claims')
          .select('*, employees(employee_number, first_name, last_name, department), expense_claim_items(*)')
          .eq('id', claimId)
          .eq('company_id', company_id)
          .single();
        if (fetchClaimError) throw fetchClaimError;

        if (claim.status === 'approved') throw new Error("Claim is already approved.");

        // 2. Create Journal Entry
        const { data: entry, error: entryError } = await supabaseAdmin
          .from('journal_entries')
          .insert({
            company_id: company_id,
            entry_date: claim.submission_date,
            description: `Expense Claim ${claim.claim_number} - ${formatEmployeeIdentityContext(claim.employees)}`,
          })
          .select('id')
          .single();
        if (entryError) throw entryError;

        // 3. Create Journal Items
        const jeItems = [];
        // Debits (Expenses)
        claim.expense_claim_items.forEach((item: any) => {
          jeItems.push({
            journal_entry_id: entry.id,
            account_id: item.expense_account_id,
            type: 'debit',
            amount: item.amount,
            project_id: item.project_id
          });
        });
        // Credit (Liability to Employee)
        jeItems.push({
          journal_entry_id: entry.id,
          account_id: liabilityAccountId,
          type: 'credit',
          amount: claim.total_amount
        });

        const { error: jeItemsError } = await supabaseAdmin.from('journal_entry_items').insert(jeItems);
        if (jeItemsError) throw jeItemsError;

        // 4. Update Claim Status
        ({ data, error } = await supabaseAdmin
          .from('expense_claims')
          .update({ status: 'approved', journal_entry_id: entry.id })
          .eq('id', claimId));
        break;

      case 'REIMBURSE': {
        requireAdmin();
        const { claimId: rClaimId, paymentAccountId, liabilityAccountId: rLiabilityAccountId, paymentDate } = body;

        ({ data, error } = await supabaseAdmin.rpc('reimburse_expense_claim_atomic', {
          p_claim_id: rClaimId,
          p_payment_account_id: paymentAccountId,
          p_liability_account_id: rLiabilityAccountId,
          p_payment_date: paymentDate,
          p_actor_user_id: user.id,
        }));
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

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
