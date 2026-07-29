import { supabase } from '@/integrations/supabase/client';
import { isPlatformErrorEnvelope, PlatformError } from '@/lib/platform/platformError';
import type { QuickCreateConfig } from './QuickCreateDialog';
import type { SmartSelectOption } from './SmartSelect';

/**
 * Create-on-the-Fly configs for every master-data entity that has a backing
 * endpoint today (customers, suppliers, products/services, revenue & expense
 * accounts, tax codes, projects). Each config keeps the modal lightweight and
 * owns the accounting-engine coupling (e.g. product costing defaults) so the UI
 * never has to know about it. New entities slot in here as their endpoints land.
 */

interface BaseCtx {
  companyId: string;
}

/**
 * supabase.functions.invoke() surfaces a generic "non-2xx" message; the real
 * platform-error envelope only lives on error.context (a Response). Unwrap it so
 * the create modal shows the server's actual diagnosis, then return the inserted
 * row.
 */
async function invokeCreate(fn: string, body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data;

  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const envelope = await (context as Response).json();
      if (isPlatformErrorEnvelope(envelope)) throw new PlatformError(envelope);
      if (envelope?.error || envelope?.message) throw new Error(envelope.error ?? envelope.message);
    } catch (parsed) {
      if (parsed instanceof Error) throw parsed;
    }
  }
  throw new Error((error as Error).message || `Could not create ${fn} record.`);
}

function toOption(row: { id: string }, label: string): SmartSelectOption {
  return { value: row.id, label };
}

export function customerCreateConfig({ companyId }: BaseCtx): QuickCreateConfig {
  return {
    title: 'New Customer',
    fields: [
      { name: 'name', label: 'Customer name', type: 'text', required: true, prefillFromSearch: true },
    ],
    submitLabel: 'Create customer',
    create: async (values) => {
      const row = await invokeCreate('customers', {
        method: 'POST',
        company_id: companyId,
        customerData: { name: values.name.trim() },
      });
      return toOption(row, row.name ?? values.name.trim());
    },
  };
}

export function vendorCreateConfig({ companyId }: BaseCtx): QuickCreateConfig {
  return {
    title: 'New Supplier',
    fields: [
      { name: 'name', label: 'Supplier name', type: 'text', required: true, prefillFromSearch: true },
    ],
    submitLabel: 'Create supplier',
    create: async (values) => {
      const row = await invokeCreate('vendors', {
        method: 'POST',
        company_id: companyId,
        vendorData: { name: values.name.trim() },
      });
      return toOption(row, row.name ?? values.name.trim());
    },
  };
}

interface ProductCtx extends BaseCtx {
  /** Income accounts the product's sales post to (required by the product model). */
  incomeAccounts: { id: string; name: string }[];
  defaultIncomeAccountId?: string;
}

export function productCreateConfig({
  companyId,
  incomeAccounts,
  defaultIncomeAccountId,
}: ProductCtx): QuickCreateConfig {
  return {
    title: 'New Product / Service',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, prefillFromSearch: true },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        defaultValue: 'service',
        options: [
          { value: 'service', label: 'Service' },
          { value: 'inventory', label: 'Inventory' },
        ],
      },
      {
        name: 'income_account_id',
        label: 'Income account',
        type: 'select',
        required: true,
        defaultValue: defaultIncomeAccountId,
        options: incomeAccounts.map((a) => ({ value: a.id, label: a.name })),
      },
      { name: 'price', label: 'Sales price', type: 'number', step: '0.01' },
    ],
    submitLabel: 'Create item',
    create: async (values) => {
      const type = values.type === 'inventory' ? 'inventory' : 'service';
      const row = await invokeCreate('products', {
        method: 'POST',
        company_id: companyId,
        // Mirrors ProductForm's persistence contract so the accounting engine sees
        // a fully-formed product: services and goods both carry a costing method,
        // and inventory items get an item_class. Advanced fields default here and
        // can be refined later on the Products page.
        productData: {
          name: values.name.trim(),
          type,
          income_account_id: values.income_account_id,
          price: values.price ? Number(values.price) : 0,
          item_class: type === 'inventory' ? 'stock' : 'service',
          cost_method: 'weighted_average',
        },
      });
      return toOption(row, row.name ?? values.name.trim());
    },
  };
}

type AccountKind = 'Income' | 'Expense';

/** Revenue / expense account created against the certified Chart of Accounts. */
export function accountCreateConfig(
  { companyId }: BaseCtx,
  kind: AccountKind,
): QuickCreateConfig {
  const noun = kind === 'Income' ? 'revenue account' : 'expense account';
  return {
    title: kind === 'Income' ? 'New Revenue Account' : 'New Expense Account',
    description: `Creates a ${kind} account. A code is assigned automatically; refine it later in the Chart of Accounts.`,
    fields: [
      { name: 'name', label: 'Account name', type: 'text', required: true, prefillFromSearch: true },
    ],
    submitLabel: `Create ${noun}`,
    create: async (values) => {
      const row = await invokeCreate('chart-of-accounts', {
        method: 'POST',
        company_id: companyId,
        accountData: { name: values.name.trim(), type: kind },
      });
      return toOption(row, row.name ?? values.name.trim());
    },
  };
}

export function taxRateCreateConfig({ companyId }: BaseCtx): QuickCreateConfig {
  return {
    title: 'New Tax Code',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, prefillFromSearch: true, placeholder: 'e.g. VAT 15%' },
      { name: 'rate', label: 'Rate %', type: 'number', required: true, step: '0.01' },
    ],
    submitLabel: 'Create tax code',
    create: async (values) => {
      const row = await invokeCreate('tax-rates', {
        method: 'POST',
        company_id: companyId,
        taxRateData: { name: values.name.trim(), rate: Number(values.rate) },
      });
      const label = row.name ?? `${row.rate ?? values.rate}%`;
      return toOption(row, label);
    },
  };
}

export function projectCreateConfig({ companyId }: BaseCtx): QuickCreateConfig {
  return {
    title: 'New Project',
    fields: [
      { name: 'name', label: 'Project name', type: 'text', required: true, prefillFromSearch: true },
    ],
    submitLabel: 'Create project',
    create: async (values) => {
      const row = await invokeCreate('projects', {
        method: 'POST',
        company_id: companyId,
        projectData: { name: values.name.trim(), status: 'active' },
      });
      return toOption(row, row.name ?? values.name.trim());
    },
  };
}
