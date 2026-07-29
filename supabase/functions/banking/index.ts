// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import {
  beginEdgeRequest,
  bootstrapTenantRequest,
  edgeSuccess,
  edgeFailure,
  optionsResponse,
} from '../_shared/enterpriseEdgePlatform.ts'

/**
 * Phase 3D production defect fix: bootstrapTenantRequest only verifies
 * company membership, not role — every other Treasury & Financing-tier
 * module (e.g. loans/index.ts) explicitly restricts to owner/admin. Banking
 * had no equivalent check, so any company member (not just admins) could
 * create/edit bank accounts and post transactions/transfers via direct API
 * calls, bypassing the frontend's AdminRoute gate entirely. Verified live
 * against production before this fix: a real member-role user's company
 * membership check passed with no role restriction anywhere in this file.
 */
async function requireAdmin(admin, userId: string, companyId: string) {
  const { data: member, error } = await admin
    .from('company_users')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single();
  if (error || !member || !['owner', 'admin'].includes(member.role)) {
    throw new Error('Access Denied: Admin privileges required for Banking.');
  }
}

type BankingMethod =
  | 'GET_BANK_ACCOUNTS'
  | 'CREATE_BANK_ACCOUNT'
  | 'SET_DEFAULT_BANK_ACCOUNT'
  | 'POST_OPENING_BALANCE'
  | 'RECORD_TRANSACTION'
  | 'RECORD_TRANSFER'
  | 'GET_TRANSACTIONS'
  | 'IMPORT_STATEMENT'
  | 'GET_STATEMENT_LINES'
  | 'MATCH_STATEMENT_LINE'
  | 'POST_STATEMENT_ADJUSTMENT'
  | 'GET_OUTSTANDING';

