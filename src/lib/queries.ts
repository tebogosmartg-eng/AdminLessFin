import { supabase } from '../integrations/supabase/client';

// ARCHITECTURE NOTE:
// These query definitions are used by both the page components (with useQuery)
// and the sidebar (with prefetchQuery) to ensure query keys and functions are consistent.

export const vendorsQuery = (companyId: string) => ({
  queryKey: ['vendors', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('vendors', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const customersQuery = (companyId: string) => ({
  queryKey: ['customers', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('customers', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const accountsQuery = (companyId: string) => ({
  queryKey: ['accounts', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('chart-of-accounts', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const invoicesQuery = (companyId: string) => ({
  queryKey: ['invoices', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('invoices', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const quotesQuery = (companyId: string) => ({
  queryKey: ['quotes', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('quotes', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const billsQuery = (companyId: string) => ({
  queryKey: ['bills', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('bills', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    if (!data) return [];
    return data.map((entry: any) => ({
      ...entry,
      total: entry.journal_entry_items
        .filter((item: any) => item.type === 'credit')
        .reduce((sum: number, item: any) => sum + item.amount, 0),
    }));
  },
});

export const productsQuery = (companyId: string) => ({
  queryKey: ['products', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('products', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const employeesQuery = (companyId: string) => ({
  queryKey: ['employees', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('employees', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const payrollRunsQuery = (companyId: string) => ({
  queryKey: ['payroll_runs', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('payroll', {
      body: { method: 'GET_RUNS', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const loansQuery = (companyId: string) => ({
  queryKey: ['loans', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('loans', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const fixedAssetsQuery = (companyId: string) => ({
  queryKey: ['fixed_assets', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('fixed-assets', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data.map((asset: any) => ({
      ...asset,
      net_book_value: asset.purchase_cost - asset.accumulated_depreciation,
    }));
  },
});

export const assetCategoriesQuery = (companyId: string) => ({
  queryKey: ['asset_categories', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('asset-categories', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw error;
    return data;
  },
});

export const recurringEntriesQuery = (companyId: string) => ({
  queryKey: ['recurring_entries', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('recurring-entries', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const budgetsQuery = (companyId: string) => ({
  queryKey: ['budgets_with_activity', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('budgets', {
      body: { method: 'GET_ALL', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const customerBalancesQuery = (companyId: string) => ({
  queryKey: ['customer_ar_balances', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('payments', {
      body: { method: 'GET_AR_BALANCES', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const vendorBalancesQuery = (companyId: string) => ({
  queryKey: ['vendor_ap_balances', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('payments', {
      body: { method: 'GET_AP_BALANCES', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const taxRatesQuery = (companyId: string) => ({
  queryKey: ['tax_rates', companyId],
  queryFn: async () => {
    const { data, error } = await supabase.functions.invoke('tax-rates', {
      body: { method: 'GET', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return data;
  },
});