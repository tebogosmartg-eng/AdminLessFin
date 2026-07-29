import { supabase } from '../integrations/supabase/client';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { buildWorkspaceSummary, aggregatePayrollSummaryItems } from './payrollIntelligence';
import { invokePayroll } from './payrollOperations';
import { isRunFinalized } from './payrollWorkflow';
import { invokeInventory } from './inventory/client';
import { securityService } from '@/governance/domains/security/service';
import { accountingReadinessService } from '@/governance/domains/accountingReadiness/service';
import { accountingHealthService } from '@/governance/domains/accountingHealth/service';
import { accountingPolicyEngineService } from '@/governance/domains/accountingPolicyEngine/service';
import { accountingRulesEngineService } from '@/governance/domains/accountingRulesEngine/service';
import { businessEventOrchestratorService } from '@/governance/domains/businessEventOrchestrator/service';
import type { Employee } from '../pages/Employees';

function parseFunctionResult<T>(data: T | null, error: Error | null): T {
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** Minimal row shapes for edge-function query results (typing only). */
export type BillQueryRow = {
  id: string;
  journal_entry_id?: string | null;
  entry_date: string;
  due_date?: string;
  description: string | null;
  status: string;
  vendor_id: string;
  vendors: { name: string }[] | null;
  total: number;
  bill_number: string | null;
  attachment_url: string | null;
};

export type FixedAssetRow = {
  id: string;
  asset_code: string;
  description: string;
  name?: string;
  purchase_date: string;
  purchase_cost: number;
  accumulated_depreciation: number;
  net_book_value: number;
  status: string;
  useful_life_years?: number | null;
  last_depreciation_date?: string | null;
  category_id?: string | null;
  location?: string | null;
  department?: string | null;
  custodian_name?: string | null;
  assigned_to_employee_id?: string | null;
  impairment_amount?: number | null;
  depreciation_ytd?: number | null;
  verification_status?: string | null;
  last_verified_at?: string | null;
  next_verification_due?: string | null;
  verified_by_name?: string | null;
  qr_code?: string | null;
  barcode?: string | null;
  asset_tag?: string | null;
  serial_number?: string | null;
  asset_categories: { name: string } | null;
  employees?: {
    employee_number?: string;
    first_name?: string;
    last_name?: string;
    department?: string | null;
  } | null;
};

export type PayrollRunRow = {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  status: string;
};

export type EmployeePayrollHistoryRow = {
  id: string;
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  email_sent_at?: string | null;
  payment_status?: string;
  payroll_runs: {
    id: string;
    pay_period_start: string;
    pay_period_end: string;
    pay_date: string;
    status: string;
    journal_entry_id?: string | null;
  };
};

export type PayrollRuleCatalogItem = {
  id: string;
  name: string;
  category: string;
  enabled_by_default: boolean;
  company_configurable: boolean;
  payslip_label: string;
  description?: string;
};

export type PayrollRuleConfigMap = Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;

export type PayrollSettingsData = {
  catalog?: PayrollRuleCatalogItem[];
  effective_rules?: PayrollRuleConfigMap;
  company_defaults?: PayrollRuleConfigMap;
};

export type PayrollRunRuleConfigData = {
  catalog?: PayrollRuleCatalogItem[];
  company_defaults?: PayrollRuleConfigMap;
  run?: { rule_config?: { rules?: PayrollRuleConfigMap } & PayrollRuleConfigMap };
  effective_rules?: PayrollRuleConfigMap;
};

// ARCHITECTURE NOTE:
// These query definitions are used by both the page components (with useQuery)
// and the sidebar (with prefetchQuery) to ensure query keys and functions are consistent.

export const vendorsQuery = (companyId: string) => ({
  queryKey: ['vendors', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('vendors', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const customersQuery = (companyId: string) => ({
  queryKey: ['customers', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('customers', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const accountsQuery = (companyId: string) => ({
  queryKey: ['accounts', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const coaTemplatesQuery = (companyId: string) => ({
  queryKey: ['coa-templates', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
      body: { method: 'LIST_TEMPLATES', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const invoicesQuery = (companyId: string, filters?: any) => ({
  queryKey: ['invoices', companyId, filters],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('invoices', {
      body: { method: 'GET_ALL', company_id: companyId, filters },
    });
    return parseFunctionResult(data, error);
  },
});

export const recurringInvoicesQuery = (companyId: string) => ({
  queryKey: ['recurring_invoices', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('recurring-invoices', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const quotesQuery = (companyId: string) => ({
  queryKey: ['quotes', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('quotes', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const creditNotesQuery = (companyId: string) => ({
  queryKey: ['credit_notes', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('credit-notes', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const revenueWorkspaceQuery = (companyId: string, dateFrom?: string, dateTo?: string) => {
  const from = dateFrom ?? format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const to = dateTo ?? format(endOfMonth(new Date()), 'yyyy-MM-dd');
  return {
    queryKey: ['revenue_workspace', companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('dashboard-data', {
        body: {
          company_id: companyId,
          date_from: from,
          date_to: to,
        },
      });
      return parseFunctionResult(data, error);
    },
  };
};

function mapBillTotal(entry: { journal_entry_items?: { type: string; amount: number }[] }) {
  return (
    entry.journal_entry_items
      ?.filter((item) => item.type === 'credit')
      .reduce((sum, item) => sum + item.amount, 0) || 0
  );
}

export const purchasesWorkspaceQuery = (companyId: string, dateFrom?: string, dateTo?: string) => {
  const from = dateFrom ?? format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const to = dateTo ?? format(endOfMonth(new Date()), 'yyyy-MM-dd');
  return {
    queryKey: ['purchases_workspace', companyId, from, to],
    queryFn: async () => {
      const [dashboardRes, billsRes, posRes, recurringRes] = await Promise.all([
        supabase.functions.invoke('dashboard-data', {
          body: { company_id: companyId, date_from: from, date_to: to },
        }),
        supabase.functions.invoke('bills', {
          body: { method: 'GET', company_id: companyId, filters: { status: 'open' } },
        }),
        supabase.functions.invoke('purchase-orders', {
          body: { method: 'GET_ALL', company_id: companyId },
        }),
        supabase.functions.invoke('recurring-bills', {
          body: { method: 'GET_ALL', company_id: companyId },
        }),
      ]);

      const dashboard = parseFunctionResult(dashboardRes.data, dashboardRes.error);
      const billsData = parseFunctionResult<Record<string, unknown>[] | null>(billsRes.data, billsRes.error) ?? [];
      const purchaseOrders = parseFunctionResult(posRes.data, posRes.error) ?? [];
      const recurringBills = parseFunctionResult(recurringRes.data, recurringRes.error) ?? [];

      const openBills = billsData.map((entry) => ({
        ...entry,
        total: mapBillTotal(entry as { journal_entry_items?: { type: string; amount: number }[] }),
      }));

      return {
        ...dashboard,
        openBillsList: openBills,
        purchaseOrders,
        recurringBills,
      };
    },
  };
};

export const vendorCreditsQuery = (companyId: string) => ({
  queryKey: ['vendor_credits', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('vendor-credits', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const recurringBillsQuery = (companyId: string) => ({
  queryKey: ['recurring_bills', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('recurring-bills', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const billsQuery = (companyId: string, filters?: Record<string, unknown>) => ({
  queryKey: ['bills', companyId, filters],
  queryFn: async (): Promise<BillQueryRow[]> => {
    const { data, error } = await supabase.functions.invoke('bills', {
      body: { method: 'GET', company_id: companyId, filters },
    });
    const result = parseFunctionResult<Record<string, unknown>[] | null>(data, error);
    if (!result) return [];
    return result.map((entry) => ({
      ...entry,
      total: mapBillTotal(entry as { journal_entry_items?: { type: string; amount: number }[] }),
    })) as BillQueryRow[];
  },
});

export const productsQuery = (companyId: string) => ({
  queryKey: ['products', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('products', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const employeesQuery = (companyId: string) => ({
  queryKey: ['employees', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('employees', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const employeeTimelineQuery = (companyId: string, employeeId: string) => ({
  queryKey: ['employee_timeline', companyId, employeeId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('employees', {
      body: { method: 'GET_TIMELINE', company_id: companyId, employee_id: employeeId },
    });
    return parseFunctionResult(data, error);
  },
});

export const payrollRunsQuery = (companyId: string) => ({
  queryKey: ['payroll_runs', companyId],
  queryFn: async () =>
    invokePayroll<PayrollRunRow[]>({ method: 'GET_RUNS', company_id: companyId }),
});

export const employeePayrollHistoryQuery = (companyId: string, employeeId: string) => ({
  queryKey: ['employee_payroll_history', companyId, employeeId],
  queryFn: async () =>
    invokePayroll<EmployeePayrollHistoryRow[]>({
      method: 'GET_EMPLOYEE_PAYROLL_HISTORY',
      company_id: companyId,
      employeeId,
    }),
  enabled: !!companyId && !!employeeId,
  retry: false,
});

export const payrollRunSummaryQuery = (companyId: string, runId: string) => ({
  queryKey: ['payroll_run_summary', runId, companyId],
  queryFn: async () => invokePayroll({ method: 'GET_RUN_SUMMARY', company_id: companyId, runId }),
  enabled: !!companyId && !!runId,
});

export const expenseClaimsQuery = (companyId: string) => ({
  queryKey: ['expense_claims', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('expense-claims', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const payrollWorkspaceQuery = (companyId: string) => ({
  queryKey: ['payroll_workspace', companyId],
  queryFn: async () => {
    const [runsRes, employeesRes, claimsRes] = await Promise.all([
      invokePayroll({ method: 'GET_RUNS', company_id: companyId }).then(
        (data) => ({ data, error: null }),
        (err: Error) => ({ data: null, error: err })
      ),
      supabase.functions.invoke('employees', { body: { method: 'GET', company_id: companyId } }),
      supabase.functions.invoke('expense-claims', { body: { method: 'GET_ALL', company_id: companyId } }),
    ]);

    const runs = parseFunctionResult(runsRes.data, runsRes.error) as {
      id: string;
      pay_period_start: string;
      pay_period_end: string;
      pay_date: string;
      status: string;
    }[];
    const employees = parseFunctionResult(employeesRes.data, employeesRes.error) as Employee[];
    const claims = parseFunctionResult(claimsRes.data, claimsRes.error) as {
      id: string;
      claim_number: string;
      submission_date: string;
      total_amount: number;
      status: string;
      employee_id?: string;
      employees?: { first_name: string; last_name: string };
    }[];

    const runsNeedingPayslips = runs.filter(
      (r) => r.status === 'draft' || r.status === 'processing' || isRunFinalized(r.status)
    ).slice(0, 4);

    const payslipNetByRunId: Record<string, number> = {};
    const runMetaById: Record<string, { output_metadata?: Record<string, unknown> }> = {};
    await Promise.all(
      runsNeedingPayslips.map(async (run) => {
        try {
          const data = await invokePayroll<{ payslips?: { net_pay: number }[]; run?: { output_metadata?: Record<string, unknown> } }>({
            method: 'GET_RUN_DETAIL',
            company_id: companyId,
            runId: run.id,
          });
          if (!data?.payslips) return;
          payslipNetByRunId[run.id] = data.payslips.reduce(
            (sum, p) => sum + (p.net_pay || 0),
            0
          );
          if (data.run) {
            runMetaById[run.id] = data.run;
          }
        } catch {
          // Best-effort workspace enrichment; do not fail the whole workspace load.
        }
      })
    );

    const lastProcessedRun = runs.find((r) => isRunFinalized(r.status));
    let lastProcessedSummary = null;
    if (lastProcessedRun) {
      try {
        lastProcessedSummary = await invokePayroll({
          method: 'GET_RUN_SUMMARY',
          company_id: companyId,
          runId: lastProcessedRun.id,
        });
      } catch {
        // Summary is optional for workspace metrics.
      }
    }

    return buildWorkspaceSummary(employees, runs, claims, payslipNetByRunId, {
      lastProcessedSummary,
      lastProcessedRunMeta: lastProcessedRun ? runMetaById[lastProcessedRun.id] ?? null : null,
    });
  },
});

export const payrollPeriodReportsQuery = (companyId: string, startDate: string, endDate: string) => ({
  queryKey: ['payroll_period_reports', companyId, startDate, endDate],
  queryFn: async () => fetchPayrollPeriodReports(companyId, startDate, endDate),
  enabled: !!companyId && !!startDate && !!endDate,
});

function snapshotEmployerContributions(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const raw = Number((snapshot as { total_employer_contributions?: unknown }).total_employer_contributions ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

async function fetchPayrollPeriodReports(companyId: string, startDate: string, endDate: string) {
  const runs = await invokePayroll<{
    id: string;
    pay_date: string;
    status: string;
  }[]>({ method: 'GET_RUNS', company_id: companyId });

  const processedInRange = runs.filter(
    (r) => isRunFinalized(r.status) && r.pay_date >= startDate && r.pay_date <= endDate
  );

  const payslips: {
    employee_number?: string;
    employee: string;
    department: string;
    cost_centre?: string;
    employee_group?: string;
    pay_date: string;
    gross_pay: number;
    total_deductions: number;
    net_pay: number;
    employer_contributions: number;
    items: { description: string; type: 'earning' | 'deduction' | 'employer_contribution'; amount: number }[];
    status: string;
  }[] = [];

  for (const run of processedInRange) {
    let detail: { payslips?: { id: string; payment_status?: string }[] } | null = null;
    try {
      detail = await invokePayroll({
        method: 'GET_RUN_DETAIL',
        company_id: companyId,
        runId: run.id,
      });
    } catch {
      continue;
    }
    if (!detail?.payslips) continue;

    for (const payslip of detail.payslips) {
      let payslipDetail: {
        employees: {
          employee_number?: string;
          first_name: string;
          last_name: string;
          department?: string;
          branch?: string;
          position?: string;
        };
        total_earnings: number;
        total_deductions: number;
        net_pay: number;
        calculation_snapshot?: Record<string, unknown>;
        payslip_items?: { description: string; type: 'earning' | 'deduction' | 'employer_contribution'; amount: number }[];
      } | null = null;
      try {
        payslipDetail = await invokePayroll({
          method: 'GET_PAYSLIP_DETAIL',
          company_id: companyId,
          payslipId: payslip.id,
        });
      } catch {
        continue;
      }
      if (!payslipDetail) continue;

      payslips.push({
        employee_number:
          payslipDetail.employees.employee_number
          ?? (typeof payslipDetail.calculation_snapshot?.employee_number === 'string'
            ? payslipDetail.calculation_snapshot.employee_number
            : undefined),
        employee: `${payslipDetail.employees.first_name} ${payslipDetail.employees.last_name}`,
        department: payslipDetail.employees.department ?? '—',
        cost_centre: payslipDetail.employees.branch ?? payslipDetail.employees.department ?? '—',
        employee_group: payslipDetail.employees.position ?? 'Ungrouped',
        pay_date: run.pay_date,
        gross_pay: payslipDetail.total_earnings,
        total_deductions: payslipDetail.total_deductions,
        net_pay: payslipDetail.net_pay,
        employer_contributions: snapshotEmployerContributions(payslipDetail.calculation_snapshot),
        items: payslipDetail.payslip_items ?? [],
        status: payslip.payment_status ?? 'paid',
      });
    }
  }

  return {
    period: { start: startDate, end: endDate },
    payslips,
    run_count: processedInRange.length,
  };
}

export const payrollSummaryQuery = (companyId: string, startDate: string, endDate: string) => ({
  queryKey: ['payrollSummary', startDate, endDate, companyId],
  queryFn: async () => {
    const runs = await invokePayroll<{
      id: string;
      pay_date: string;
      status: string;
    }[]>({ method: 'GET_RUNS', company_id: companyId });

    const processedInRange = runs.filter(
      (r) => isRunFinalized(r.status) && r.pay_date >= startDate && r.pay_date <= endDate
    );

    const allItems: { description: string; type: 'earning' | 'deduction'; amount: number }[] = [];

    for (const run of processedInRange) {
      let detail: { payslips?: { id: string }[] } | null = null;
      try {
        detail = await invokePayroll({
          method: 'GET_RUN_DETAIL',
          company_id: companyId,
          runId: run.id,
        });
      } catch {
        continue;
      }
      if (!detail?.payslips) continue;

      for (const payslip of detail.payslips) {
        let payslipDetail: { payslip_items?: { description: string; type: 'earning' | 'deduction'; amount: number }[] } | null = null;
        try {
          payslipDetail = await invokePayroll({
            method: 'GET_PAYSLIP_DETAIL',
            company_id: companyId,
            payslipId: payslip.id,
          });
        } catch {
          continue;
        }
        if (!payslipDetail?.payslip_items) continue;
        for (const item of payslipDetail.payslip_items) {
          allItems.push(item);
        }
      }
    }

    return aggregatePayrollSummaryItems(allItems);
  },
});

export const loansQuery = (companyId: string) => ({
  queryKey: ['loans', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('loans', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const fixedAssetsQuery = (companyId: string) => ({
  queryKey: ['fixed_assets', companyId],
  queryFn: async (): Promise<FixedAssetRow[]> => {
    const { data, error } = await supabase.functions.invoke('fixed-assets', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    const result = parseFunctionResult<Record<string, unknown>[] | null>(data, error) ?? [];
    return result.map((asset) => ({
      ...asset,
      net_book_value:
        Number(asset.purchase_cost ?? 0) - Number(asset.accumulated_depreciation ?? 0),
    })) as FixedAssetRow[];
  },
});

export type AssetRegisterQueryParams = {
  page: number;
  pageSize: number;
  filters: import('./assets/eamTypes').AssetRegisterFilters;
};

export const assetRegisterQuery = (companyId: string, params: AssetRegisterQueryParams) => ({
  queryKey: ['asset_register', companyId, params],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('fixed-assets', {
      body: {
        method: 'GET_REGISTER',
        company_id: companyId,
        page: params.page,
        pageSize: params.pageSize,
        filters: params.filters,
      },
    });
    return parseFunctionResult(data, error) as {
      rows: FixedAssetRow[];
      totalCount: number;
      page: number;
      pageSize: number;
      kpis: import('./assets/eamTypes').AssetRegisterKpis;
    };
  },
});

export const assetRegisterFacetsQuery = (companyId: string) => ({
  queryKey: ['asset_register_facets', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('fixed-assets', {
      body: { method: 'GET_REGISTER_FACETS', company_id: companyId },
    });
    return parseFunctionResult(data, error) as {
      categories: { id: string; name: string }[];
      departments: string[];
      custodians: string[];
      locations: string[];
      statuses: string[];
    };
  },
});

export const peekNextAssetCodeQuery = (companyId: string, enabled: boolean) => ({
  queryKey: ['peek_next_asset_code', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('fixed-assets', {
      body: { method: 'PEEK_NEXT_ASSET_CODE', company_id: companyId },
    });
    const parsed = parseFunctionResult(data, error) as { asset_code?: string };
    return parsed?.asset_code ?? '';
  },
  enabled,
});

export const assetCategoriesQuery = (companyId: string) => ({
  queryKey: ['asset_categories', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('asset-categories', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const recurringEntriesQuery = (companyId: string) => ({
  queryKey: ['recurring_entries', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('recurring-entries', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const budgetsQuery = (companyId: string) => ({
  queryKey: ['budgets_with_activity', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('budgets', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const messagesQuery = (companyId: string) => ({
  queryKey: ['messages', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('messages', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const teamMembersQuery = (companyId: string) => ({
  queryKey: ['company_members', companyId],
  // Phase G3.6 — team members resolve through Governance Security Service.
  // Raw edge shape preserved for Chat and other consumers.
  queryFn: async () => securityService.getCompanyMembersRaw(companyId),
});

export const customerBalancesQuery = (companyId: string) => ({
  queryKey: ['customer_ar_balances', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('payments', {
      body: { method: 'GET_AR_BALANCES', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const vendorBalancesQuery = (companyId: string) => ({
  queryKey: ['vendor_ap_balances', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('payments', {
      body: { method: 'GET_AP_BALANCES', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const taxRatesQuery = (companyId: string) => ({
  queryKey: ['tax_rates', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('tax-rates', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const accountingReadinessQuery = (companyId: string) => ({
  queryKey: ['accountingReadiness', companyId],
  queryFn: async () => accountingReadinessService.getStatus(companyId),
});

export const accountingHealthQuery = (companyId: string) => ({
  queryKey: ['accountingHealth', companyId],
  queryFn: async () => accountingHealthService.getHealth(companyId),
});

export const accountingPolicyDashboardQuery = (companyId: string) => ({
  queryKey: ['accountingPolicyDashboard', companyId],
  queryFn: async () => accountingPolicyEngineService.getDashboard(companyId),
});

export const accountingRulesDashboardQuery = (companyId: string) => ({
  queryKey: ['accountingRulesDashboard', companyId],
  queryFn: async () => accountingRulesEngineService.getDashboard(companyId),
});

export const businessEventsDashboardQuery = (companyId: string) => ({
  queryKey: ['businessEventsDashboard', companyId],
  queryFn: async () => businessEventOrchestratorService.getDashboard(companyId),
});

export const projectsQuery = (companyId: string) => ({
  queryKey: ['projects', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('projects', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const timesheetsQuery = (companyId: string) => ({
  queryKey: ['timesheets', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('timesheets', {
      body: { method: 'GET', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const purchaseOrdersQuery = (companyId: string) => ({
  queryKey: ['purchase_orders', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('purchase-orders', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    return parseFunctionResult(data, error);
  },
});

export const payrollSettingsQuery = (companyId: string) => ({
  queryKey: ['payroll_settings', companyId],
  queryFn: async () =>
    invokePayroll<PayrollSettingsData>({ method: 'GET_PAYROLL_SETTINGS', company_id: companyId }),
});

export const payrollRunRuleConfigQuery = (companyId: string, runId: string) => ({
  queryKey: ['payroll_run_rule_config', runId, companyId],
  queryFn: async () =>
    invokePayroll<PayrollRunRuleConfigData>({
      method: 'GET_RUN_RULE_CONFIG',
      company_id: companyId,
      runId,
    }),
});

export type InventoryRegisterData = {
  products: Record<string, unknown>[];
  balances: Record<string, unknown>[];
};

export const inventoryBootstrapQuery = (companyId: string) => ({
  queryKey: ['inventory_bootstrap', companyId],
  queryFn: () => invokeInventory<{ warehouse: { id: string; code: string; name: string } }>(companyId, { method: 'BOOTSTRAP' }),
});

export const inventoryRegisterQuery = (companyId: string) => ({
  queryKey: ['inventory_register', companyId],
  queryFn: () => invokeInventory<InventoryRegisterData>(companyId, { method: 'GET_REGISTER' }),
});

export const inventoryWarehousesQuery = (companyId: string) => ({
  queryKey: ['inventory_warehouses', companyId],
  queryFn: () => invokeInventory<Record<string, unknown>[]>(companyId, { method: 'LIST_WAREHOUSES' }),
});

export const inventoryLocationsQuery = (companyId: string, warehouseId: string) => ({
  queryKey: ['inventory_locations', companyId, warehouseId],
  queryFn: () =>
    invokeInventory<Record<string, unknown>[]>(companyId, {
      method: 'LIST_LOCATIONS',
      warehouseId,
    }),
});

export const inventoryUomQuery = (companyId: string) => ({
  queryKey: ['inventory_uom', companyId],
  queryFn: () => invokeInventory<Record<string, unknown>[]>(companyId, { method: 'LIST_UOM' }),
});

export const inventoryMovementsQuery = (companyId: string, limit = 200) => ({
  queryKey: ['inventory_movements', companyId, limit],
  queryFn: () => invokeInventory<Record<string, unknown>[]>(companyId, { method: 'GET_MOVEMENTS', limit }),
});

export const inventoryValuationEdgeQuery = (companyId: string) => ({
  queryKey: ['inventory_valuation_edge', companyId],
  queryFn: () => invokeInventory<Record<string, unknown>[]>(companyId, { method: 'GET_VALUATION' }),
});

export const inventoryAnalyticsQuery = (companyId: string) => ({
  queryKey: ['inventory_analytics', companyId],
  queryFn: () =>
    invokeInventory<{
      products: Record<string, unknown>[];
      balances: Record<string, unknown>[];
      movements: Record<string, unknown>[];
      warehouses: Record<string, unknown>[];
    }>(companyId, { method: 'ANALYTICS' }),
});

export const inventoryGoodsReceiptsQuery = (companyId: string) => ({
  queryKey: ['inventory_goods_receipts', companyId],
  queryFn: () => invokeInventory<Record<string, unknown>[]>(companyId, { method: 'LIST_GOODS_RECEIPTS' }),
});

export const inventoryTransfersQuery = (companyId: string) => ({
  queryKey: ['inventory_transfers', companyId],
  queryFn: () => invokeInventory<Record<string, unknown>[]>(companyId, { method: 'LIST_TRANSFERS' }),
});

export const inventoryCycleCountsQuery = (companyId: string) => ({
  queryKey: ['inventory_cycle_counts', companyId],
  queryFn: () => invokeInventory<Record<string, unknown>[]>(companyId, { method: 'LIST_CYCLE_COUNTS' }),
});

// ── Banking (ERP V3.0 Phase 3C) ─────────────────────────────────────────
// All reads/writes route through the existing `banking` edge function's
// methods (GET_BANK_ACCOUNTS / GET_TRANSACTIONS / GET_STATEMENT_LINES /
// GET_OUTSTANDING) plus the existing `journal-entries` GET method's generic
// `select` passthrough for drill-down — no edge function code changes.

import type { BankAccount, BankTransaction, BankStatementLine, BankTransferView } from './banking/types';

export const bankAccountsQuery = (companyId: string) => ({
  queryKey: ['bank_accounts', companyId],
  queryFn: async (): Promise<BankAccount[]> => {
    const { data, error } = await supabase.functions.invoke('banking', {
      body: { method: 'GET_BANK_ACCOUNTS', company_id: companyId },
    });
    return parseFunctionResult<BankAccount[] | null>(data, error) ?? [];
  },
});

export const bankTransactionsQuery = (companyId: string, bankAccountId?: string) => ({
  queryKey: ['bank_transactions', companyId, bankAccountId ?? 'all'],
  queryFn: async (): Promise<BankTransaction[]> => {
    const { data, error } = await supabase.functions.invoke('banking', {
      body: { method: 'GET_TRANSACTIONS', company_id: companyId, bankAccountId },
    });
    return parseFunctionResult<BankTransaction[] | null>(data, error) ?? [];
  },
});

/**
 * Bank-to-bank transfers, derived client-side by pairing the transfer_out /
 * transfer_in legs GET_TRANSACTIONS already returns for a shared transfer_id
 * (no dedicated GET_TRANSFERS method exists — Banking's backend is frozen
 * this phase, so this composes from what's already exposed rather than
 * adding one).
 */
export const bankTransfersQuery = (companyId: string) => ({
  queryKey: ['bank_transfers_view', companyId],
  queryFn: async (): Promise<BankTransferView[]> => {
    const { data, error } = await supabase.functions.invoke('banking', {
      body: { method: 'GET_TRANSACTIONS', company_id: companyId },
    });
    const rows = parseFunctionResult<BankTransaction[] | null>(data, error) ?? [];
    const legs = rows.filter((r) => r.transfer_id && (r.transaction_type === 'transfer_in' || r.transaction_type === 'transfer_out'));
    const byTransfer = new Map<string, BankTransaction[]>();
    for (const leg of legs) {
      const key = leg.transfer_id as string;
      if (!byTransfer.has(key)) byTransfer.set(key, []);
      byTransfer.get(key)!.push(leg);
    }
    const views: BankTransferView[] = [];
    for (const [transferId, transferLegs] of byTransfer) {
      const out = transferLegs.find((l) => l.transaction_type === 'transfer_out');
      const inn = transferLegs.find((l) => l.transaction_type === 'transfer_in');
      if (!out || !inn) continue;
      views.push({
        transfer_id: transferId,
        transfer_date: out.transaction_date,
        amount: out.amount,
        description: out.description,
        from_bank_account_id: out.bank_account_id,
        from_bank_account_name: out.bank_accounts?.name ?? 'Unknown',
        to_bank_account_id: inn.bank_account_id,
        to_bank_account_name: inn.bank_accounts?.name ?? 'Unknown',
        posting_request_id: out.posting_request_id,
        journal_entry_id: out.journal_entry_id,
        created_by: out.created_by,
        created_at: out.created_at,
      });
    }
    return views.sort((a, b) => (a.transfer_date < b.transfer_date ? 1 : -1));
  },
});

export const bankStatementLinesQuery = (companyId: string, bankAccountId?: string, matchStatus?: string) => ({
  queryKey: ['bank_statement_lines', companyId, bankAccountId ?? 'all', matchStatus ?? 'all'],
  queryFn: async (): Promise<BankStatementLine[]> => {
    const { data, error } = await supabase.functions.invoke('banking', {
      body: { method: 'GET_STATEMENT_LINES', company_id: companyId, bankAccountId, matchStatus },
    });
    return parseFunctionResult<BankStatementLine[] | null>(data, error) ?? [];
  },
});

export const bankOutstandingLinesQuery = (companyId: string, bankAccountId?: string) => ({
  queryKey: ['bank_outstanding_lines', companyId, bankAccountId ?? 'all'],
  queryFn: async (): Promise<BankStatementLine[]> => {
    const { data, error } = await supabase.functions.invoke('banking', {
      body: { method: 'GET_OUTSTANDING', company_id: companyId, bankAccountId },
    });
    return parseFunctionResult<BankStatementLine[] | null>(data, error) ?? [];
  },
});

/**
 * Candidate journal_entry_items for statement-line matching — reuses
 * journal-entries GET's existing `account_id`/`date_from`/`date_to` filters
 * and `select` passthrough (no edge function change). Filters to unreconciled
 * items on the account client-side.
 */
export const journalEntryItemCandidatesQuery = (companyId: string, chartOfAccountId: string, dateFrom?: string, dateTo?: string) => ({
  queryKey: ['journal_entry_item_candidates', companyId, chartOfAccountId, dateFrom, dateTo],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('journal-entries', {
      body: {
        method: 'GET', company_id: companyId,
        select: `id, entry_date, description, journal_entry_items ( id, type, amount, account_id, reconciled )`,
        filters: { account_id: chartOfAccountId, date_from: dateFrom, date_to: dateTo },
      },
    });
    const rows = parseFunctionResult<{
      id: string; entry_date: string; description: string | null;
      journal_entry_items: { id: string; type: 'debit' | 'credit'; amount: number; account_id: string; reconciled: boolean | null }[];
    }[] | null>(data, error) ?? [];
    return rows.flatMap((je) =>
      je.journal_entry_items
        .filter((item) => item.account_id === chartOfAccountId && !item.reconciled)
        .map((item) => ({ ...item, entry_date: je.entry_date, journal_description: je.description, journal_entry_id: je.id }))
    );
  },
  enabled: !!chartOfAccountId,
});

/** Journal + its Posting Request in one call, via journal-entries GET's existing generic `select` passthrough (reverse FK embed — no edge function change). */
export const journalWithPostingRequestQuery = (companyId: string, journalEntryId: string | null | undefined) => ({
  queryKey: ['journal_with_posting_request', companyId, journalEntryId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('journal-entries', {
      body: {
        method: 'GET',
        company_id: companyId,
        select: `
          id, entry_date, description, journal_number, attachment_url,
          posting_requests!journal_entry_id ( id, module, document_type, status, source, correlation_id, warnings, committed_at, journal_number ),
          journal_entry_items ( type, amount, chart_of_accounts!account_id ( name ) )
        `,
        filters: { id: journalEntryId },
      },
    });
    return parseFunctionResult(data, error) as {
      id: string; entry_date: string; description: string | null; journal_number: string | null; attachment_url: string | null;
      posting_requests: { id: string; module: string; document_type: string | null; status: string; source: string | null; correlation_id: string | null; warnings: unknown; committed_at: string | null; journal_number: string | null }[] | null;
      journal_entry_items: { type: 'debit' | 'credit'; amount: number; chart_of_accounts: { name: string } | null }[];
    } | null;
  },
  enabled: !!journalEntryId && !!companyId,
});