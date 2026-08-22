// @ts-nocheck
/**
 * Accounting edge — READ MODELS over certified Posting Engine outputs.
 * Phase 4A Enterprise Accounting Workspace.
 * Does NOT invoke posting_engine_submit / rollback. Does NOT mutate journals.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'
import { loadCanonicalAggregation } from '../_shared/loadCanonicalAggregation.ts'
import {
  resolveAccountHierarchy,
  hierarchySortKey,
} from '../_shared/chartOfAccounts/accountClassification.ts'

const corsHeaders = ENTERPRISE_CORS_HEADERS

const DEBIT_NORMAL = new Set(['Asset', 'Expense'])

function clampPage(page: unknown, pageSize: unknown) {
  const p = Math.max(1, Number(page) || 1)
  const ps = Math.min(200, Math.max(1, Number(pageSize) || 50))
  return { page: p, pageSize: ps, offset: (p - 1) * ps }
}

function dayBefore(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function sourceRoute(module: string | null, documentType: string | null, documentId: string | null) {
  if (!documentId) return null
  const m = (module || '').toLowerCase()
  const dt = (documentType || '').toLowerCase()
  if (m.includes('sales') || dt.includes('invoice')) return `/invoices/${documentId}`
  if (m.includes('payable') || m.includes('purchase') || dt.includes('bill')) return `/bills/${documentId}`
  if (m.includes('banking') || dt.includes('bank')) return `/banking/transactions`
  if (m.includes('payroll')) return `/payroll-runs/${documentId}`
  if (m.includes('fixed') || m.includes('asset')) return `/fixed-assets/${documentId}`
  if (m.includes('inventory')) return `/inventory/movements`
  if (m.includes('manual') || dt.includes('journal')) return `/journal-entries`
  if (dt.includes('quote')) return `/quotes/${documentId}`
  if (dt.includes('credit')) return `/credit-notes`
  return null
}

// Phase 4C Part 7: single materiality implementation, reused by every
// handler that needs it (Variance, Drivers, Insights, Dashboard) instead of
// each defining its own copy of the same threshold rule.
async function getMateriality(admin: any, companyId: string) {
  const { data: row } = await admin.from('company_materiality_settings').select('percentage_threshold, absolute_threshold').eq('company_id', companyId).maybeSingle();
  return {
    percentageThreshold: Number(row?.percentage_threshold ?? 5),
    absoluteThreshold: Number(row?.absolute_threshold ?? 1000),
  };
}

function isMaterial(delta: number, base: number, percentageThreshold: number, absoluteThreshold: number) {
  if (Math.abs(delta) >= absoluteThreshold) return true;
  if (base !== 0 && Math.abs(delta / base) * 100 >= percentageThreshold) return true;
  return false;
}

function classifyModule(module: string | null) {
  const m = (module || '').toLowerCase()
  if (m.includes('sales')) return 'sales'
  if (m.includes('payable') || m.includes('purchase')) return 'purchases'
  if (m.includes('banking') || m.includes('bank')) return 'banking'
  if (m.includes('quick') || m.includes('capture')) return 'quick_capture'
  if (m.includes('inventory')) return 'inventory'
  if (m.includes('payroll')) return 'payroll'
  if (m.includes('fixed') || m.includes('asset')) return 'assets'
  if (m.includes('manual')) return 'manual_journals'
  if (m.includes('opening')) return 'opening_balances'
  if (m.includes('adjust')) return 'adjustments'
  return 'other'
}

serve(withEnterprisePlatform('accounting', 'tenant', async (req, _ctx) => {
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

    let data: unknown = null;
    let error: { message: string } | null = null;

    switch (method) {
      case 'GET_LEDGER_ENTRIES': {
        let query = supabaseAdmin
          .from('journal_entry_items')
          .select(`
            amount,
            type,
            journal_entries!inner (
              id,
              entry_date,
              description
            )
          `)
          .eq('account_id', body.account_id)
          .order('entry_date', { foreignTable: 'journal_entries', ascending: true });

        if (body.start_date) {
          query = query.gte('journal_entries.entry_date', body.start_date);
        }
        if (body.end_date) {
          query = query.lte('journal_entries.entry_date', body.end_date);
        }

        ({ data, error } = await query);
        break;
      }

      case 'GET_BANK_ACCOUNTS':
        ({ data, error } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('*')
          .eq('company_id', company_id)
          .eq('type', 'Asset')
          .order('name'));
        break;

      case 'GET_RECONCILIATION_TRANSACTIONS':
        ({ data, error } = await supabaseAdmin
          .from('journal_entry_items')
          .select(`
            id,
            amount,
            type,
            journal_entries (
              entry_date,
              description
            )
          `)
          .eq('account_id', body.account_id)
          .eq('reconciled', false)
          .lte('journal_entries.entry_date', body.statement_end_date));
        break;

      case 'GET_BOOK_BALANCE':
        ({ data, error } = await userSupabase.rpc('get_balances_as_of_date', {
          p_end_date: body.statement_end_date,
          p_company_id: company_id,
        }));
        if (!error) {
          data = (data as any[]).find(acc => acc.id === body.account_id);
        }
        break;

      case 'FINISH_RECONCILIATION':
        ({ data, error } = await supabaseAdmin
          .from('journal_entry_items')
          .update({ reconciled: true, reconciled_at: new Date().toISOString() })
          .in('id', body.cleared_ids));
        break;

      // ── Phase 4A read models ──────────────────────────────────────────────

      case 'GET_ENTERPRISE_CONTEXT': {
        const [{ data: company }, { data: years }, { data: periods }] = await Promise.all([
          supabaseAdmin.from('companies').select('id, name').eq('id', company_id).single(),
          supabaseAdmin.from('financial_years').select('*').eq('company_id', company_id).order('start_date', { ascending: false }),
          supabaseAdmin.from('accounting_periods').select('*').eq('company_id', company_id).order('start_date', { ascending: false }),
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const currentYear = (years || []).find((y: any) =>
          ['open', 'active', 'current', 'reopened'].includes(String(y.status).toLowerCase()) ||
          (y.start_date <= today && y.end_date >= today)
        ) || (years || [])[0] || null;
        const currentPeriod = (periods || []).find((p: any) =>
          String(p.status).toLowerCase() === 'open' ||
          (p.start_date <= today && p.end_date >= today)
        ) || null;
        data = {
          company,
          financial_years: years || [],
          accounting_periods: periods || [],
          current_financial_year: currentYear,
          current_accounting_period: currentPeriod,
        };
        break;
      }

      case 'GET_ACCOUNTING_DASHBOARD': {
        const today = new Date().toISOString().slice(0, 10);
        const todayStart = `${today}T00:00:00.000Z`;

        const ctxRes = await (async () => {
          const [{ data: years }, { data: periods }] = await Promise.all([
            supabaseAdmin.from('financial_years').select('*').eq('company_id', company_id).order('start_date', { ascending: false }),
            supabaseAdmin.from('accounting_periods').select('*').eq('company_id', company_id).order('start_date', { ascending: false }),
          ]);
          const currentYear = (years || []).find((y: any) =>
            ['open', 'active', 'current', 'reopened'].includes(String(y.status).toLowerCase()) ||
            (y.start_date <= today && y.end_date >= today)
          ) || (years || [])[0] || null;
          const currentPeriod = (periods || []).find((p: any) =>
            String(p.status).toLowerCase() === 'open' ||
            (p.start_date <= today && p.end_date >= today)
          ) || null;
          return { years: years || [], periods: periods || [], currentYear, currentPeriod };
        })();

        const [
          lastPosting,
          pendingPr,
          failedPr,
          postedToday,
          recentActivity,
          recentByModule,
          journalsToday,
        ] = await Promise.all([
          supabaseAdmin.from('posting_requests')
            .select('id, journal_number, module, document_type, status, committed_at, created_at, reference, description')
            .eq('company_id', company_id)
            .eq('status', 'committed')
            .order('committed_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabaseAdmin.from('posting_requests')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company_id)
            .eq('status', 'pending'),
          supabaseAdmin.from('posting_requests')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company_id)
            .eq('status', 'pending')
            .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()),
          supabaseAdmin.from('posting_requests')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company_id)
            .eq('status', 'committed')
            .gte('committed_at', todayStart),
          supabaseAdmin.from('posting_requests')
            .select('id, journal_number, module, document_type, document_id, status, committed_at, created_at, reference, description, warnings')
            .eq('company_id', company_id)
            .order('created_at', { ascending: false })
            .limit(12),
          supabaseAdmin.from('posting_requests')
            .select('id, journal_number, module, document_type, document_id, status, committed_at, created_at, reference, description')
            .eq('company_id', company_id)
            .eq('status', 'committed')
            .order('committed_at', { ascending: false })
            .limit(40),
          supabaseAdmin.from('journal_entries')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company_id)
            .gte('entry_date', today),
        ]);

        // Spot-check journal balance for recent journals
        const { data: recentJournals } = await supabaseAdmin
          .from('journal_entries')
          .select('id, journal_number, entry_date, description, journal_entry_items(type, amount)')
          .eq('company_id', company_id)
          .order('entry_date', { ascending: false })
          .limit(25);

        let balanced = 0;
        let unbalanced = 0;
        for (const j of recentJournals || []) {
          const items = j.journal_entry_items || [];
          const d = items.filter((i: any) => i.type === 'debit').reduce((s: number, i: any) => s + Number(i.amount), 0);
          const c = items.filter((i: any) => i.type === 'credit').reduce((s: number, i: any) => s + Number(i.amount), 0);
          if (Math.abs(d - c) < 0.005) balanced++; else unbalanced++;
        }

        const byModule = (mod: string) =>
          (recentByModule.data || []).filter((r: any) => String(r.module).toLowerCase().includes(mod)).slice(0, 5);

        data = {
          current_financial_year: ctxRes.currentYear,
          current_accounting_period: ctxRes.currentPeriod,
          period_status: ctxRes.currentPeriod?.status ?? null,
          open_periods: ctxRes.periods.filter((p: any) => String(p.status).toLowerCase() === 'open').length,
          closed_periods: ctxRes.periods.filter((p: any) =>
            ['soft_closed', 'hard_closed', 'locked', 'closed'].includes(String(p.status).toLowerCase())
          ).length,
          last_posting: lastPosting.data,
          pending_posting_requests: pendingPr.count || 0,
          failed_posting_requests: failedPr.count || 0,
          draft_journals: 0, // journals are immutable once created via engine
          posted_journals_today: journalsToday.count || 0,
          transactions_today: postedToday.count || 0,
          journal_balance_status: { balanced, unbalanced, sample_size: (recentJournals || []).length },
          unposted_documents: pendingPr.count || 0,
          recent_activity: recentActivity.data || [],
          recent_manual_journals: byModule('manual'),
          recent_bank_postings: byModule('banking'),
          recent_purchase_postings: byModule('payable').concat(byModule('purchase')).slice(0, 5),
          recent_sales_postings: byModule('sales'),
          recent_payroll_postings: byModule('payroll'),
          recent_fixed_asset_postings: byModule('fixed').concat(byModule('asset')).slice(0, 5),
        };
        break;
      }

      case 'GET_ENTERPRISE_LEDGER': {
        const { page, pageSize, offset } = clampPage(body.page, body.page_size);
        const filters = body.filters || {};

        // Fetch journal headers matching filters first for server-side filtering
        let jeQuery = supabaseAdmin
          .from('journal_entries')
          .select(`
            id, entry_date, description, journal_number, company_id,
            financial_year_id, accounting_period_id, invoice_id, bill_id,
            vendor_id, customer_id, attachment_url, created_at,
            financial_years ( id, year_code ),
            accounting_periods ( id, period_number, status ),
            posting_requests!journal_entry_id (
              id, module, document_type, document_id, status, source,
              created_by, currency, reference, warnings, committed_at, created_at
            )
          `)
          .eq('company_id', company_id)
          .order('entry_date', { ascending: false });

        if (filters.date_from) jeQuery = jeQuery.gte('entry_date', filters.date_from);
        if (filters.date_to) jeQuery = jeQuery.lte('entry_date', filters.date_to);
        if (filters.financial_year_id && filters.financial_year_id !== 'all') {
          jeQuery = jeQuery.eq('financial_year_id', filters.financial_year_id);
        }
        if (filters.accounting_period_id && filters.accounting_period_id !== 'all') {
          jeQuery = jeQuery.eq('accounting_period_id', filters.accounting_period_id);
        }
        if (filters.journal_number) {
          jeQuery = jeQuery.ilike('journal_number', `%${filters.journal_number}%`);
        }

        // Cap header fetch then expand lines — for large ledgers use account filter + pagination on items
        const { data: journals, error: jeErr } = await jeQuery.limit(5000);
        if (jeErr) throw jeErr;

        let journalIds = (journals || []).map((j: any) => j.id);
        if (filters.module && filters.module !== 'all') {
          journalIds = (journals || [])
            .filter((j: any) => (j.posting_requests || []).some((pr: any) =>
              String(pr.module).toLowerCase() === String(filters.module).toLowerCase()
            ))
            .map((j: any) => j.id);
        }
        if (filters.source && filters.source !== 'all') {
          journalIds = (journals || [])
            .filter((j: any) => (j.posting_requests || []).some((pr: any) =>
              String(pr.source || '').toLowerCase() === String(filters.source).toLowerCase()
            ))
            .map((j: any) => j.id);
        }
        if (filters.document_type && filters.document_type !== 'all') {
          journalIds = (journals || [])
            .filter((j: any) => (j.posting_requests || []).some((pr: any) =>
              String(pr.document_type || '').toLowerCase() === String(filters.document_type).toLowerCase()
            ))
            .map((j: any) => j.id);
        }
        if (filters.status && filters.status !== 'all') {
          journalIds = (journals || [])
            .filter((j: any) => (j.posting_requests || []).some((pr: any) =>
              String(pr.status).toLowerCase() === String(filters.status).toLowerCase()
            ))
            .map((j: any) => j.id);
        }

        if (journalIds.length === 0) {
          data = { rows: [], total: 0, page, page_size: pageSize };
          break;
        }

        let itemsQuery = supabaseAdmin
          .from('journal_entry_items')
          .select(`
            id, amount, type, dimensions, project_id, reconciled,
            account_id,
            chart_of_accounts!account_id ( id, account_number, name, type, normal_balance ),
            journal_entry_id
          `, { count: 'exact' })
          .in('journal_entry_id', journalIds);

        if (filters.account_id && filters.account_id !== 'all') {
          itemsQuery = itemsQuery.eq('account_id', filters.account_id);
        }

        const { data: items, error: itemsErr, count } = await itemsQuery
          .range(offset, offset + pageSize - 1);
        if (itemsErr) throw itemsErr;

        const journalMap = Object.fromEntries((journals || []).map((j: any) => [j.id, j]));
        const companyName = (await supabaseAdmin.from('companies').select('name').eq('id', company_id).single()).data?.name;

        // Running balance when single account filter applied
        let openingBalance = 0;
        if (filters.account_id && filters.account_id !== 'all' && filters.date_from) {
          const { data: bal } = await userSupabase.rpc('get_balances_as_of_date', {
            p_end_date: dayBefore(filters.date_from),
            p_company_id: company_id,
          });
          const row = (bal || []).find((a: any) => a.id === filters.account_id);
          openingBalance = Number(row?.balance || 0);
        }

        // For running balance need chronological order within account — recompute on page when filtered
        let running = openingBalance;
        const accountMeta = filters.account_id && filters.account_id !== 'all'
          ? (items || [])[0]?.chart_of_accounts
          : null;
        const isDebitNormal = accountMeta ? DEBIT_NORMAL.has(accountMeta.type) : true;

        // When account-filtered, fetch prior page movement to seed running balance
        if (filters.account_id && filters.account_id !== 'all' && offset > 0) {
          const { data: priorItems } = await supabaseAdmin
            .from('journal_entry_items')
            .select('amount, type, journal_entry_id')
            .eq('account_id', filters.account_id)
            .in('journal_entry_id', journalIds)
            .range(0, offset - 1);
          for (const pi of priorItems || []) {
            const signed = pi.type === 'debit' ? Number(pi.amount) : -Number(pi.amount);
            running += isDebitNormal ? signed : -signed;
          }
        }

        const rows = (items || []).map((item: any) => {
          const je = journalMap[item.journal_entry_id] || {};
          const pr = (je.posting_requests || [])[0] || null;
          const signed = item.type === 'debit' ? Number(item.amount) : -Number(item.amount);
          if (filters.account_id && filters.account_id !== 'all') {
            running += isDebitNormal ? signed : -signed;
          }
          const docId = pr?.document_id || je.invoice_id || je.bill_id || null;
          const docType = pr?.document_type || (je.invoice_id ? 'invoice' : je.bill_id ? 'bill' : null);
          return {
            id: item.id,
            entry_date: je.entry_date,
            journal_number: je.journal_number || pr?.journal_number || null,
            journal_entry_id: item.journal_entry_id,
            document_type: docType,
            document_number: docId,
            document_route: sourceRoute(pr?.module, docType, docId),
            reference: pr?.reference || null,
            description: je.description,
            account_id: item.account_id,
            account_number: item.chart_of_accounts?.account_number,
            account_name: item.chart_of_accounts?.name,
            debit: item.type === 'debit' ? Number(item.amount) : 0,
            credit: item.type === 'credit' ? Number(item.amount) : 0,
            running_balance: filters.account_id && filters.account_id !== 'all' ? running : null,
            currency: pr?.currency || 'ZAR',
            posting_source: pr?.source || null,
            module: pr?.module || 'manual_journal',
            user: pr?.created_by || null,
            status: pr?.status || 'posted',
            company: companyName,
            financial_year: je.financial_years?.year_code || null,
            financial_year_id: je.financial_year_id,
            accounting_period: je.accounting_periods?.period_number ?? null,
            accounting_period_id: je.accounting_period_id,
            posting_request_id: pr?.id || null,
            attachment_url: je.attachment_url || null,
            dimensions: item.dimensions,
            project_id: item.project_id,
          };
        });

        data = { rows, total: count || 0, page, page_size: pageSize };
        break;
      }

      case 'GET_TRIAL_BALANCE': {
        const startDate = body.start_date;
        const endDate = body.end_date;
        if (!startDate || !endDate) throw new Error('start_date and end_date are required');

        const openingDate = dayBefore(startDate);

        const [{ data: opening }, { data: closing }, { data: accounts }] = await Promise.all([
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: openingDate, p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: endDate, p_company_id: company_id }),
          supabaseAdmin.from('chart_of_accounts')
            .select('id, account_number, name, type, normal_balance, control_account, is_active, category, subcategory')
            .eq('company_id', company_id)
            .order('account_number'),
        ]);

        // Period debit/credit from journal lines (all account types) — read model only
        const { data: journalsInPeriod } = await supabaseAdmin
          .from('journal_entries')
          .select('id')
          .eq('company_id', company_id)
          .gte('entry_date', startDate)
          .lte('entry_date', endDate);

        const jeIds = (journalsInPeriod || []).map((j: any) => j.id);
        let moveRows: any[] = [];
        if (jeIds.length) {
          // Chunk to stay within PostgREST URL limits
          for (let i = 0; i < jeIds.length; i += 200) {
            const chunk = jeIds.slice(i, i + 200);
            const { data: chunkRows } = await supabaseAdmin
              .from('journal_entry_items')
              .select('account_id, type, amount')
              .in('journal_entry_id', chunk);
            moveRows = moveRows.concat(chunkRows || []);
          }
        }

        const moves: Record<string, { debit: number; credit: number }> = {};
        for (const m of moveRows || []) {
          if (!moves[m.account_id]) moves[m.account_id] = { debit: 0, credit: 0 };
          if (m.type === 'debit') moves[m.account_id].debit += Number(m.amount);
          else moves[m.account_id].credit += Number(m.amount);
        }

        const openingMap = Object.fromEntries((opening || []).map((a: any) => [a.id, Number(a.balance)]));
        const closingMap = Object.fromEntries((closing || []).map((a: any) => [a.id, Number(a.balance)]));

        const rows = (accounts || []).map((acc: any) => {
          const openBal = openingMap[acc.id] ?? 0;
          const closeBal = closingMap[acc.id] ?? 0;
          const move = moves[acc.id] || { debit: 0, credit: 0 };
          const isDebit = DEBIT_NORMAL.has(acc.type);
          const normal = acc.normal_balance || (isDebit ? 'debit' : 'credit');

          const split = (bal: number) => {
            if (isDebit) {
              return bal >= 0
                ? { debit: bal, credit: 0 }
                : { debit: 0, credit: Math.abs(bal) };
            }
            return bal >= 0
              ? { debit: 0, credit: bal }
              : { debit: Math.abs(bal), credit: 0 };
          };

          const openSplit = split(openBal);
          const closeSplit = split(closeBal);
          const netMovement = closeBal - openBal;
          const flatHierarchy = resolveAccountHierarchy(acc);

          return {
            account_id: acc.id,
            account_number: acc.account_number,
            account_name: acc.name,
            account_type: acc.type,
            // Authoritative Chart of Accounts classification — never derived
            // from the account name, code, number, balance, or activity.
            category: acc.category ?? null,
            subcategory: acc.subcategory ?? null,
            classification_required: flatHierarchy.unclassified,
            hierarchy: `${flatHierarchy.l1} / ${flatHierarchy.l2}`,
            normal_balance: normal,
            opening_debit: openSplit.debit,
            opening_credit: openSplit.credit,
            period_debit: move.debit,
            period_credit: move.credit,
            closing_debit: closeSplit.debit,
            closing_credit: closeSplit.credit,
            net_movement: netMovement,
            control_account: acc.control_account,
            is_active: acc.is_active,
          };
        }).filter((r: any) =>
          r.opening_debit || r.opening_credit || r.period_debit || r.period_credit || r.closing_debit || r.closing_credit
        );

        const presentationColumnTotals = rows.reduce((acc: any, r: any) => ({
          opening_debit: acc.opening_debit + r.opening_debit,
          opening_credit: acc.opening_credit + r.opening_credit,
          period_debit: acc.period_debit + r.period_debit,
          period_credit: acc.period_credit + r.period_credit,
          closing_debit: acc.closing_debit + r.closing_debit,
          closing_credit: acc.closing_credit + r.closing_credit,
        }), { opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 0, closing_debit: 0, closing_credit: 0 });

        // Accounting totals (closing DR/CR + balanced) = CFA only.
        const cfa = await loadCanonicalAggregation({
          admin: supabaseAdmin,
          rpc: userSupabase,
          company_id,
          start_date: startDate,
          end_date: endDate,
          prior_date: openingDate,
        });

        data = {
          rows,
          totals: {
            ...presentationColumnTotals,
            closing_debit: cfa.totalDebits,
            closing_credit: cfa.totalCredits,
          },
          balanced: cfa.trialBalanceBalanced,
          canonicalAggregation: cfa,
          money_source: 'canonical_financial_aggregation',
          start_date: startDate,
          end_date: endDate,
        };
        break;
      }

      case 'GET_POSTING_REQUESTS': {
        const { page, pageSize, offset } = clampPage(body.page, body.page_size);
        const filters = body.filters || {};

        let q = supabaseAdmin
          .from('posting_requests')
          .select(`
            id, status, module, document_type, document_id, reference, description,
            currency, source, created_by, created_at, committed_at, warnings,
            journal_entry_id, journal_number, financial_year_id, accounting_period_id,
            idempotency_key, posting_engine_version, correlation_id,
            financial_years ( year_code ),
            accounting_periods ( period_number, status, start_date, end_date )
          `, { count: 'exact' })
          .eq('company_id', company_id)
          .order('created_at', { ascending: false });

        if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
        if (filters.module && filters.module !== 'all') q = q.eq('module', filters.module);
        if (filters.document_type && filters.document_type !== 'all') q = q.eq('document_type', filters.document_type);
        if (filters.financial_year_id && filters.financial_year_id !== 'all') q = q.eq('financial_year_id', filters.financial_year_id);
        if (filters.accounting_period_id && filters.accounting_period_id !== 'all') q = q.eq('accounting_period_id', filters.accounting_period_id);
        if (filters.date_from) q = q.gte('created_at', `${filters.date_from}T00:00:00`);
        if (filters.date_to) q = q.lte('created_at', `${filters.date_to}T23:59:59`);
        if (filters.search) {
          const s = `%${filters.search}%`;
          q = q.or(`journal_number.ilike.${s},reference.ilike.${s},description.ilike.${s},idempotency_key.ilike.${s}`);
        }

        const { data: rows, error: prErr, count } = await q.range(offset, offset + pageSize - 1);
        if (prErr) throw prErr;

        data = {
          rows: (rows || []).map((r: any) => {
            const warnings = Array.isArray(r.warnings) ? r.warnings : (r.warnings ? [r.warnings] : []);
            const stuckPending = r.status === 'pending' &&
              new Date(r.created_at).getTime() < Date.now() - 15 * 60 * 1000;
            return {
              ...r,
              posting_date: r.committed_at || r.created_at,
              validation_status: stuckPending ? 'failed' : (warnings.length ? 'warnings' : (r.status === 'committed' ? 'ok' : r.status)),
              warning_count: warnings.length,
              error_count: stuckPending ? 1 : 0,
              errors: stuckPending ? ['Posting request pending beyond SLA'] : [],
              warnings,
              document_route: sourceRoute(r.module, r.document_type, r.document_id),
              financial_year: r.financial_years?.year_code || null,
              accounting_period: r.accounting_periods?.period_number ?? null,
            };
          }),
          total: count || 0,
          page,
          page_size: pageSize,
        };
        break;
      }

      case 'GET_POSTING_TIMELINE': {
        const prId = body.posting_request_id;
        if (!prId) throw new Error('posting_request_id required');
        const { data: pr, error: prErr } = await supabaseAdmin
          .from('posting_requests')
          .select('*')
          .eq('id', prId)
          .eq('company_id', company_id)
          .single();
        if (prErr) throw prErr;

        const created = pr.created_at ? new Date(pr.created_at).getTime() : null;
        const committed = pr.committed_at ? new Date(pr.committed_at).getTime() : null;
        const durationMs = created && committed ? committed - created : null;
        const warnings = Array.isArray(pr.warnings) ? pr.warnings : [];

        data = {
          posting_request_id: pr.id,
          created: pr.created_at,
          validated: pr.created_at, // validate occurs before commit in engine; stamp approximated
          posted: pr.committed_at,
          journal_created: pr.committed_at,
          ledger_updated: pr.committed_at,
          posted_by: pr.created_by,
          duration_ms: durationMs,
          duration_label: durationMs != null ? `${(durationMs / 1000).toFixed(2)}s` : null,
          warnings,
          status: pr.status,
          journal_number: pr.journal_number,
          journal_entry_id: pr.journal_entry_id,
          module: pr.module,
          document_type: pr.document_type,
          document_id: pr.document_id,
        };
        break;
      }

      case 'GET_TRACEABILITY': {
        // Resolve full chain from any anchor
        const { journal_entry_id, posting_request_id, account_id, document_id } = body;
        let pr: any = null;
        let journal: any = null;

        if (posting_request_id) {
          const { data: row } = await supabaseAdmin.from('posting_requests').select('*')
            .eq('id', posting_request_id).eq('company_id', company_id).maybeSingle();
          pr = row;
        }
        if (!pr && journal_entry_id) {
          const { data: row } = await supabaseAdmin.from('posting_requests').select('*')
            .eq('journal_entry_id', journal_entry_id).eq('company_id', company_id).maybeSingle();
          pr = row;
        }
        if (!pr && document_id) {
          const { data: row } = await supabaseAdmin.from('posting_requests').select('*')
            .eq('document_id', document_id).eq('company_id', company_id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          pr = row;
        }

        const jeId = journal_entry_id || pr?.journal_entry_id;
        if (jeId) {
          const { data: je } = await supabaseAdmin
            .from('journal_entries')
            .select(`
              *,
              journal_entry_items (
                id, type, amount, dimensions, project_id, account_id,
                chart_of_accounts!account_id ( id, account_number, name, type )
              ),
              financial_years ( year_code ),
              accounting_periods ( period_number, status )
            `)
            .eq('id', jeId)
            .eq('company_id', company_id)
            .maybeSingle();
          journal = je;
        }

        const { data: audit } = await supabaseAdmin
          .from('audit_logs')
          .select('*')
          .eq('company_id', company_id)
          .or([
            jeId ? `and(table_name.eq.journal_entries,record_id.eq.${jeId})` : null,
            pr?.id ? `and(table_name.eq.posting_requests,record_id.eq.${pr.id})` : null,
          ].filter(Boolean).join(','))
          .order('created_at', { ascending: false })
          .limit(50);

        data = {
          business_document: pr ? {
            document_type: pr.document_type,
            document_id: pr.document_id,
            route: sourceRoute(pr.module, pr.document_type, pr.document_id),
            reference: pr.reference,
            description: pr.description,
          } : null,
          posting_request: pr,
          journal_entry: journal ? {
            id: journal.id,
            journal_number: journal.journal_number,
            entry_date: journal.entry_date,
            description: journal.description,
            attachment_url: journal.attachment_url,
            financial_year: journal.financial_years?.year_code,
            accounting_period: journal.accounting_periods?.period_number,
          } : null,
          journal_lines: journal?.journal_entry_items || [],
          original_module: pr?.module || null,
          audit_trail: audit || [],
          attachments: journal?.attachment_url ? [{ url: journal.attachment_url, label: 'Journal attachment' }] : [],
          account_filter: account_id || null,
          chain: ['business_document', 'posting_request', 'journal_entry', 'journal_lines', 'general_ledger', 'trial_balance'],
        };
        break;
      }

      case 'GET_ACCOUNT_INQUIRY': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        // Reporting dates come from the caller's reporting-period authority when
        // supplied. The previous fallback derived the year start as
        // `${year}-01-01`, which silently assumes a CALENDAR financial year and
        // is wrong for any company whose financial year does not start in
        // January. The fallback is retained only for callers that pass no dates,
        // so behaviour is unchanged for them. No balance math is altered.
        const today = body.end_date ?? new Date().toISOString().slice(0, 10);
        const yearStart = body.start_date ?? `${today.slice(0, 4)}-01-01`;

        const [{ data: account }, { data: closing }, { data: opening }, { data: ytd }, { data: recentPr }, { data: recentLines }] = await Promise.all([
          supabaseAdmin.from('chart_of_accounts').select('*').eq('id', accountId).eq('company_id', company_id).single(),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: today, p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(yearStart), p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: today, p_company_id: company_id }),
          supabaseAdmin.from('posting_requests')
            .select('id, journal_number, module, status, committed_at, document_type, document_id')
            .eq('company_id', company_id)
            .eq('status', 'committed')
            .order('committed_at', { ascending: false })
            .limit(20),
          supabaseAdmin.from('journal_entry_items')
            .select(`
              id, type, amount,
              journal_entries!inner ( id, journal_number, entry_date, description, company_id )
            `)
            .eq('account_id', accountId)
            .eq('journal_entries.company_id', company_id)
            .order('entry_date', { foreignTable: 'journal_entries', ascending: false })
            .limit(15),
        ]);

        const closeBal = (closing || []).find((a: any) => a.id === accountId)?.balance ?? 0;
        const openBal = (opening || []).find((a: any) => a.id === accountId)?.balance ?? 0;
        const ytdBal = (ytd || []).find((a: any) => a.id === accountId)?.balance ?? 0;

        data = {
          account,
          current_balance: Number(closeBal),
          opening_balance: Number(openBal),
          period_movement: Number(closeBal) - Number(openBal),
          ytd_movement: Number(ytdBal) - Number(openBal),
          recent_journals: (recentLines || []).map((l: any) => ({
            journal_entry_id: l.journal_entries?.id,
            journal_number: l.journal_entries?.journal_number,
            entry_date: l.journal_entries?.entry_date,
            description: l.journal_entries?.description,
            debit: l.type === 'debit' ? Number(l.amount) : 0,
            credit: l.type === 'credit' ? Number(l.amount) : 0,
          })),
          recent_documents: (recentPr.data || []).slice(0, 10),
          linked_bank_account: null,
          linked_tax: null,
          linked_control_accounts: account?.control_account ? [account] : [],
        };
        break;
      }

      case 'GET_EXCEPTIONS': {
        const issues: any[] = [];

        // Unbalanced journals (sample recent)
        const { data: journals } = await supabaseAdmin
          .from('journal_entries')
          .select('id, journal_number, entry_date, description, journal_entry_items(type, amount)')
          .eq('company_id', company_id)
          .order('entry_date', { ascending: false })
          .limit(200);
        for (const j of journals || []) {
          const items = j.journal_entry_items || [];
          const d = items.filter((i: any) => i.type === 'debit').reduce((s: number, i: any) => s + Number(i.amount), 0);
          const c = items.filter((i: any) => i.type === 'credit').reduce((s: number, i: any) => s + Number(i.amount), 0);
          if (Math.abs(d - c) >= 0.005) {
            issues.push({
              type: 'unbalanced_journal',
              severity: 'critical',
              title: `Unbalanced journal ${j.journal_number || j.id.slice(0, 8)}`,
              detail: `Debit ${d.toFixed(2)} ≠ Credit ${c.toFixed(2)}`,
              journal_entry_id: j.id,
              route: `/journal-entries`,
            });
          }
        }

        // Stuck pending posting requests
        const { data: pending } = await supabaseAdmin
          .from('posting_requests')
          .select('id, module, document_type, document_id, created_at, reference, journal_number')
          .eq('company_id', company_id)
          .eq('status', 'pending')
          .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .limit(50);
        for (const p of pending || []) {
          issues.push({
            type: 'failed_posting_request',
            severity: 'high',
            title: `Pending posting ${p.journal_number || p.id.slice(0, 8)}`,
            detail: `${p.module} / ${p.document_type || 'document'} since ${p.created_at}`,
            posting_request_id: p.id,
            route: `/accounting/posting-requests`,
          });
        }

        // Warnings on committed requests
        const { data: warned } = await supabaseAdmin
          .from('posting_requests')
          .select('id, module, warnings, journal_number, document_type')
          .eq('company_id', company_id)
          .eq('status', 'committed')
          .neq('warnings', '[]')
          .order('committed_at', { ascending: false })
          .limit(40);
        for (const w of warned || []) {
          const warnings = Array.isArray(w.warnings) ? w.warnings : [];
          if (!warnings.length) continue;
          const text = JSON.stringify(warnings);
          const type = /map|coa|account/i.test(text) ? 'missing_coa_mapping'
            : /period|closed/i.test(text) ? 'closed_period_posting'
            : /duplicate/i.test(text) ? 'duplicate_posting_request'
            : /suspense/i.test(text) ? 'suspense_item'
            : /unmapped|category/i.test(text) ? 'unmapped_category'
            : /reference|broken/i.test(text) ? 'broken_reference'
            : 'posting_warning';
          issues.push({
            type,
            severity: 'medium',
            title: `Warning on ${w.journal_number || w.id.slice(0, 8)}`,
            detail: text.slice(0, 240),
            posting_request_id: w.id,
            route: `/accounting/posting-requests`,
          });
        }

        // Duplicate document postings
        const { data: allPr } = await supabaseAdmin
          .from('posting_requests')
          .select('id, document_id, document_type, status, journal_number')
          .eq('company_id', company_id)
          .eq('status', 'committed')
          .not('document_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500);
        const seen = new Map<string, string>();
        for (const r of allPr || []) {
          const key = `${r.document_type}:${r.document_id}`;
          if (seen.has(key)) {
            issues.push({
              type: 'duplicate_posting_request',
              severity: 'high',
              title: `Duplicate posting for ${r.document_type}`,
              detail: `Documents ${r.document_id} has multiple committed posting requests`,
              posting_request_id: r.id,
              route: `/accounting/posting-requests`,
            });
          } else {
            seen.set(key, r.id);
          }
        }

        // Suspense accounts with balances
        const { data: suspenseAccounts } = await supabaseAdmin
          .from('chart_of_accounts')
          .select('id, account_number, name, control_account')
          .eq('company_id', company_id)
          .or('account_role.eq.suspense,control_account.eq.true');
        const { data: bals } = await userSupabase.rpc('get_balances_as_of_date', {
          p_end_date: new Date().toISOString().slice(0, 10),
          p_company_id: company_id,
        });
        for (const a of suspenseAccounts || []) {
          const bal = Number((bals || []).find((b: any) => b.id === a.id)?.balance || 0);
          if (Math.abs(bal) > 0.005) {
            issues.push({
              type: 'suspense_item',
              severity: 'medium',
              title: `Suspense/control balance: ${a.account_number} ${a.name}`,
              detail: `Balance ${bal.toFixed(2)} requires clearance`,
              account_id: a.id,
              route: `/general-ledger?account_id=${a.id}`,
            });
          }
        }

        data = { issues, counts: issues.reduce((acc: any, i: any) => {
          acc[i.type] = (acc[i.type] || 0) + 1;
          acc.total = (acc.total || 0) + 1;
          return acc;
        }, { total: 0 }) };
        break;
      }

      case 'GET_ACCOUNTING_SEARCH': {
        const q = String(body.query || '').trim();
        if (!q || q.length < 2) {
          data = { results: [] };
          break;
        }
        const like = `%${q}%`;
        const [journals, prs, accounts, vendors, customers, employees, assets, bankTx] = await Promise.all([
          supabaseAdmin.from('journal_entries')
            .select('id, journal_number, entry_date, description')
            .eq('company_id', company_id)
            .or(`journal_number.ilike.${like},description.ilike.${like}`)
            .limit(12),
          supabaseAdmin.from('posting_requests')
            .select('id, journal_number, reference, description, module, document_type, document_id, status')
            .eq('company_id', company_id)
            .or(`journal_number.ilike.${like},reference.ilike.${like},description.ilike.${like},document_id.eq.${q}`)
            .limit(12),
          supabaseAdmin.from('chart_of_accounts')
            .select('id, account_number, name, type')
            .eq('company_id', company_id)
            .ilike('name', like)
            .limit(12),
          supabaseAdmin.from('vendors').select('id, name').eq('company_id', company_id).ilike('name', like).limit(8),
          supabaseAdmin.from('customers').select('id, name').eq('company_id', company_id).ilike('name', like).limit(8),
          supabaseAdmin.from('employees').select('id, first_name, last_name, employee_number').eq('company_id', company_id)
            .or(`first_name.ilike.${like},last_name.ilike.${like},employee_number.ilike.${like}`).limit(8)
            .then((r) => r).catch(() => ({ data: [] })),
          supabaseAdmin.from('fixed_assets').select('id, description, asset_code').eq('company_id', company_id)
            .or(`description.ilike.${like},asset_code.ilike.${like}`).limit(8)
            .then((r) => r).catch(() => ({ data: [] })),
          supabaseAdmin.from('bank_transactions').select('id, description, reference, amount, transaction_date')
            .eq('company_id', company_id)
            .or(`description.ilike.${like},reference.ilike.${like}`)
            .limit(8)
            .then((r) => r).catch(() => ({ data: [] })),
        ]);

        if (/^\d+$/.test(q)) {
          const { data: byNumber } = await supabaseAdmin.from('chart_of_accounts')
            .select('id, account_number, name, type')
            .eq('company_id', company_id)
            .eq('account_number', Number(q))
            .limit(5);
          if (byNumber?.length) accounts.data = [...(byNumber || []), ...(accounts.data || [])];
        }

        // Invoices / bills by number
        const [invoices, bills] = await Promise.all([
          supabaseAdmin.from('invoices').select('id, invoice_number').eq('company_id', company_id).ilike('invoice_number', like).limit(8),
          supabaseAdmin.from('bills').select('id, bill_number').eq('company_id', company_id).ilike('bill_number', like).limit(8),
        ]);

        const results: any[] = [];
        for (const j of journals.data || []) {
          results.push({ kind: 'journal', id: j.id, label: j.journal_number || j.id.slice(0, 8), subtitle: j.description, route: `/journal-entries`, journal_entry_id: j.id });
        }
        for (const p of prs.data || []) {
          results.push({
            kind: 'posting_request', id: p.id,
            label: p.journal_number || p.reference || p.id.slice(0, 8),
            subtitle: `${p.module} · ${p.status}`,
            route: `/accounting/posting-requests`, posting_request_id: p.id,
            document_route: sourceRoute(p.module, p.document_type, p.document_id),
          });
        }
        for (const a of accounts.data || []) {
          results.push({ kind: 'account', id: a.id, label: `${a.account_number} — ${a.name}`, subtitle: a.type, route: `/general-ledger?account_id=${a.id}`, account_id: a.id });
        }
        for (const v of vendors.data || []) {
          results.push({ kind: 'vendor', id: v.id, label: v.name, subtitle: 'Vendor', route: `/vendors/${v.id}` });
        }
        for (const c of customers.data || []) {
          results.push({ kind: 'customer', id: c.id, label: c.name, subtitle: 'Customer', route: `/customers/${c.id}` });
        }
        for (const e of (employees.data || [])) {
          results.push({ kind: 'employee', id: e.id, label: `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.employee_number, subtitle: e.employee_number || 'Employee', route: `/employees` });
        }
        for (const a of (assets.data || [])) {
          results.push({ kind: 'asset', id: a.id, label: a.description || a.asset_code, subtitle: a.asset_code || 'Asset', route: `/fixed-assets/${a.id}` });
        }
        for (const t of (bankTx.data || [])) {
          results.push({ kind: 'bank_transaction', id: t.id, label: t.reference || t.description || t.id.slice(0, 8), subtitle: `${t.transaction_date} · ${t.amount}`, route: `/banking/transactions` });
        }
        for (const inv of invoices.data || []) {
          results.push({ kind: 'invoice', id: inv.id, label: inv.invoice_number, subtitle: 'Invoice', route: `/invoices/${inv.id}` });
        }
        for (const bill of bills.data || []) {
          results.push({ kind: 'bill', id: bill.id, label: bill.bill_number || bill.id.slice(0, 8), subtitle: 'Bill', route: `/bills` });
        }
        // Quick Capture — frozen module; surface route only when query matches
        if (/quick|capture|expense/i.test(q)) {
          results.push({ kind: 'quick_capture', id: 'qc', label: 'Quick Capture', subtitle: 'Open Quick Capture workspace', route: '/purchases/quick-capture' });
        }
        data = { results };
        break;
      }

      case 'GET_ACCOUNTING_AUDIT': {
        const { page, pageSize, offset } = clampPage(body.page, body.page_size);
        const tableName = body.table_name && body.table_name !== 'all' ? body.table_name : null;
        const accountingTables = [
          'journal_entries', 'journal_entry_items', 'posting_requests',
          'chart_of_accounts', 'financial_years', 'accounting_periods',
        ];
        let q = supabaseAdmin
          .from('audit_logs')
          .select('*', { count: 'exact' })
          .eq('company_id', company_id)
          .order('created_at', { ascending: false });
        if (tableName) q = q.eq('table_name', tableName);
        else q = q.in('table_name', accountingTables);

        const { data: rows, error: aErr, count } = await q.range(offset, offset + pageSize - 1);
        if (aErr) throw aErr;
        data = { rows: rows || [], total: count || 0, page, page_size: pageSize };
        break;
      }

      case 'GET_FINANCIAL_PERIODS': {
        const { data: periods, error: pErr } = await supabaseAdmin
          .from('accounting_periods')
          .select('*, financial_years ( id, year_code, status, start_date, end_date )')
          .eq('company_id', company_id)
          .order('start_date', { ascending: false });
        if (pErr) throw pErr;
        data = periods || [];
        break;
      }

      case 'GET_FINANCIAL_YEARS': {
        const { data: years, error: yErr } = await supabaseAdmin
          .from('financial_years')
          .select('*')
          .eq('company_id', company_id)
          .order('start_date', { ascending: false });
        if (yErr) throw yErr;
        data = years || [];
        break;
      }

      // ── Phase 4B — Accountant Experience read models ─────────────────────

      case 'GET_ACCOUNT_ACTIVITY_WORKSPACE': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const { page, pageSize, offset } = clampPage(body.page, body.page_size);
        const startDate = body.start_date || `${new Date().getFullYear()}-01-01`;
        const endDate = body.end_date || new Date().toISOString().slice(0, 10);
        const groupBy = body.group_by || 'day';

        const { data: account } = await supabaseAdmin
          .from('chart_of_accounts').select('*').eq('id', accountId).eq('company_id', company_id).single();
        if (!account) throw new Error('Account not found');

        const monthStart = `${endDate.slice(0, 7)}-01`;
        const yearStart = `${endDate.slice(0, 4)}-01-01`;

        const [{ data: asOfNow }, { data: asOfOpen }, { data: asOfYtdOpen }, { data: asOfMonthOpen }] = await Promise.all([
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: endDate, p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(startDate), p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(yearStart), p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(monthStart), p_company_id: company_id }),
        ]);

        const bal = (rows: any[]) => Number((rows || []).find((a: any) => a.id === accountId)?.balance || 0);
        const current = bal(asOfNow);
        const opening = bal(asOfOpen);
        const ytdOpen = bal(asOfYtdOpen);
        const monthOpen = bal(asOfMonthOpen);

        // Journals in range touching this account
        const { data: jeHeaders } = await supabaseAdmin
          .from('journal_entries')
          .select(`
            id, entry_date, description, journal_number, vendor_id, customer_id, attachment_url,
            financial_year_id, accounting_period_id, created_at,
            vendors ( name ), customers ( name ),
            posting_requests!journal_entry_id ( id, module, document_type, document_id, status, source, created_by, reference, committed_at ),
            accounting_periods ( period_number ),
            financial_years ( year_code )
          `)
          .eq('company_id', company_id)
          .gte('entry_date', startDate)
          .lte('entry_date', endDate)
          .order('entry_date', { ascending: true })
          .limit(8000);

        const jeMap = Object.fromEntries((jeHeaders || []).map((j: any) => [j.id, j]));
        const jeIds = Object.keys(jeMap);

        let allItems: any[] = [];
        for (let i = 0; i < jeIds.length; i += 200) {
          const chunk = jeIds.slice(i, i + 200);
          if (!chunk.length) break;
          const { data: chunkItems } = await supabaseAdmin
            .from('journal_entry_items')
            .select('id, account_id, type, amount, journal_entry_id, dimensions, project_id')
            .eq('account_id', accountId)
            .in('journal_entry_id', chunk);
          allItems = allItems.concat(chunkItems || []);
        }

        // Chronological for running balance
        allItems.sort((a, b) => {
          const da = jeMap[a.journal_entry_id]?.entry_date || '';
          const db = jeMap[b.journal_entry_id]?.entry_date || '';
          return da < db ? -1 : da > db ? 1 : 0;
        });

        const isDebitNormal = DEBIT_NORMAL.has(account.type);
        let running = opening;
        let largest = 0, largestDebit = 0, largestCredit = 0;
        const moduleSet = new Set<string>();
        const activities = allItems.map((item: any) => {
          const je = jeMap[item.journal_entry_id] || {};
          const pr = (je.posting_requests || [])[0] || null;
          const debit = item.type === 'debit' ? Number(item.amount) : 0;
          const credit = item.type === 'credit' ? Number(item.amount) : 0;
          const signed = isDebitNormal ? (debit - credit) : (credit - debit);
          running += signed;
          largest = Math.max(largest, debit, credit);
          largestDebit = Math.max(largestDebit, debit);
          largestCredit = Math.max(largestCredit, credit);
          if (pr?.module) moduleSet.add(pr.module);
          return {
            id: item.id,
            entry_date: je.entry_date,
            module: pr?.module || 'manual_journal',
            document_type: pr?.document_type || null,
            document_id: pr?.document_id || null,
            document_route: sourceRoute(pr?.module, pr?.document_type, pr?.document_id),
            reference: pr?.reference || null,
            description: je.description,
            debit,
            credit,
            running_balance: running,
            journal_number: je.journal_number,
            journal_entry_id: item.journal_entry_id,
            posting_request_id: pr?.id || null,
            posting_status: pr?.status || 'posted',
            created_by: pr?.created_by || null,
            source: pr?.source || null,
            vendor_name: Array.isArray(je.vendors) ? je.vendors[0]?.name : je.vendors?.name,
            customer_name: Array.isArray(je.customers) ? je.customers[0]?.name : je.customers?.name,
            period_number: je.accounting_periods?.period_number ?? null,
            year_code: je.financial_years?.year_code ?? null,
            attachment_url: je.attachment_url || null,
            amount: Math.max(debit, credit),
          };
        });

        const total = activities.length;
        const pageRows = activities.slice(offset, offset + pageSize);
        const monthsSpan = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (30 * 86400000)));
        const lastPosting = activities.length ? activities[activities.length - 1].entry_date : null;

        // Group keys for client fold
        const groups: Record<string, number> = {};
        for (const a of activities) {
          let key = a.entry_date;
          if (groupBy === 'month') key = a.entry_date?.slice(0, 7) || 'unknown';
          else if (groupBy === 'week') {
            const d = new Date(`${a.entry_date}T00:00:00Z`);
            const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getUTCDay() + 1) / 7);
            key = `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
          } else if (groupBy === 'period') key = a.period_number != null ? `P${a.period_number}` : 'unassigned';
          else if (groupBy === 'year') key = a.year_code || a.entry_date?.slice(0, 4) || 'unknown';
          groups[key] = (groups[key] || 0) + 1;
        }

        data = {
          header: {
            account_id: account.id,
            account_number: account.account_number,
            account_name: account.name,
            account_type: account.type,
            normal_balance: account.normal_balance || (isDebitNormal ? 'debit' : 'credit'),
            status: account.is_active === false ? 'inactive' : (account.posting_blocked ? 'blocked' : 'active'),
            current_balance: current,
            opening_balance: opening,
            period_movement: current - opening,
            ytd_movement: current - ytdOpen,
            month_movement: current - monthOpen,
            last_posting_date: lastPosting,
            transaction_count: total,
            average_monthly_activity: total / monthsSpan,
            largest_transaction: largest,
            largest_debit: largestDebit,
            largest_credit: largestCredit,
            linked_modules: Array.from(moduleSet),
            control_account: !!account.control_account,
            allow_manual_posting: account.allow_manual_posting !== false,
          },
          activities: pageRows,
          total,
          page,
          page_size: pageSize,
          group_by: groupBy,
          group_counts: groups,
          start_date: startDate,
          end_date: endDate,
        };
        break;
      }

      // Phase 4C Part 2: these three handlers used to chunk-fetch every
      // journal line for the window into memory and aggregate in JS. They
      // now delegate to the certified Phase 4C RPCs (get_account_movement_*)
      // for every aggregate figure, and use a single server-ordered/limited
      // query (no chunking) for the two genuinely row-level lists
      // (top/largest individual transactions) that no aggregate RPC can
      // produce. Output shape is unchanged, so ExplainerPanel/AnalyticsPanel/
      // SourcePanel in GeneralLedger.tsx did not need to change.
      case 'GET_ACCOUNT_BALANCE_EXPLAINER': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const endDate = body.end_date || new Date().toISOString().slice(0, 10);
        const monthStart = `${endDate.slice(0, 7)}-01`;

        const [
          { data: nowBal }, { data: monthOpenBal },
          { data: byModuleRows }, { data: byVendorRows }, { data: byCustomerRows },
          { data: topTxRows },
        ] = await Promise.all([
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: endDate, p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(monthStart), p_company_id: company_id }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: monthStart, p_end_date: endDate, p_dimension: 'module' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: monthStart, p_end_date: endDate, p_dimension: 'vendor' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: monthStart, p_end_date: endDate, p_dimension: 'customer' }),
          supabaseAdmin.from('journal_entry_items')
            .select('type, amount, journal_entry_id, journal_entries!inner(journal_number, entry_date, description, company_id, posting_requests!journal_entry_id(module))')
            .eq('account_id', accountId).eq('journal_entries.company_id', company_id)
            .gte('journal_entries.entry_date', monthStart).lte('journal_entries.entry_date', endDate)
            .order('amount', { ascending: false }).limit(10),
        ]);

        const current = Number((nowBal || []).find((a: any) => a.id === accountId)?.balance || 0);
        const monthOpen = Number((monthOpenBal || []).find((a: any) => a.id === accountId)?.balance || 0);

        const toContribList = (rows: any[]) => (rows || [])
          .map((r) => ({ name: r.bucket_label, amount: Number(r.amount) }))
          .filter((x) => x.name)
          .sort((a, b) => b.amount - a.amount);

        const byModule = toContribList(byModuleRows);
        const moduleAmount = (needle: string) =>
          byModule.filter((m) => m.name.toLowerCase().includes(needle)).reduce((s, m) => s + m.amount, 0);

        const topTx = (topTxRows || []).map((it: any) => {
          const je = it.journal_entries;
          const pr = (je?.posting_requests || [])[0];
          return {
            journal_entry_id: it.journal_entry_id,
            journal_number: je?.journal_number,
            entry_date: je?.entry_date,
            description: je?.description,
            module: pr?.module || 'manual_journal',
            debit: it.type === 'debit' ? Number(it.amount) : 0,
            credit: it.type === 'credit' ? Number(it.amount) : 0,
            amount: Number(it.amount),
          };
        });

        data = {
          current_balance: current,
          month_change: current - monthOpen,
          top_transactions: topTx,
          top_modules: byModule.slice(0, 10),
          top_vendors: toContribList(byVendorRows).slice(0, 10),
          top_customers: toContribList(byCustomerRows).slice(0, 10),
          contributions: {
            quick_capture: moduleAmount('quick') + moduleAmount('capture'),
            manual_journal: moduleAmount('manual'),
            banking: moduleAmount('banking') + moduleAmount('bank'),
            payroll: moduleAmount('payroll'),
            inventory: moduleAmount('inventory'),
            purchases: moduleAmount('payable') + moduleAmount('purchase'),
            sales: moduleAmount('sales') + moduleAmount('invoice'),
            fixed_assets: moduleAmount('fixed') + moduleAmount('asset'),
          },
        };
        break;
      }

      case 'GET_ACCOUNT_ANALYTICS': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const endDate = body.end_date || new Date().toISOString().slice(0, 10);
        const startDate = body.start_date || `${Number(endDate.slice(0, 4)) - 1}-${endDate.slice(5)}`;

        const [{ data: monthSeries }, { data: daySeries }, { data: largestRows }] = await Promise.all([
          userSupabase.rpc('get_account_movement_series', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_granularity: 'month' }),
          userSupabase.rpc('get_account_movement_series', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_granularity: 'day' }),
          supabaseAdmin.from('journal_entry_items')
            .select('type, amount, journal_entry_id, journal_entries!inner(entry_date, company_id)')
            .eq('account_id', accountId).eq('journal_entries.company_id', company_id)
            .gte('journal_entries.entry_date', startDate).lte('journal_entries.entry_date', endDate)
            .order('amount', { ascending: false }).limit(15),
        ]);

        const monthlySeries = (monthSeries || []).map((s: any) => ({
          month: String(s.bucket_date).slice(0, 7),
          debit: Number(s.debit_total),
          credit: Number(s.credit_total),
          count: Number(s.txn_count),
          net: Number(s.debit_total) - Number(s.credit_total),
        }));
        const ytdSeries = monthlySeries.filter((m) => m.month.startsWith(endDate.slice(0, 4)));

        const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const byDow: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
        for (const d of daySeries || []) {
          const dt = new Date(`${d.bucket_date}T00:00:00Z`);
          byDow[dowNames[dt.getUTCDay()]] += Number(d.txn_count);
        }

        const totalCount = monthlySeries.reduce((s, m) => s + m.count, 0);
        const totalAmt = (monthSeries || []).reduce((s: number, m: any) => s + Number(m.debit_total) + Number(m.credit_total), 0);

        const largestHistory = (largestRows || []).map((it: any) => ({
          date: it.journal_entries?.entry_date, amount: Number(it.amount), type: it.type, journal_entry_id: it.journal_entry_id,
        }));

        data = {
          monthly_movement: monthlySeries,
          ytd_movement: ytdSeries,
          debit_credit_trend: monthlySeries.map((m) => ({ month: m.month, debit: m.debit, credit: m.credit })),
          transaction_volume: totalCount,
          average_transaction_size: totalCount ? totalAmt / totalCount : 0,
          largest_transaction_history: largestHistory,
          most_active_posting_days: Object.entries(byDow).map(([day, count]) => ({ day, count })),
        };
        break;
      }

      case 'GET_ACCOUNT_SOURCE_ANALYSIS': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const startDate = body.start_date || `${new Date().getFullYear()}-01-01`;
        const endDate = body.end_date || new Date().toISOString().slice(0, 10);

        const [{ data: byModule }, { data: byVendor }, { data: byCustomer }, { data: byProject }, { data: byDocType }, { data: monthSeries }] = await Promise.all([
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'module' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'vendor' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'customer' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'project' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'document_type' }),
          userSupabase.rpc('get_account_movement_series', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_granularity: 'month' }),
        ]);

        const toList = (rows: any[]) => (rows || [])
          .map((r) => ({ name: r.bucket_label, amount: Number(r.amount) }))
          .filter((x) => x.name)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 20);

        data = {
          by_module: toList(byModule),
          by_vendor: toList(byVendor),
          by_customer: toList(byCustomer),
          // Employee/Asset/Inventory/Dimension contribution: not fabricated.
          // journal_entry_items carries no employee/asset/product FK and no
          // RPC buckets the dimensions jsonb column yet — see Phase 4C audit
          // finding #5. The Contributions tab renders these as an explicit
          // "Not yet available" state rather than a silent empty list.
          by_employee: [],
          by_project: toList(byProject),
          by_document_type: toList(byDocType),
          by_month: (monthSeries || []).map((s: any) => ({ name: String(s.bucket_date).slice(0, 7), amount: Number(s.debit_total) - Number(s.credit_total) })).sort((a, b) => b.amount - a.amount).slice(0, 20),
          by_category: toList(byModule),
        };
        break;
      }

      case 'GET_TRIAL_BALANCE_EXPAND': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const startDate = body.start_date;
        const endDate = body.end_date || new Date().toISOString().slice(0, 10);
        if (!startDate) throw new Error('start_date required');

        const [{ data: account }, inquiry, { data: lines }, { data: prs }] = await Promise.all([
          supabaseAdmin.from('chart_of_accounts').select('*').eq('id', accountId).eq('company_id', company_id).single(),
          (async () => {
            const [{ data: open }, { data: close }] = await Promise.all([
              userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(startDate), p_company_id: company_id }),
              userSupabase.rpc('get_balances_as_of_date', { p_end_date: endDate, p_company_id: company_id }),
            ]);
            return {
              opening: Number((open || []).find((a: any) => a.id === accountId)?.balance || 0),
              current: Number((close || []).find((a: any) => a.id === accountId)?.balance || 0),
            };
          })(),
          supabaseAdmin.from('journal_entry_items')
            .select(`
              id, type, amount,
              journal_entries!inner ( id, journal_number, entry_date, description, company_id, attachment_url )
            `)
            .eq('account_id', accountId)
            .eq('journal_entries.company_id', company_id)
            .gte('journal_entries.entry_date', startDate)
            .lte('journal_entries.entry_date', endDate)
            .order('entry_date', { foreignTable: 'journal_entries', ascending: false })
            .limit(12),
          supabaseAdmin.from('posting_requests')
            .select('id, journal_number, module, status, document_type, document_id, committed_at, journal_entry_id')
            .eq('company_id', company_id)
            .eq('status', 'committed')
            .order('committed_at', { ascending: false })
            .limit(40),
        ]);

        const recent = (lines || []).map((l: any) => ({
          id: l.id,
          journal_entry_id: l.journal_entries?.id,
          journal_number: l.journal_entries?.journal_number,
          entry_date: l.journal_entries?.entry_date,
          description: l.journal_entries?.description,
          debit: l.type === 'debit' ? Number(l.amount) : 0,
          credit: l.type === 'credit' ? Number(l.amount) : 0,
          attachment_url: l.journal_entries?.attachment_url,
        }));
        const jeIds = new Set(recent.map((r: any) => r.journal_entry_id));
        const linkedPrs = (prs || []).filter((p: any) => jeIds.has(p.journal_entry_id)).slice(0, 10);

        data = {
          account,
          current_balance: inquiry.current,
          opening_balance: inquiry.opening,
          movement: inquiry.current - inquiry.opening,
          last_posting: recent[0]?.entry_date || null,
          transaction_count: recent.length,
          recent_activity: recent,
          linked_journals: recent.map((r: any) => ({ id: r.journal_entry_id, journal_number: r.journal_number, entry_date: r.entry_date })),
          linked_documents: linkedPrs.map((p: any) => ({
            document_type: p.document_type,
            document_id: p.document_id,
            module: p.module,
            route: sourceRoute(p.module, p.document_type, p.document_id),
          })),
          linked_posting_requests: linkedPrs,
          linked_attachments: recent.filter((r: any) => r.attachment_url).map((r: any) => ({
            url: r.attachment_url,
            journal_number: r.journal_number,
          })),
        };
        break;
      }

      case 'GET_HIERARCHICAL_TRIAL_BALANCE': {
        // Reuse TB computation then attach hierarchy classification (read-only)
        const startDate = body.start_date;
        const endDate = body.end_date;
        if (!startDate || !endDate) throw new Error('start_date and end_date required');

        // Call internal logic by re-invoking pattern: duplicate minimal TB assemble
        const openingDate = dayBefore(startDate);
        const [{ data: opening }, { data: closing }, { data: accounts }] = await Promise.all([
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: openingDate, p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: endDate, p_company_id: company_id }),
          supabaseAdmin.from('chart_of_accounts')
            .select('id, account_number, name, type, normal_balance, control_account, is_active, category, subcategory')
            .eq('company_id', company_id)
            .order('account_number'),
        ]);

        const { data: journalsInPeriod } = await supabaseAdmin
          .from('journal_entries').select('id').eq('company_id', company_id)
          .gte('entry_date', startDate).lte('entry_date', endDate);
        const jeIds = (journalsInPeriod || []).map((j: any) => j.id);
        let moveRows: any[] = [];
        for (let i = 0; i < jeIds.length; i += 200) {
          const chunk = jeIds.slice(i, i + 200);
          if (!chunk.length) break;
          const { data: chunkRows } = await supabaseAdmin
            .from('journal_entry_items').select('account_id, type, amount').in('journal_entry_id', chunk);
          moveRows = moveRows.concat(chunkRows || []);
        }
        const moves: Record<string, { debit: number; credit: number }> = {};
        for (const m of moveRows) {
          if (!moves[m.account_id]) moves[m.account_id] = { debit: 0, credit: 0 };
          if (m.type === 'debit') moves[m.account_id].debit += Number(m.amount);
          else moves[m.account_id].credit += Number(m.amount);
        }
        const openingMap = Object.fromEntries((opening || []).map((a: any) => [a.id, Number(a.balance)]));
        const closingMap = Object.fromEntries((closing || []).map((a: any) => [a.id, Number(a.balance)]));

        // Classification is read from the Chart of Accounts and nothing else.
        // The previous implementation inferred the hierarchy from the account
        // name and account number (e.g. any Liability matching /loan/ became
        // "Non-current"), which disagreed with the Chart of Accounts and
        // produced a duplicated "Non-current > Non-current" level. Both the
        // inference and the duplication are gone: resolveAccountHierarchy reads
        // type + category + subcategory, and returns l3 === l2 when the account
        // carries no statement line, which consumers render as a single level.

        const rows = (accounts || []).map((acc: any) => {
          const openBal = openingMap[acc.id] ?? 0;
          const closeBal = closingMap[acc.id] ?? 0;
          const move = moves[acc.id] || { debit: 0, credit: 0 };
          const isDebit = DEBIT_NORMAL.has(acc.type);
          const split = (bal: number) => isDebit
            ? (bal >= 0 ? { debit: bal, credit: 0 } : { debit: 0, credit: Math.abs(bal) })
            : (bal >= 0 ? { debit: 0, credit: bal } : { debit: Math.abs(bal), credit: 0 });
          const openSplit = split(openBal);
          const closeSplit = split(closeBal);
          const h = resolveAccountHierarchy(acc);
          return {
            account_id: acc.id,
            account_number: acc.account_number,
            account_name: acc.name,
            account_type: acc.type,
            normal_balance: acc.normal_balance || (isDebit ? 'debit' : 'credit'),
            opening_debit: openSplit.debit,
            opening_credit: openSplit.credit,
            period_debit: move.debit,
            period_credit: move.credit,
            closing_debit: closeSplit.debit,
            closing_credit: closeSplit.credit,
            net_movement: closeBal - openBal,
            current_balance: closeBal,
            opening_balance: openBal,
            hierarchy_l1: h.l1,
            hierarchy_l2: h.l2,
            hierarchy_l3: h.l3,
            classification_required: h.unclassified,
            category: acc.category ?? null,
            subcategory: acc.subcategory ?? null,
            hierarchy_sort: hierarchySortKey(acc),
          };
        }).filter((r: any) =>
          r.opening_debit || r.opening_credit || r.period_debit || r.period_credit || r.closing_debit || r.closing_credit
        );

        // Present classes in canonical statement order (Assets > Liabilities >
        // Equity > Income > Expenses, current before non-current), then by
        // statement line, then account number. Purely presentation — row values
        // are untouched.
        rows.sort((a: any, b: any) =>
          (a.hierarchy_sort - b.hierarchy_sort) ||
          String(a.hierarchy_l3).localeCompare(String(b.hierarchy_l3)) ||
          (Number(a.account_number) - Number(b.account_number))
        );

        // Column sums of displayed rows = presentation only.
        // Closing DR/CR + balanced = CFA accounting authority.
        const presentationColumnTotals = rows.reduce((acc: any, r: any) => ({
          opening_debit: acc.opening_debit + r.opening_debit,
          opening_credit: acc.opening_credit + r.opening_credit,
          period_debit: acc.period_debit + r.period_debit,
          period_credit: acc.period_credit + r.period_credit,
          closing_debit: acc.closing_debit + r.closing_debit,
          closing_credit: acc.closing_credit + r.closing_credit,
        }), { opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 0, closing_debit: 0, closing_credit: 0 });

        const cfa = await loadCanonicalAggregation({
          admin: supabaseAdmin,
          rpc: userSupabase,
          company_id,
          start_date: startDate,
          end_date: endDate,
          prior_date: openingDate,
        });

        data = {
          rows,
          totals: {
            ...presentationColumnTotals,
            closing_debit: cfa.totalDebits,
            closing_credit: cfa.totalCredits,
          },
          balanced: cfa.trialBalanceBalanced,
          canonicalAggregation: cfa,
          money_source: 'canonical_financial_aggregation',
          start_date: startDate,
          end_date: endDate,
        };
        break;
      }

      case 'GET_ACCOUNTING_TIMELINE': {
        const { page, pageSize, offset } = clampPage(body.page, body.page_size);
        const filters = body.filters || {};
        let q = supabaseAdmin
          .from('posting_requests')
          .select(`
            id, module, document_type, document_id, reference, description, status,
            journal_number, journal_entry_id, created_by, created_at, committed_at,
            financial_year_id, accounting_period_id, source, currency,
            accounting_periods ( period_number ),
            financial_years ( year_code )
          `, { count: 'exact' })
          .eq('company_id', company_id)
          .eq('status', 'committed')
          .order('committed_at', { ascending: false });
        if (filters.module && filters.module !== 'all') q = q.eq('module', filters.module);
        if (filters.date_from) q = q.gte('committed_at', `${filters.date_from}T00:00:00`);
        if (filters.date_to) q = q.lte('committed_at', `${filters.date_to}T23:59:59`);
        if (filters.accounting_period_id && filters.accounting_period_id !== 'all') {
          q = q.eq('accounting_period_id', filters.accounting_period_id);
        }

        const { data: rows, error: tErr, count } = await q.range(offset, offset + pageSize - 1);
        if (tErr) throw tErr;

        // Attach amount from journal totals
        const jeIds = (rows || []).map((r: any) => r.journal_entry_id).filter(Boolean);
        let amounts: Record<string, number> = {};
        if (jeIds.length) {
          const { data: items } = await supabaseAdmin
            .from('journal_entry_items')
            .select('journal_entry_id, type, amount')
            .in('journal_entry_id', jeIds);
          for (const it of items || []) {
            if (it.type === 'debit') amounts[it.journal_entry_id] = (amounts[it.journal_entry_id] || 0) + Number(it.amount);
          }
        }

        data = {
          rows: (rows || []).map((r: any) => ({
            ...r,
            time: r.committed_at || r.created_at,
            amount: amounts[r.journal_entry_id] || 0,
            period_number: r.accounting_periods?.period_number ?? null,
            year_code: r.financial_years?.year_code ?? null,
            document_route: sourceRoute(r.module, r.document_type, r.document_id),
            activity_class: classifyModule(r.module),
          })),
          total: count || 0,
          page,
          page_size: pageSize,
        };
        break;
      }

      case 'GET_FINANCIAL_HEALTH': {
        const today = new Date().toISOString().slice(0, 10);
        const todayStart = `${today}T00:00:00.000Z`;

        const [
          { data: todayItems },
          pendingPr,
          failedPr,
          openPeriods,
          closedPeriods,
          { data: journalsSample },
          { data: exceptionsLike },
          { data: suspenseAccounts },
          { data: bals },
        ] = await Promise.all([
          supabaseAdmin.from('journal_entry_items')
            .select('type, amount, journal_entries!inner(company_id, entry_date)')
            .eq('journal_entries.company_id', company_id)
            .eq('journal_entries.entry_date', today)
            .limit(5000),
          supabaseAdmin.from('posting_requests').select('id', { count: 'exact', head: true })
            .eq('company_id', company_id).eq('status', 'pending'),
          supabaseAdmin.from('posting_requests').select('id', { count: 'exact', head: true })
            .eq('company_id', company_id).eq('status', 'pending')
            .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()),
          supabaseAdmin.from('accounting_periods').select('id', { count: 'exact', head: true })
            .eq('company_id', company_id).eq('status', 'open'),
          supabaseAdmin.from('accounting_periods').select('id', { count: 'exact', head: true })
            .eq('company_id', company_id).in('status', ['soft_closed', 'hard_closed', 'locked', 'closed']),
          supabaseAdmin.from('journal_entries')
            .select('id, journal_entry_items(type, amount)')
            .eq('company_id', company_id).order('entry_date', { ascending: false }).limit(50),
          supabaseAdmin.from('posting_requests')
            .select('id, warnings, document_id, document_type, status')
            .eq('company_id', company_id).eq('status', 'committed').limit(300),
          supabaseAdmin.from('chart_of_accounts')
            .select('id, name').eq('company_id', company_id)
            .eq('account_role', 'suspense'),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: today, p_company_id: company_id }),
        ]);

        let debitsToday = 0, creditsToday = 0;
        for (const it of todayItems || []) {
          if (it.type === 'debit') debitsToday += Number(it.amount);
          else creditsToday += Number(it.amount);
        }

        let balanced = 0, unbalanced = 0;
        for (const j of journalsSample || []) {
          const items = j.journal_entry_items || [];
          const d = items.filter((i: any) => i.type === 'debit').reduce((s: number, i: any) => s + Number(i.amount), 0);
          const c = items.filter((i: any) => i.type === 'credit').reduce((s: number, i: any) => s + Number(i.amount), 0);
          if (Math.abs(d - c) < 0.005) balanced++; else unbalanced++;
        }

        let suspenseBalance = 0;
        for (const a of suspenseAccounts || []) {
          suspenseBalance += Math.abs(Number((bals || []).find((b: any) => b.id === a.id)?.balance || 0));
        }

        // duplicates
        const seen = new Map<string, number>();
        let duplicates = 0;
        for (const r of exceptionsLike || []) {
          if (!r.document_id) continue;
          const key = `${r.document_type}:${r.document_id}`;
          seen.set(key, (seen.get(key) || 0) + 1);
        }
        for (const v of seen.values()) if (v > 1) duplicates++;

        let unmapped = 0;
        for (const r of exceptionsLike || []) {
          const w = JSON.stringify(r.warnings || []);
          if (/unmapped|map|coa|category/i.test(w) && w !== '[]') unmapped++;
        }

        // Optional domain signals (best-effort, never fail)
        let bankReconStatus = 'unknown';
        let quickCaptureAwaiting = 0;
        let outstandingAttachments = 0;
        try {
          const { count } = await supabaseAdmin.from('journal_entries')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company_id).is('attachment_url', null)
            .gte('entry_date', `${today.slice(0, 7)}-01`);
          outstandingAttachments = count || 0;
        } catch { /* ignore */ }
        try {
          const { count } = await supabaseAdmin.from('bank_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', company_id).is('journal_entry_id', null).limit(1);
          bankReconStatus = (count || 0) > 0 ? 'items_outstanding' : 'clear';
        } catch { bankReconStatus = 'unavailable'; }

        data = {
          debits_today: debitsToday,
          credits_today: creditsToday,
          balanced_journals: balanced,
          unbalanced_journals: unbalanced,
          pending_posting_requests: pendingPr.count || 0,
          failed_posting_requests: failedPr.count || 0,
          draft_journals: 0,
          open_accounting_periods: openPeriods.count || 0,
          closed_accounting_periods: closedPeriods.count || 0,
          suspense_balance: suspenseBalance,
          unmapped_categories: unmapped,
          duplicate_posting_attempts: duplicates,
          bank_reconciliation_status: bankReconStatus,
          quick_capture_awaiting_review: quickCaptureAwaiting,
          outstanding_attachments: outstandingAttachments,
          as_of: today,
          as_of_ts: todayStart,
        };
        break;
      }

      case 'GET_PERIOD_CLOSE_READINESS': {
        const health: any = {};
        // Compose from health + exceptions signals
        const today = new Date().toISOString().slice(0, 10);
        const [
          pendingPr,
          failedPr,
          { data: suspenseAccounts },
          { data: bals },
          openPeriods,
          { data: recentPrs },
        ] = await Promise.all([
          supabaseAdmin.from('posting_requests').select('id', { count: 'exact', head: true })
            .eq('company_id', company_id).eq('status', 'pending'),
          supabaseAdmin.from('posting_requests').select('id', { count: 'exact', head: true })
            .eq('company_id', company_id).eq('status', 'pending')
            .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()),
          supabaseAdmin.from('chart_of_accounts').select('id, name').eq('company_id', company_id)
            .eq('account_role', 'suspense'),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: today, p_company_id: company_id }),
          supabaseAdmin.from('accounting_periods').select('id, period_number, status, start_date, end_date')
            .eq('company_id', company_id).eq('status', 'open'),
          supabaseAdmin.from('posting_requests')
            .select('module, status, committed_at')
            .eq('company_id', company_id).eq('status', 'committed')
            .gte('committed_at', `${today.slice(0, 7)}-01T00:00:00`)
            .limit(500),
        ]);

        let suspenseBalance = 0;
        for (const a of suspenseAccounts || []) {
          suspenseBalance += Math.abs(Number((bals || []).find((b: any) => b.id === a.id)?.balance || 0));
        }

        const mods = new Set((recentPrs || []).map((p: any) => String(p.module).toLowerCase()));
        const item = (id: string, label: string, ok: boolean, outstanding: number, route: string, detail: string) => ({
          id, label, status: ok ? 'ready' : 'outstanding', outstanding, route, detail,
        });

        const checklist = [
          item('bank_recon', 'Bank Reconciliations Complete', true, 0, '/accounting/reconciliation', 'Open Reconciliation Centre to verify'),
          item('postings_committed', 'All Posting Requests Committed', (pendingPr.count || 0) === 0, pendingPr.count || 0, '/accounting/posting-requests', `${pendingPr.count || 0} pending`),
          item('no_failed', 'No Failed Postings', (failedPr.count || 0) === 0, failedPr.count || 0, '/accounting/exceptions', `${failedPr.count || 0} stuck`),
          item('no_drafts', 'No Draft Journals', true, 0, '/journal-entries', 'Journals are immutable once posted via engine'),
          item('no_suspense', 'No Suspense Balances', suspenseBalance < 0.01, suspenseBalance > 0 ? 1 : 0, '/accounting/exceptions', `Suspense ${suspenseBalance.toFixed(2)}`),
          item('inventory_posted', 'Inventory Posted', [...mods].some((m) => m.includes('inventory')), mods.has('inventory_receipt') || mods.has('inventory_issue') ? 0 : 1, '/inventory', 'Confirm inventory postings this period'),
          item('payroll_posted', 'Payroll Posted', [...mods].some((m) => m.includes('payroll')), [...mods].some((m) => m.includes('payroll')) ? 0 : 1, '/payroll-runs', 'Confirm payroll posted this period'),
          item('assets_posted', 'Assets Posted', [...mods].some((m) => m.includes('fixed') || m.includes('asset')), [...mods].some((m) => m.includes('fixed') || m.includes('asset')) ? 0 : 1, '/fixed-assets', 'Confirm asset journals this period'),
          item('tax_posted', 'Tax Posted', true, 0, '/tax-report', 'Review tax report for the period'),
          item('opening_verified', 'Opening Balances Verified', true, 0, '/trial-balance', 'Compare opening TB to prior close'),
          item('qc_reviewed', 'Quick Capture Reviewed', true, 0, '/purchases/quick-capture', 'Review Quick Capture queue (module frozen)'),
          item('exceptions', 'Outstanding Exceptions', (failedPr.count || 0) === 0 && suspenseBalance < 0.01, (failedPr.count || 0) + (suspenseBalance > 0 ? 1 : 0), '/accounting/exceptions', 'Clear exception centre'),
        ];

        const ready = checklist.filter((c) => c.status === 'ready').length;
        data = {
          open_periods: openPeriods || [],
          checklist,
          readiness_pct: Math.round((ready / checklist.length) * 100),
          ready_count: ready,
          total_count: checklist.length,
        };
        Object.assign(health, data);
        break;
      }

      case 'GET_ACCOUNT_CARD': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        // Enrich inquiry with linked entities (read-only joins)
        const today = new Date().toISOString().slice(0, 10);
        const yearStart = `${today.slice(0, 4)}-01-01`;
        const monthStart = `${today.slice(0, 7)}-01`;

        const [{ data: account }, { data: balNow }, { data: balYear }, { data: balMonth }, { data: recentLines }, { data: bankLinks }] = await Promise.all([
          supabaseAdmin.from('chart_of_accounts').select('*').eq('id', accountId).eq('company_id', company_id).single(),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: today, p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(yearStart), p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(monthStart), p_company_id: company_id }),
          supabaseAdmin.from('journal_entry_items')
            .select(`id, type, amount, project_id, dimensions, journal_entries!inner ( id, journal_number, entry_date, description, attachment_url, company_id, posting_requests!journal_entry_id ( module, document_type, document_id, status ) )`)
            .eq('account_id', accountId).eq('journal_entries.company_id', company_id)
            .order('entry_date', { foreignTable: 'journal_entries', ascending: false }).limit(10),
          supabaseAdmin.from('bank_accounts').select('id, name, chart_of_account_id').eq('company_id', company_id).eq('chart_of_account_id', accountId).limit(5),
        ]);

        const cur = Number((balNow || []).find((a: any) => a.id === accountId)?.balance || 0);
        const yOpen = Number((balYear || []).find((a: any) => a.id === accountId)?.balance || 0);
        const mOpen = Number((balMonth || []).find((a: any) => a.id === accountId)?.balance || 0);

        const projects = new Set<string>();
        const docs: any[] = [];
        const attachments: any[] = [];
        for (const l of recentLines || []) {
          if (l.project_id) projects.add(l.project_id);
          const je = l.journal_entries;
          const pr = (je?.posting_requests || [])[0];
          if (pr?.document_id) docs.push({ module: pr.module, document_type: pr.document_type, document_id: pr.document_id, route: sourceRoute(pr.module, pr.document_type, pr.document_id) });
          if (je?.attachment_url) attachments.push({ url: je.attachment_url, journal_number: je.journal_number });
        }

        data = {
          account,
          current_balance: cur,
          available_balance: account?.type === 'Asset' ? cur : null,
          opening_balance: yOpen,
          period_activity: cur - mOpen,
          ytd_activity: cur - yOpen,
          linked_bank_accounts: bankLinks || [],
          linked_tax_rates: [],
          linked_control_accounts: account?.control_account ? [account] : [],
          linked_categories: [account?.type].filter(Boolean),
          linked_projects: Array.from(projects),
          linked_dimensions: (recentLines || []).map((l: any) => l.dimensions).filter(Boolean).slice(0, 5),
          recent_journals: (recentLines || []).map((l: any) => ({
            journal_entry_id: l.journal_entries?.id,
            journal_number: l.journal_entries?.journal_number,
            entry_date: l.journal_entries?.entry_date,
            description: l.journal_entries?.description,
            debit: l.type === 'debit' ? Number(l.amount) : 0,
            credit: l.type === 'credit' ? Number(l.amount) : 0,
          })),
          recent_source_documents: docs.slice(0, 8),
          recent_attachments: attachments.slice(0, 8),
        };
        break;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Phase 4C — Enterprise Accounting Intelligence.
      // Additive read models only. Every handler below consumes the four
      // new server-side aggregation RPCs (get_account_movement_grouped,
      // get_account_movement_by_dimension, get_account_movement_series,
      // get_account_largest_journal) instead of the chunked-JS-loop pattern
      // used above — no posting logic, journal creation, or Posting
      // Requests are touched by anything in this section.
      // ═══════════════════════════════════════════════════════════════════

      case 'GET_ACCOUNT_VARIANCE': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const asOf = body.as_of_date || new Date().toISOString().slice(0, 10);
        const [asOfYear, asOfMonthNum] = asOf.slice(0, 7).split('-').map(Number);
        const seriesStart = `${asOfYear - 1}-01-01`;

        const [{ data: account }, { data: series }, { data: budgetRows }, materiality] = await Promise.all([
          supabaseAdmin.from('chart_of_accounts').select('id, name, type, normal_balance').eq('id', accountId).eq('company_id', company_id).single(),
          userSupabase.rpc('get_account_movement_series', { p_company_id: company_id, p_account_id: accountId, p_start_date: seriesStart, p_end_date: asOf, p_granularity: 'month' }),
          supabaseAdmin.from('budgets').select('period, start_date, amount').eq('company_id', company_id).eq('account_id', accountId),
          getMateriality(supabaseAdmin, company_id),
        ]);

        const seriesMap: Record<string, number> = Object.fromEntries((series || []).map((s: any) => [String(s.bucket_date).slice(0, 7), Number(s.net_movement)]));
        const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
        const curMonth = monthKey(asOfYear, asOfMonthNum);
        const prevMonthY = asOfMonthNum === 1 ? asOfYear - 1 : asOfYear;
        const prevMonthM = asOfMonthNum === 1 ? 12 : asOfMonthNum - 1;
        const prevMonth = monthKey(prevMonthY, prevMonthM);

        const net = (m: string) => seriesMap[m] || 0;
        const ytdSum = (year: number, throughMonth: number) => Object.entries(seriesMap)
          .filter(([m]) => m.startsWith(String(year)) && Number(m.split('-')[1]) <= throughMonth)
          .reduce((s, [, v]) => s + v, 0);

        const variance = (current: number, prior: number | null) => {
          const absoluteVariance = prior == null ? null : current - prior;
          return {
            current,
            prior,
            absolute_variance: absoluteVariance,
            percentage_variance: prior == null ? null : (prior !== 0 ? ((current - prior) / Math.abs(prior)) * 100 : (current !== 0 ? 100 : 0)),
            is_material: absoluteVariance == null ? null : isMaterial(absoluteVariance, prior ?? 0, materiality.percentageThreshold, materiality.absoluteThreshold),
          };
        };

        const [{ data: openBal }, { data: closeBal }] = await Promise.all([
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(`${curMonth}-01`), p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: asOf, p_company_id: company_id }),
        ]);
        const opening = Number((openBal || []).find((a: any) => a.id === accountId)?.balance || 0);
        const closing = Number((closeBal || []).find((a: any) => a.id === accountId)?.balance || 0);

        const budgetRow = (budgetRows || []).find((b: any) => String(b.start_date || '').slice(0, 7) === curMonth);

        data = {
          account_id: accountId,
          account_name: account?.name,
          month_vs_month: variance(net(curMonth), net(prevMonth)),
          year_vs_year: variance(ytdSum(asOfYear, asOfMonthNum), ytdSum(asOfYear - 1, asOfMonthNum)),
          opening_vs_closing: variance(closing, opening),
          budget_vs_actual: budgetRow
            ? variance(net(curMonth), Number(budgetRow.amount))
            : { available: false, reason: 'No budget configured for this account/period', current: net(curMonth), prior: null, absolute_variance: null, percentage_variance: null, is_material: null },
          materiality: { percentage_threshold: materiality.percentageThreshold, absolute_threshold: materiality.absoluteThreshold },
        };
        break;
      }

      case 'GET_ACCOUNT_DRIVERS': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const endDate = body.end_date || new Date().toISOString().slice(0, 10);
        const startDate = body.start_date || `${endDate.slice(0, 7)}-01`;

        const [{ data: account }, { data: byModule }, { data: byVendor }, { data: byCustomer }, { data: byProject }, materiality, { data: openBal }] = await Promise.all([
          supabaseAdmin.from('chart_of_accounts').select('id, name, type').eq('id', accountId).eq('company_id', company_id).single(),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'module' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'vendor' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'customer' }),
          userSupabase.rpc('get_account_movement_by_dimension', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_dimension: 'project' }),
          getMateriality(supabaseAdmin, company_id),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(startDate), p_company_id: company_id }),
        ]);

        const openingBalance = Number((openBal || []).find((a: any) => a.id === accountId)?.balance || 0);
        const isDebitNormal = account ? DEBIT_NORMAL.has(account.type) : true;
        const totalNet = (byModule || []).reduce((s: number, r: any) => s + Number(r.amount), 0);
        const naturalNet = isDebitNormal ? totalNet : -totalNet;
        const direction = naturalNet > 0.005 ? 'increase' : naturalNet < -0.005 ? 'decrease' : 'unchanged';
        const isMaterialMovement = isMaterial(naturalNet, openingBalance, materiality.percentageThreshold, materiality.absoluteThreshold);

        const concentration = (rows: any[]) => {
          if (!rows || rows.length === 0) return 0;
          const totalAbs = rows.reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
          if (totalAbs === 0) return 0;
          const top3Abs = rows.slice(0, 3).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
          return top3Abs / totalAbs;
        };

        // Deterministic lens selection: prefer whichever dimension's top-3
        // sources explain >=60% of the movement (a genuine "driver"
        // pattern, e.g. three vendors explaining a fuel increase); fall
        // back to module, which is always populated on every line.
        const candidates: { dimension: string; rows: any[] }[] = [
          { dimension: 'vendor', rows: byVendor || [] },
          { dimension: 'customer', rows: byCustomer || [] },
          { dimension: 'project', rows: byProject || [] },
          { dimension: 'module', rows: byModule || [] },
        ];
        const chosen = candidates.find((c) => c.dimension !== 'module' && concentration(c.rows) >= 0.6)
          || candidates.find((c) => c.dimension === 'module')!;

        const totalAbs = chosen.rows.reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
        const drivers = chosen.rows.slice(0, 5).map((r: any) => ({
          label: r.bucket_label,
          amount: Number(r.amount),
          transaction_count: Number(r.txn_count),
          share_pct: totalAbs > 0 ? (Math.abs(Number(r.amount)) / totalAbs) * 100 : 0,
          is_material: isMaterial(Number(r.amount), openingBalance, materiality.percentageThreshold, materiality.absoluteThreshold),
        }));

        data = {
          account_id: accountId,
          account_name: account?.name,
          period: { start_date: startDate, end_date: endDate },
          direction,
          net_movement: naturalNet,
          is_material_movement: isMaterialMovement,
          driver_lens: chosen.dimension,
          drivers,
          materiality: { percentage_threshold: materiality.percentageThreshold, absolute_threshold: materiality.absoluteThreshold },
        };
        break;
      }

      case 'GET_ACCOUNT_INSIGHTS': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const endDate = body.end_date || new Date().toISOString().slice(0, 10);
        const startDate = body.start_date || `${Number(endDate.slice(0, 4)) - 1}-${endDate.slice(5)}`;

        const [{ data: account }, { data: daySeries }, { data: monthSeries }, { data: largestJournalRows }, { data: curBal }, { data: lastPosting }, { data: companyMovement }, materiality] = await Promise.all([
          supabaseAdmin.from('chart_of_accounts').select('id, name, type, normal_balance, is_active').eq('id', accountId).eq('company_id', company_id).single(),
          userSupabase.rpc('get_account_movement_series', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_granularity: 'day' }),
          userSupabase.rpc('get_account_movement_series', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate, p_granularity: 'month' }),
          userSupabase.rpc('get_account_largest_journal', { p_company_id: company_id, p_account_id: accountId, p_start_date: startDate, p_end_date: endDate }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: endDate, p_company_id: company_id }),
          supabaseAdmin.from('journal_entry_items').select('journal_entries!inner(entry_date, company_id)').eq('account_id', accountId).eq('journal_entries.company_id', company_id)
            .order('entry_date', { foreignTable: 'journal_entries', ascending: false }).limit(1),
          userSupabase.rpc('get_account_movement_grouped', { p_company_id: company_id, p_start_date: startDate, p_end_date: endDate }),
          getMateriality(supabaseAdmin, company_id),
        ]);

        const balance = Number((curBal || []).find((a: any) => a.id === accountId)?.balance || 0);
        const isDebitNormal = account ? DEBIT_NORMAL.has(account.type) : true;

        const highestPostingDay = (daySeries || []).slice()
          .sort((a: any, b: any) => (Math.abs(Number(b.debit_total) + Number(b.credit_total))) - (Math.abs(Number(a.debit_total) + Number(a.credit_total))))[0] || null;
        const mostActiveMonth = (monthSeries || []).slice()
          .sort((a: any, b: any) => Number(b.txn_count) - Number(a.txn_count))[0] || null;

        const lastPostingDate = (lastPosting as any)?.[0]?.journal_entries?.entry_date || null;
        const daysSinceLastPosting = lastPostingDate ? Math.floor((Date.now() - new Date(`${lastPostingDate}T00:00:00Z`).getTime()) / 86400000) : null;
        const dormant = !!account?.is_active && (daysSinceLastPosting === null || daysSinceLastPosting > 90);

        // This codebase's get_balances_as_of_date already returns a
        // sign-normalized balance (positive = the account's normal side —
        // see the identical split() convention used by GET_TRIAL_BALANCE
        // above), so `< 0` is abnormal for every account type uniformly.
        // Negative/abnormal balance is never suppressed by materiality
        // (a sign violation is a correctness signal, not noise) — but each
        // carries an `is_material` sub-flag so the UI can still prioritize
        // by magnitude without hiding a genuine defect.
        const negativeBalanceWarning = balance < 0;
        const abnormalBalanceWarning = balance < 0;
        const balanceWarningIsMaterial = balance < 0 && Math.abs(balance) >= materiality.absoluteThreshold;

        const totalDebit = (monthSeries || []).reduce((s: number, r: any) => s + Number(r.debit_total), 0);
        const totalCredit = (monthSeries || []).reduce((s: number, r: any) => s + Number(r.credit_total), 0);
        const rawNet = totalDebit - totalCredit;
        const naturalNet = isDebitNormal ? rawNet : -rawNet;
        // Magnitude-gated by materiality: a tiny opposite-direction wobble
        // (e.g. one small refund credited to an expense account) shouldn't
        // surface as a warning — only when it clears the configured threshold.
        const unexpectedPostingDirection = naturalNet < 0 && isMaterial(rawNet, balance, materiality.percentageThreshold, materiality.absoluteThreshold);

        const totalTxnCount = (monthSeries || []).reduce((s: number, r: any) => s + Number(r.txn_count), 0);
        const activeAccountCount = (companyMovement || []).length || 1;
        const companyAvgTxnCount = (companyMovement || []).reduce((s: number, r: any) => s + Number(r.txn_count), 0) / activeAccountCount;
        const highTransactionFrequency = companyAvgTxnCount > 0 && totalTxnCount > companyAvgTxnCount * 2;

        data = {
          account_id: accountId,
          account_name: account?.name,
          highest_posting_day: highestPostingDay ? {
            date: highestPostingDay.bucket_date,
            debit: Number(highestPostingDay.debit_total),
            credit: Number(highestPostingDay.credit_total),
            txn_count: Number(highestPostingDay.txn_count),
          } : null,
          largest_journal: (largestJournalRows || [])[0] || null,
          most_active_month: mostActiveMonth ? { month: String(mostActiveMonth.bucket_date).slice(0, 7), txn_count: Number(mostActiveMonth.txn_count) } : null,
          dormant_account: dormant,
          days_since_last_posting: daysSinceLastPosting,
          negative_balance_warning: negativeBalanceWarning,
          abnormal_balance_warning: abnormalBalanceWarning,
          balance_warning_is_material: balanceWarningIsMaterial,
          unexpected_posting_direction: unexpectedPostingDirection,
          high_transaction_frequency: highTransactionFrequency,
          transaction_count_period: totalTxnCount,
          company_average_transaction_count: Math.round(companyAvgTxnCount * 10) / 10,
          materiality: { percentage_threshold: materiality.percentageThreshold, absolute_threshold: materiality.absoluteThreshold },
        };
        break;
      }

      case 'GET_ACCOUNT_COMPARISON': {
        const accountId = body.account_id;
        if (!accountId) throw new Error('account_id required');
        const asOf = body.as_of_date || new Date().toISOString().slice(0, 10);
        const [asOfYear, asOfMonthNum] = asOf.slice(0, 7).split('-').map(Number);
        const seriesStart = `${asOfYear - 1}-01-01`;

        const [{ data: account }, { data: series }] = await Promise.all([
          supabaseAdmin.from('chart_of_accounts').select('id, name').eq('id', accountId).eq('company_id', company_id).single(),
          userSupabase.rpc('get_account_movement_series', { p_company_id: company_id, p_account_id: accountId, p_start_date: seriesStart, p_end_date: asOf, p_granularity: 'month' }),
        ]);

        const seriesMap: Record<string, any> = Object.fromEntries((series || []).map((s: any) => [String(s.bucket_date).slice(0, 7), s]));
        const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
        const curMonth = monthKey(asOfYear, asOfMonthNum);
        const prevMonthY = asOfMonthNum === 1 ? asOfYear - 1 : asOfYear;
        const prevMonthM = asOfMonthNum === 1 ? 12 : asOfMonthNum - 1;
        const prevMonth = monthKey(prevMonthY, prevMonthM);
        const sameMonthLastYear = monthKey(asOfYear - 1, asOfMonthNum);

        const net = (m: string) => Number(seriesMap[m]?.net_movement || 0);
        const ytd = (year: number, throughMonth: number) => Object.entries(seriesMap)
          .filter(([m]) => m.startsWith(String(year)) && Number(m.split('-')[1]) <= throughMonth)
          .reduce((s, [, v]: [string, any]) => s + Number(v.net_movement), 0);

        const points = {
          current_month: { label: curMonth, net_movement: net(curMonth) },
          previous_month: { label: prevMonth, net_movement: net(prevMonth) },
          same_month_last_year: { label: sameMonthLastYear, net_movement: net(sameMonthLastYear) },
          current_year: { label: String(asOfYear), net_movement: ytd(asOfYear, asOfMonthNum) },
          previous_year: { label: String(asOfYear - 1), net_movement: ytd(asOfYear - 1, 12) },
        };
        const trend = (a: number, b: number) => (b !== 0 ? ((a - b) / Math.abs(b)) * 100 : (a !== 0 ? 100 : 0));

        data = {
          account_id: accountId,
          account_name: account?.name,
          points,
          trends: {
            vs_previous_month: trend(points.current_month.net_movement, points.previous_month.net_movement),
            vs_same_month_last_year: trend(points.current_month.net_movement, points.same_month_last_year.net_movement),
            vs_previous_year: trend(points.current_year.net_movement, points.previous_year.net_movement),
          },
          monthly_series: (series || []).map((s: any) => ({
            month: String(s.bucket_date).slice(0, 7), net_movement: Number(s.net_movement), debit: Number(s.debit_total), credit: Number(s.credit_total),
          })),
        };
        break;
      }

      case 'GET_MATERIALITY_SETTINGS': {
        const { data: row } = await supabaseAdmin.from('company_materiality_settings').select('*').eq('company_id', company_id).maybeSingle();
        data = row || { company_id, percentage_threshold: 5, absolute_threshold: 1000, updated_at: null, updated_by: null };
        break;
      }

      case 'SET_MATERIALITY_SETTINGS': {
        const { data: member } = await supabase.from('company_users').select('role').eq('user_id', user.id).eq('company_id', company_id).single();
        if (!member || !['owner', 'admin'].includes((member as any).role)) throw new Error('Access Denied: Admin privileges required to change materiality settings.');
        const pct = Number(body.percentage_threshold);
        const abs = Number(body.absolute_threshold);
        if (!Number.isFinite(pct) || pct < 0) throw new Error('percentage_threshold must be a non-negative number');
        if (!Number.isFinite(abs) || abs < 0) throw new Error('absolute_threshold must be a non-negative number');
        const { data: row, error: upsertError } = await supabaseAdmin.from('company_materiality_settings')
          .upsert({ company_id, percentage_threshold: pct, absolute_threshold: abs, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: 'company_id' })
          .select().single();
        if (upsertError) throw upsertError;
        data = row;
        break;
      }

      case 'GET_INTELLIGENCE_DASHBOARD': {
        const asOf = body.as_of_date || new Date().toISOString().slice(0, 10);
        const curMonthStart = `${asOf.slice(0, 7)}-01`;
        const [asOfYear, asOfMonthNum] = asOf.slice(0, 7).split('-').map(Number);
        const prevMonthY = asOfMonthNum === 1 ? asOfYear - 1 : asOfYear;
        const prevMonthM = asOfMonthNum === 1 ? 12 : asOfMonthNum - 1;
        const prevMonthStart = `${prevMonthY}-${String(prevMonthM).padStart(2, '0')}-01`;
        const prevMonthEnd = dayBefore(curMonthStart);

        const [
          materiality, { data: accounts }, { data: curMove }, { data: prevMove },
          { data: curBal }, { data: prevBal }, { data: postingsByModule }, { data: lastActivity },
        ] = await Promise.all([
          getMateriality(supabaseAdmin, company_id),
          supabaseAdmin.from('chart_of_accounts').select('id, name, type, normal_balance, is_active').eq('company_id', company_id),
          userSupabase.rpc('get_account_movement_grouped', { p_company_id: company_id, p_start_date: curMonthStart, p_end_date: asOf }),
          userSupabase.rpc('get_account_movement_grouped', { p_company_id: company_id, p_start_date: prevMonthStart, p_end_date: prevMonthEnd }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: asOf, p_company_id: company_id }),
          userSupabase.rpc('get_balances_as_of_date', { p_end_date: dayBefore(curMonthStart), p_company_id: company_id }),
          supabaseAdmin.from('posting_requests').select('module').eq('company_id', company_id).eq('status', 'committed').gte('committed_at', `${curMonthStart}T00:00:00`),
          userSupabase.rpc('get_account_last_activity', { p_company_id: company_id }),
        ]);

        const pctThreshold = materiality.percentageThreshold;
        const absThreshold = materiality.absoluteThreshold;

        const accMap: Record<string, any> = Object.fromEntries((accounts || []).map((a: any) => [a.id, a]));
        const curMap: Record<string, any> = Object.fromEntries((curMove || []).map((r: any) => [r.account_id, r]));
        const prevMap: Record<string, any> = Object.fromEntries((prevMove || []).map((r: any) => [r.account_id, r]));
        const curBalMap: Record<string, number> = Object.fromEntries((curBal || []).map((b: any) => [b.id, Number(b.balance)]));
        const prevBalMap: Record<string, number> = Object.fromEntries((prevBal || []).map((b: any) => [b.id, Number(b.balance)]));

        const naturalNet = (accId: string, row: any) => {
          if (!row) return 0;
          const acc = accMap[accId];
          const isDebit = acc ? DEBIT_NORMAL.has(acc.type) : true;
          const raw = Number(row.net_movement);
          return isDebit ? raw : -raw;
        };
        const growthRows = Object.keys(accMap).map((id) => {
          const acc = accMap[id];
          const cur = naturalNet(id, curMap[id]);
          const prev = naturalNet(id, prevMap[id]);
          return { account_id: id, account_name: acc.name, account_type: acc.type, current: cur, previous: prev, delta: cur - prev };
        }).filter((r) => isMaterial(r.delta, r.previous, pctThreshold, absThreshold));

        const largestExpenseGrowth = growthRows.filter((r) => r.account_type === 'Expense').sort((a, b) => b.delta - a.delta)[0] || null;
        const largestIncomeGrowth = growthRows.filter((r) => r.account_type === 'Income').sort((a, b) => b.delta - a.delta)[0] || null;

        const balanceMoves = Object.keys(accMap).map((id) => {
          const cur = curBalMap[id] ?? 0;
          const prev = prevBalMap[id] ?? 0;
          return { account_id: id, account_name: accMap[id].name, current_balance: cur, previous_balance: prev, delta: cur - prev };
        }).filter((r) => isMaterial(r.delta, r.previous_balance, pctThreshold, absThreshold));
        const biggestBalanceMovement = balanceMoves.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null;

        const accountsWithAbnormalBalances = Object.keys(accMap)
          .map((id) => ({ account_id: id, account_name: accMap[id].name, account_type: accMap[id].type, balance: curBalMap[id] ?? 0 }))
          .filter((r) => r.balance < -0.005);

        const lastActivityMap: Record<string, string> = Object.fromEntries((lastActivity || []).map((r: any) => [r.account_id, r.last_entry_date]));
        const inactiveAccounts = (accounts || [])
          .filter((a: any) => a.is_active)
          .map((a: any) => ({ account_id: a.id, account_name: a.name, last_posting_date: lastActivityMap[a.id] || null }))
          .filter((r: any) => !r.last_posting_date || (Date.now() - new Date(`${r.last_posting_date}T00:00:00Z`).getTime()) / 86400000 > 90);

        const moduleCounts: Record<string, number> = {};
        for (const p of postingsByModule || []) {
          const m = (p as any).module || 'manual_journal';
          moduleCounts[m] = (moduleCounts[m] || 0) + 1;
        }
        const topPostingModules = Object.entries(moduleCounts).map(([module, count]) => ({ module, count })).sort((a, b) => b.count - a.count).slice(0, 8);

        const accountsNeedingReview = [
          ...accountsWithAbnormalBalances.map((r) => ({ ...r, reason: 'abnormal_balance' })),
          ...growthRows.filter((r) => Math.abs(r.delta) >= absThreshold * 3)
            .map((r) => ({ account_id: r.account_id, account_name: r.account_name, account_type: r.account_type, balance: null, reason: 'large_material_movement', delta: r.delta })),
        ].slice(0, 15);

        const recentUnusualActivity = growthRows.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);

        data = {
          materiality: { percentage_threshold: pctThreshold, absolute_threshold: absThreshold },
          largest_expense_growth: largestExpenseGrowth,
          largest_income_growth: largestIncomeGrowth,
          biggest_balance_movement: biggestBalanceMovement,
          accounts_needing_review: accountsNeedingReview,
          inactive_accounts: inactiveAccounts.slice(0, 15),
          top_posting_modules: topPostingModules,
          recent_unusual_activity: recentUnusualActivity,
          accounts_with_abnormal_balances: accountsWithAbnormalBalances,
        };
        break;
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    if (error) throw error;

    // Accounting Intelligence + related read models: company money = CFA only.
    // Account-level movement series remain inquiry presentation of certified RPCs
    // (get_account_movement_*), not a parallel statement aggregation engine.
    const CFA_ATTACH = new Set([
      'GET_ACCOUNT_BALANCE_EXPLAINER',
      'GET_ACCOUNT_ANALYTICS',
      'GET_ACCOUNT_SOURCE_ANALYSIS',
      'GET_ACCOUNT_VARIANCE',
      'GET_ACCOUNT_DRIVERS',
      'GET_ACCOUNT_INSIGHTS',
      'GET_ACCOUNT_COMPARISON',
      'GET_INTELLIGENCE_DASHBOARD',
    ]);
    if (data && typeof data === 'object' && CFA_ATTACH.has(method) && !data.canonicalAggregation) {
      const end = body.end_date || body.as_of_date || new Date().toISOString().slice(0, 10);
      const start = body.start_date || `${String(end).slice(0, 7)}-01`;
      const cfa = await loadCanonicalAggregation({
        admin: supabaseAdmin,
        rpc: userSupabase,
        company_id,
        start_date: start,
        end_date: end,
        prior_date: dayBefore(start),
      });
      data = {
        ...data,
        canonicalAggregation: cfa,
        money_source: 'canonical_financial_aggregation',
        company_financials: {
          totalIncome: cfa.totalIncome,
          totalExpenses: cfa.totalExpenses,
          netIncome: cfa.netIncome,
          totalAssets: cfa.totalAssets,
          totalLiabilities: cfa.totalLiabilities,
          totalEquity: cfa.totalEquity,
          cash: cfa.cash,
          receivables: cfa.receivables,
          payables: cfa.payables,
          vatNet: cfa.vatNet,
        },
      };
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