serve(async (req: Request) => {
  const ctx = beginEdgeRequest(req, 'banking', 'tenant');
  if (req.method === 'OPTIONS') return optionsResponse(ctx);

  try {
    const { user, admin, body, company_id } = await bootstrapTenantRequest(req, ctx);
    await requireAdmin(admin, user.id, company_id);
    const method = body.method as BankingMethod;
    let data: unknown = null;

    switch (method) {
      case 'GET_BANK_ACCOUNTS': {
        const { data: rows, error } = await admin
          .from('bank_accounts')
          .select('*, chart_of_accounts(name, account_number)')
          .eq('company_id', company_id)
          .order('created_at', { ascending: true });
        if (error) throw error;
        data = rows;
        break;
      }

      case 'CREATE_BANK_ACCOUNT': {
        const b = body.bankAccountData as Record<string, unknown> ?? {};
        const { data: newId, error } = await admin.rpc('create_bank_account_atomic', {
          p_company_id: company_id,
          p_name: b.name,
          p_account_type: b.account_type ?? 'bank',
          p_account_number: b.account_number ?? null,
          p_bank_name: b.bank_name ?? null,
          p_branch_code: b.branch_code ?? null,
          p_currency: b.currency ?? 'ZAR',
          p_chart_of_account_id: b.chart_of_account_id ?? null,
          p_is_default: b.is_default ?? false,
          p_metadata: b.metadata ?? {},
          p_opening_balance: b.opening_balance ?? 0,
          p_opening_balance_date: b.opening_balance_date ?? null,
          p_opening_balance_contra_account_id: b.opening_balance_contra_account_id ?? null,
          p_actor_user_id: user.id,
        });
        if (error) throw error;
        data = { id: newId };
        break;
      }

      case 'SET_DEFAULT_BANK_ACCOUNT': {
        const { error } = await admin.rpc('set_default_bank_account', {
          p_bank_account_id: body.bankAccountId,
          p_company_id: company_id,
        });
        if (error) throw error;
        data = { id: body.bankAccountId };
        break;
      }

      case 'POST_OPENING_BALANCE': {
        const { data: result, error } = await admin.rpc('post_bank_opening_balance_atomic', {
          p_bank_account_id: body.bankAccountId,
          p_contra_account_id: body.contraAccountId,
          p_opening_balance_date: body.openingBalanceDate ?? null,
          p_actor_user_id: user.id,
        });
        if (error) throw error;
        data = result;
        break;
      }

      case 'RECORD_TRANSACTION': {
        const t = body.transactionData as Record<string, unknown> ?? {};
        const { data: result, error } = await admin.rpc('record_bank_transaction_atomic', {
          p_company_id: company_id,
          p_bank_account_id: t.bank_account_id,
          p_transaction_type: t.transaction_type,
          p_direction: t.direction,
          p_transaction_date: t.transaction_date,
          p_amount: t.amount,
          p_contra_account_id: t.contra_account_id,
          p_description: t.description ?? null,
          p_reference: t.reference ?? null,
          p_actor_user_id: user.id,
        });
        if (error) throw error;
        data = result;
        break;
      }

      case 'RECORD_TRANSFER': {
        const t = body.transferData as Record<string, unknown> ?? {};
        const { data: result, error } = await admin.rpc('record_bank_transfer_atomic', {
          p_company_id: company_id,
          p_from_bank_account_id: t.from_bank_account_id,
          p_to_bank_account_id: t.to_bank_account_id,
          p_transfer_date: t.transfer_date,
          p_amount: t.amount,
          p_description: t.description ?? null,
          p_idempotency_key: t.idempotency_key ?? null,
          p_actor_user_id: user.id,
        });
        if (error) throw error;
        data = result;
        break;
      }

      case 'GET_TRANSACTIONS': {
        let query = admin
          .from('bank_transactions')
          .select('*, bank_accounts(name)')
          .eq('company_id', company_id)
          .order('transaction_date', { ascending: false });
        if (body.bankAccountId) query = query.eq('bank_account_id', body.bankAccountId);
        const { data: rows, error } = await query;
        if (error) throw error;
        data = rows;
        break;
      }

      case 'IMPORT_STATEMENT': {
        const s = body.statementData as Record<string, unknown> ?? {};
        const { data: result, error } = await admin.rpc('create_bank_statement_import_atomic', {
          p_company_id: company_id,
          p_bank_account_id: s.bank_account_id,
          p_period_start: s.period_start ?? null,
          p_period_end: s.period_end ?? null,
          p_opening_balance: s.opening_balance ?? null,
          p_closing_balance: s.closing_balance ?? null,
          p_file_name: s.file_name ?? null,
          p_lines: s.lines ?? [],
          p_actor_user_id: user.id,
        });
        if (error) throw error;
        data = result;
        break;
      }

      case 'GET_STATEMENT_LINES': {
        let query = admin
          .from('bank_statement_lines')
          .select('*')
          .eq('company_id', company_id)
          .order('line_date', { ascending: false });
        if (body.bankAccountId) query = query.eq('bank_account_id', body.bankAccountId);
        if (body.matchStatus) query = query.eq('match_status', body.matchStatus);
        const { data: rows, error } = await query;
        if (error) throw error;
        data = rows;
        break;
      }

      case 'MATCH_STATEMENT_LINE': {
        const { data: result, error } = await admin.rpc('match_statement_line_atomic', {
          p_statement_line_id: body.statementLineId,
          p_journal_entry_item_id: body.journalEntryItemId,
          p_company_id: company_id,
          p_actor_user_id: user.id,
        });
        if (error) throw error;
        data = result;
        break;
      }

      case 'POST_STATEMENT_ADJUSTMENT': {
        const { data: result, error } = await admin.rpc('post_statement_line_adjustment_atomic', {
          p_statement_line_id: body.statementLineId,
          p_company_id: company_id,
          p_contra_account_id: body.contraAccountId,
          p_description: body.description ?? null,
          p_actor_user_id: user.id,
        });
        if (error) throw error;
        data = result;
        break;
      }

      case 'GET_OUTSTANDING': {
        // Outstanding deposits/payments are, by definition, unmatched
        // statement lines — no separate posting concept is needed.
        let query = admin
          .from('bank_statement_lines')
          .select('*')
          .eq('company_id', company_id)
          .eq('match_status', 'unmatched')
          .order('line_date', { ascending: true });
        if (body.bankAccountId) query = query.eq('bank_account_id', body.bankAccountId);
        const { data: rows, error } = await query;
        if (error) throw error;
        data = rows;
        break;
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    return edgeSuccess(ctx, data);
  } catch (error) {
    return edgeFailure(ctx, error);
  }
});
