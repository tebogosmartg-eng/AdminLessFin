/**
 * Entity specifications: which columns each import type understands, how
 * file headers auto-map to them, and the template users download.
 *
 * The client never hard-codes any of this — it fetches the spec through the
 * edge function (GET_SPEC), so server and UI cannot drift apart.
 */

import type { EntitySpec, FieldSpec, ImportEntityType } from './types.ts';

const text = (key: string, label: string, required: boolean, aliases: string[], help?: string): FieldSpec =>
  ({ key, label, required, type: 'text', aliases, help });
const date = (key: string, label: string, required: boolean, aliases: string[], help?: string): FieldSpec =>
  ({ key, label, required, type: 'date', aliases, help });
const num = (key: string, label: string, required: boolean, aliases: string[], help?: string): FieldSpec =>
  ({ key, label, required, type: 'number', aliases, help });
const int = (key: string, label: string, required: boolean, aliases: string[], help?: string): FieldSpec =>
  ({ key, label, required, type: 'integer', aliases, help });

const ACCOUNT_ALIASES = ['account', 'account name', 'gl account', 'ledger account', 'account code', 'nominal code', 'account number', 'account no', 'account description'];

const CUSTOMER_FIELDS: FieldSpec[] = [
  text('name', 'Customer name', true, ['name', 'customer', 'customer name', 'client', 'client name', 'company', 'company name', 'display name', 'customer description', 'account description', 'account name', 'description']),
  text('contact_name', 'Contact person', false, ['contact', 'contact name', 'contact person', 'attention', 'first name']),
  text('email', 'Email', false, ['email', 'e mail', 'email address', 'mail']),
  text('phone', 'Phone', false, ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phone number', 'contact number', 'telephone 1', 'telephone number', 'tel no', 'mobile number', 'cell number', 'phone 1']),
  text('address', 'Address', false, ['address', 'billing address', 'postal address', 'street', 'street address', 'physical address', 'postal address 1', 'physical address 1', 'address line 1', 'address 1', 'billing street', 'delivery address 1']),
  text('tax_id', 'VAT number', false, ['vat', 'vat number', 'vat no', 'vat reg', 'tax number', 'tax id', 'tax no', 'tax reference', 'vat reference', 'vat registration number', 'vat reg no', 'vat registration', 'tax reference number', 'tax registration number']),
  int('payment_terms', 'Payment terms (days)', false, ['terms', 'payment terms', 'terms days', 'credit terms', 'due days', 'payment terms days', 'terms in days', 'credit days']),
];

const VENDOR_FIELDS: FieldSpec[] = [
  { ...CUSTOMER_FIELDS[0], aliases: ['name', 'supplier', 'supplier name', 'vendor', 'vendor name', 'company', 'company name', 'display name', 'supplier description', 'account description', 'account name', 'description'], label: 'Supplier name' },
  ...CUSTOMER_FIELDS.slice(1),
];

export const ENTITY_SPECS: Record<ImportEntityType, EntitySpec> = {
  customers: {
    entity: 'customers',
    label: 'Customers',
    description: 'Customer names and contact details.',
    kind: 'master',
    fields: CUSTOMER_FIELDS,
    templateRows: [
      { name: 'Mokoena Trading', contact_name: 'Lerato Mokoena', email: 'lerato@mokoenatrading.co.za', phone: '011 555 0100', address: '12 Vilakazi St, Soweto', tax_id: '4123456789', payment_terms: '30' },
      { name: 'Cape Fresh Produce', contact_name: '', email: 'accounts@capefresh.co.za', phone: '', address: '', tax_id: '', payment_terms: '' },
    ],
    optionKeys: ['on_duplicate'],
  },

  vendors: {
    entity: 'vendors',
    label: 'Suppliers',
    description: 'Supplier names and contact details.',
    kind: 'master',
    fields: VENDOR_FIELDS,
    templateRows: [
      { name: 'Khumalo Stationers', contact_name: 'Sipho Khumalo', email: 'sales@khumalostationers.co.za', phone: '021 555 0199', address: '8 Long St, Cape Town', tax_id: '4987654321', payment_terms: '30' },
      { name: 'Jozi Office Rentals', contact_name: '', email: '', phone: '', address: '', tax_id: '', payment_terms: '' },
    ],
    optionKeys: ['on_duplicate'],
  },

  products: {
    entity: 'products',
    label: 'Products & services',
    description: 'Items you sell or buy, with their prices and accounts.',
    kind: 'master',
    fields: [
      text('name', 'Name', true, ['name', 'product', 'product name', 'item', 'item name', 'service', 'description']),
      {
        ...text('type', 'Type', true, ['type', 'item type', 'product type', 'kind'],
          'service or inventory'),
        valueAliases: {
          service: 'service', services: 'service', 'non stock': 'service', noninventory: 'service', 'non inventory': 'service',
          inventory: 'inventory', stock: 'inventory', goods: 'inventory', product: 'inventory', 'stock item': 'inventory',
        },
      },
      text('sku', 'SKU / code', false, ['sku', 'code', 'item code', 'product code', 'stock code', 'part number', 'reference', 'item no', 'product no', 'inventory code']),
      text('description', 'Description', false, ['description', 'details', 'sales description', 'long description']),
      num('price', 'Selling price', false, ['price', 'selling price', 'sales price', 'unit price', 'rate', 'amount', 'selling price excl', 'price excl', 'price excl vat', 'selling price 1', 'sales price excl vat']),
      num('cost', 'Cost', false, ['cost', 'purchase cost', 'unit cost', 'cost price', 'purchase price', 'average cost', 'latest cost', 'cost excl']),
      text('income_account', 'Income account', false, ['income account', 'sales account', 'revenue account', ...ACCOUNT_ALIASES]),
      text('cogs_account', 'Cost of sales account', false, ['cogs account', 'cost of sales account', 'cost account', 'expense account']),
      text('inventory_account', 'Inventory account', false, ['inventory account', 'stock account', 'asset account', 'inventory asset account']),
      text('tax_rate', 'Tax rate', false, ['tax rate', 'vat rate', 'tax type', 'tax', 'vat', 'tax code', 'vat code', 'item tax code', 'tax type code', 'vat type']),
      text('barcode', 'Barcode', false, ['barcode', 'ean', 'upc']),
      text('uom', 'Unit of measure', false, ['uom', 'unit', 'unit of measure', 'units']),
      text('category', 'Category', false, ['category', 'product category', 'group', 'item group']),
    ],
    templateRows: [
      { name: 'Consulting hour', type: 'service', sku: 'CONS-01', description: 'Professional services per hour', price: '950', cost: '', income_account: 'Sales Revenue', cogs_account: '', inventory_account: '', tax_rate: 'Standard Rate (15%)', barcode: '', uom: 'HR', category: 'Services' },
      { name: 'A4 Paper ream', type: 'inventory', sku: 'PAP-A4', description: '80gsm white', price: '89.50', cost: '61.20', income_account: 'Sales Revenue', cogs_account: 'Cost of Goods Sold', inventory_account: 'Inventory', tax_rate: 'Standard Rate (15%)', barcode: '', uom: 'EA', category: 'Stationery' },
    ],
    optionKeys: ['on_duplicate'],
  },

  chart_of_accounts: {
    entity: 'chart_of_accounts',
    label: 'Chart of accounts',
    description: 'General ledger accounts with their IFRS classification.',
    kind: 'master',
    fields: [
      text('name', 'Account name', true, ['name', 'account name', 'account', 'description', 'title']),
      {
        ...text('type', 'Type', false, ['type', 'account type', 'class', 'classification'],
          'Asset, Liability, Equity, Income or Expense — worked out from the category when left out'),
        valueAliases: {
          asset: 'Asset', assets: 'Asset',
          liability: 'Liability', liabilities: 'Liability',
          equity: 'Equity', capital: 'Equity',
          income: 'Income', revenue: 'Income', sales: 'Income',
          expense: 'Expense', expenses: 'Expense', overhead: 'Expense', overheads: 'Expense',
        },
      },
      {
        ...text('category', 'Category', true, ['category', 'financial category', 'account category', 'reporting category', 'ledger account type', 'sub type', 'subtype', 'group'],
          'The statement category, e.g. Current Assets or Operating Expenses'),
        valueAliases: {
          'current assets': 'Current Assets', 'current asset': 'Current Assets', 'bank': 'Current Assets', 'cash': 'Current Assets',
          'accounts receivable': 'Current Assets', 'accounts receivable a r': 'Current Assets', 'debtors': 'Current Assets', 'trade debtors': 'Current Assets', 'stock': 'Current Assets', 'inventory': 'Current Assets', 'other current assets': 'Current Assets', 'other current asset': 'Current Assets',
          'non current assets': 'Non-Current Assets', 'noncurrent assets': 'Non-Current Assets', 'non current asset': 'Non-Current Assets',
          'fixed assets': 'Non-Current Assets', 'fixed asset': 'Non-Current Assets', 'property plant and equipment': 'Non-Current Assets',
          'other assets': 'Non-Current Assets',
          'current liabilities': 'Current Liabilities', 'current liability': 'Current Liabilities',
          'accounts payable': 'Current Liabilities', 'accounts payable a p': 'Current Liabilities', 'creditors': 'Current Liabilities', 'trade creditors': 'Current Liabilities', 'vat': 'Current Liabilities', 'credit card': 'Current Liabilities', 'other current liabilities': 'Current Liabilities',
          'non current liabilities': 'Non-Current Liabilities', 'noncurrent liabilities': 'Non-Current Liabilities',
          'long term liabilities': 'Non-Current Liabilities', 'long term liability': 'Non-Current Liabilities',
          equity: 'Equity', capital: 'Equity', 'owners equity': 'Equity', 'owner s equity': 'Equity', 'shareholders equity': 'Equity', 'retained earnings': 'Equity',
          revenue: 'Revenue', income: 'Revenue', sales: 'Revenue', turnover: 'Revenue',
          'other income': 'Other Income',
          'cost of sales': 'Cost of Sales', 'cost of goods sold': 'Cost of Sales', cogs: 'Cost of Sales', 'direct costs': 'Cost of Sales',
          'operating expenses': 'Operating Expenses', 'operating expense': 'Operating Expenses', expenses: 'Operating Expenses',
          expense: 'Operating Expenses', overheads: 'Operating Expenses', 'general and administrative': 'Operating Expenses',
          'finance costs': 'Finance Costs', 'interest expense': 'Finance Costs', 'interest paid': 'Finance Costs',
          taxation: 'Taxation', tax: 'Taxation', 'income tax': 'Taxation',
          'other expenses': 'Other Expenses', 'other expense': 'Other Expenses',
        },
      },
      {
        ...text('subcategory', 'Subcategory', false, ['subcategory', 'sub category', 'statement line', 'note line']),
        valueAliases: {
          'cash and cash equivalents': 'Cash and Cash Equivalents', 'cash and bank': 'Cash and Cash Equivalents',
          'trade and other receivables': 'Trade and Other Receivables', 'trade receivables': 'Trade and Other Receivables',
          inventory: 'Inventory', stock: 'Inventory',
          'property plant and equipment': 'Property, Plant and Equipment', ppe: 'Property, Plant and Equipment',
          'intangible assets': 'Intangible Assets',
          'trade and other payables': 'Trade and Other Payables', 'trade payables': 'Trade and Other Payables',
          'statutory payables': 'Statutory Payables',
          'interest bearing borrowings': 'Interest-bearing Borrowings', borrowings: 'Interest-bearing Borrowings',
          'related party payables': 'Related-party Payables',
          provisions: 'Provisions',
          'issued capital': 'Issued Capital', reserves: 'Reserves', distributions: 'Distributions',
          'employee costs': 'Employee Costs',
        },
      },
      text('account_code', 'Account code', false, ['account code', 'code', 'number', 'account number', 'nominal code', 'gl code'],
        'Kept as your display code; also used to match existing accounts'),
      text('description', 'Description', false, ['description', 'memo', 'notes', 'details']),
    ],
    templateRows: [
      { name: 'Office Rent', type: 'Expense', category: 'Operating Expenses', subcategory: '', account_code: '6200', description: 'Monthly premises rental' },
      { name: 'Equipment', type: 'Asset', category: 'Non-Current Assets', subcategory: 'Property, Plant and Equipment', account_code: '1400', description: '' },
    ],
    optionKeys: ['on_duplicate'],
  },

  invoices: {
    entity: 'invoices',
    label: 'Invoices',
    description: 'Open or historical sales invoices. One row per line; rows with the same invoice number become one invoice.',
    kind: 'transaction',
    groupBy: 'invoice_number',
    fields: [
      text('invoice_number', 'Invoice number', true, ['invoice number', 'invoice no', 'invoice', 'number', 'doc number', 'document number', 'reference', 'doc no', 'document no', 'inv no', 'invoice num', 'invoiceno']),
      text('customer', 'Customer', true, ['customer', 'customer name', 'client', 'client name', 'contact name', 'contact', 'name', 'company', 'customer description', 'account description']),
      date('invoice_date', 'Invoice date', true, ['invoice date', 'date', 'issue date', 'transaction date']),
      date('due_date', 'Due date', false, ['due date', 'due', 'payment due']),
      text('line_description', 'Line description', false, ['line description', 'description', 'details', 'item description', 'memo', 'line item description']),
      text('product', 'Product / service', false, ['product', 'item', 'product service', 'item code', 'sku', 'service', 'item product service', 'inventory item'],
        'Matched by SKU first, then name'),
      num('quantity', 'Quantity', false, ['quantity', 'qty', 'units', 'hours', 'item quantity', 'qty ordered']),
      num('unit_price', 'Unit price', false, ['unit price', 'price', 'rate', 'unit amount', 'price each', 'item rate', 'price excl', 'unit price excl', 'excl price'],
        'Excluding VAT'),
      num('line_amount', 'Line amount', false, ['line amount', 'amount', 'line total', 'subtotal', 'net amount', 'excl amount', 'item amount', 'exclusive amount', 'amount excl', 'line total excl', 'total excl'],
        'Excluding VAT; used when quantity/unit price are not supplied'),
      text('income_account', 'Income account', false, ['income account', 'sales account', 'revenue account', ...ACCOUNT_ALIASES],
        'Falls back to the product’s income account'),
      text('tax_rate', 'Tax rate', false, ['tax rate', 'vat rate', 'tax type', 'tax', 'vat', 'tax code', 'vat code', 'item tax code', 'tax type code', 'vat type'],
        'A tax rate name or a percentage like 15'),
      num('tax_amount', 'VAT amount', false, ['tax amount', 'vat amount', 'tax total', 'vat', 'item tax amount', 'vat total'],
        'Checked against the calculated VAT'),
      text('project', 'Project', false, ['project', 'job', 'project name']),
      text('document_description', 'Invoice description', false, ['invoice description', 'narrative', 'summary']),
    ],
    templateRows: [
      { invoice_number: 'INV-1001', customer: 'Mokoena Trading', invoice_date: '2026-09-05', due_date: '2026-10-05', line_description: 'Consulting - September', product: '', quantity: '10', unit_price: '950', line_amount: '', income_account: 'Sales Revenue', tax_rate: '15', tax_amount: '1425', project: '', document_description: '' },
      { invoice_number: 'INV-1001', customer: 'Mokoena Trading', invoice_date: '2026-09-05', due_date: '2026-10-05', line_description: 'Travel recovery', product: '', quantity: '1', unit_price: '1200', line_amount: '', income_account: 'Sales Revenue', tax_rate: '15', tax_amount: '180', project: '', document_description: '' },
    ],
    optionKeys: ['auto_create_parties', 'skip_invalid'],
  },

  bills: {
    entity: 'bills',
    label: 'Supplier bills',
    description: 'Open or historical supplier bills. One row per line; rows with the same bill number become one bill.',
    kind: 'transaction',
    groupBy: 'bill_number',
    fields: [
      text('bill_number', 'Bill number', true, ['bill number', 'bill no', 'invoice number', 'invoice no', 'number', 'reference', 'document number', 'doc no', 'document no', 'supplier invoice number', 'supplier inv no', 'supplier reference']),
      text('vendor', 'Supplier', true, ['supplier', 'supplier name', 'vendor', 'vendor name', 'contact name', 'contact', 'name', 'company', 'supplier description', 'account description']),
      date('bill_date', 'Bill date', true, ['bill date', 'date', 'invoice date', 'transaction date']),
      date('due_date', 'Due date', false, ['due date', 'due', 'payment due']),
      text('line_description', 'Line description', false, ['line description', 'description', 'details', 'memo', 'item description', 'line item description']),
      text('product', 'Product / service', false, ['product', 'item', 'item code', 'sku', 'item product service', 'product service', 'inventory item']),
      num('quantity', 'Quantity', false, ['quantity', 'qty', 'units', 'item quantity', 'qty ordered']),
      num('unit_cost', 'Unit cost', false, ['unit cost', 'cost', 'unit price', 'price', 'rate'], 'Excluding VAT'),
      num('line_amount', 'Line amount', false, ['line amount', 'amount', 'line total', 'subtotal', 'net amount', 'excl amount', 'item amount', 'exclusive amount', 'amount excl', 'line total excl', 'total excl'],
        'Excluding VAT; used when quantity/unit cost are not supplied'),
      text('expense_account', 'Expense account', false, ['expense account', 'account', 'cost account', 'gl account', 'ledger account'],
        'Falls back to the product’s accounts'),
      text('tax_rate', 'Tax rate', false, ['tax rate', 'vat rate', 'tax type', 'tax', 'vat', 'tax code', 'vat code', 'item tax code', 'tax type code', 'vat type']),
      num('tax_amount', 'VAT amount', false, ['tax amount', 'vat amount', 'tax total', 'item tax amount', 'vat total']),
      text('project', 'Project', false, ['project', 'job']),
      text('document_description', 'Bill description', false, ['bill description', 'narrative', 'summary']),
    ],
    templateRows: [
      { bill_number: 'KS-889', vendor: 'Khumalo Stationers', bill_date: '2026-09-12', due_date: '2026-10-12', line_description: 'Office supplies', product: '', quantity: '1', unit_cost: '2300', line_amount: '', expense_account: 'Office Supplies', tax_rate: '15', tax_amount: '345', project: '', document_description: '' },
      { bill_number: 'JR-2026-09', vendor: 'Jozi Office Rentals', bill_date: '2026-09-01', due_date: '2026-09-07', line_description: 'September rent', product: '', quantity: '1', unit_cost: '18500', line_amount: '', expense_account: 'Office Rent', tax_rate: '15', tax_amount: '2775', project: '', document_description: '' },
    ],
    optionKeys: ['auto_create_parties', 'skip_invalid'],
  },

  customer_payments: {
    entity: 'customer_payments',
    label: 'Customer payments',
    description: 'Money received from customers, optionally allocated to an invoice.',
    kind: 'transaction',
    fields: [
      date('payment_date', 'Payment date', true, ['payment date', 'date', 'receipt date', 'transaction date']),
      text('customer', 'Customer', true, ['customer', 'customer name', 'client', 'name', 'customer description', 'account description']),
      num('amount', 'Amount', true, ['amount', 'payment amount', 'total', 'value', 'receipt amount']),
      text('deposit_account', 'Deposited into', false, ['deposit account', 'bank account', 'account', 'deposit to', 'paid into'],
        'A bank or cash account; a default can be chosen for the whole file'),
      text('invoice_number', 'Invoice number', false, ['invoice number', 'invoice no', 'invoice', 'reference', 'allocated to'],
        'Leave blank to hold the payment on the customer’s account'),
      text('reference', 'Reference', false, ['reference', 'payment reference', 'memo', 'description', 'narrative']),
    ],
    templateRows: [
      { payment_date: '2026-09-20', customer: 'Mokoena Trading', amount: '10925', deposit_account: 'Business Cheque Account', invoice_number: 'INV-1001', reference: 'EFT 20 Sep' },
      { payment_date: '2026-09-25', customer: 'Cape Fresh Produce', amount: '5000', deposit_account: 'Business Cheque Account', invoice_number: '', reference: 'Deposit on account' },
    ],
    optionKeys: ['skip_invalid'],
  },

  supplier_payments: {
    entity: 'supplier_payments',
    label: 'Supplier payments',
    description: 'Money paid to suppliers, optionally allocated to a bill.',
    kind: 'transaction',
    fields: [
      date('payment_date', 'Payment date', true, ['payment date', 'date', 'transaction date']),
      text('vendor', 'Supplier', true, ['supplier', 'supplier name', 'vendor', 'vendor name', 'name', 'supplier description', 'account description']),
      num('amount', 'Amount', true, ['amount', 'payment amount', 'total', 'value']),
      text('payment_account', 'Paid from', false, ['payment account', 'bank account', 'account', 'paid from'],
        'A bank or cash account; a default can be chosen for the whole file'),
      text('bill_number', 'Bill number', false, ['bill number', 'bill no', 'invoice number', 'invoice no', 'reference', 'allocated to'],
        'Leave blank to hold the payment on the supplier’s account'),
      text('reference', 'Reference', false, ['reference', 'payment reference', 'memo', 'description']),
    ],
    templateRows: [
      { payment_date: '2026-09-15', vendor: 'Khumalo Stationers', amount: '2645', payment_account: 'Business Cheque Account', bill_number: 'KS-889', reference: 'EFT 15 Sep' },
      { payment_date: '2026-09-07', vendor: 'Jozi Office Rentals', amount: '21275', payment_account: 'Business Cheque Account', bill_number: 'JR-2026-09', reference: '' },
    ],
    optionKeys: ['skip_invalid'],
  },

  bank_transactions: {
    entity: 'bank_transactions',
    label: 'Bank transactions',
    description: 'Bank statement lines for one bank account, ready to match in reconciliation.',
    kind: 'transaction',
    fields: [
      date('line_date', 'Date', true, ['date', 'transaction date', 'value date', 'posting date']),
      text('description', 'Description', true, ['description', 'details', 'narrative', 'transaction description', 'memo']),
      num('amount', 'Amount', false, ['amount', 'value', 'transaction amount'],
        'Signed: money in positive, money out negative'),
      num('money_in', 'Money in', false, ['money in', 'credit', 'deposit', 'deposits', 'credit amount', 'in', 'received']),
      num('money_out', 'Money out', false, ['money out', 'debit', 'withdrawal', 'payment', 'debit amount', 'out', 'paid out']),
      text('external_reference', 'Bank reference', false, ['reference', 'bank reference', 'external reference', 'transaction id', 'ref'],
        'Used to skip lines you have imported before'),
    ],
    templateRows: [
      { line_date: '2026-09-02', description: 'EFT payment - Khumalo Stationers', amount: '-2645', money_in: '', money_out: '', external_reference: 'FNB00912' },
      { line_date: '2026-09-20', description: 'Deposit - Mokoena Trading', amount: '10925', money_in: '', money_out: '', external_reference: 'FNB00977' },
    ],
    optionKeys: ['bank_account_id', 'opening_balance', 'closing_balance', 'skip_invalid'],
  },

  journal_entries: {
    entity: 'journal_entries',
    label: 'Journal entries',
    description: 'Balanced journals. One row per debit or credit; rows with the same reference (or the same date and description) become one journal.',
    kind: 'transaction',
    groupBy: 'reference',
    fields: [
      text('reference', 'Journal reference', false, ['reference', 'journal number', 'journal no', 'journal', 'entry number', 'number'],
        'Rows sharing a reference form one journal; without one, date + description group the rows'),
      date('entry_date', 'Date', true, ['date', 'entry date', 'journal date', 'transaction date', 'posting date']),
      text('description', 'Description', true, ['description', 'narrative', 'memo', 'details', 'journal description']),
      text('account', 'Account', true, ACCOUNT_ALIASES),
      num('debit', 'Debit', false, ['debit', 'debit amount', 'dr']),
      num('credit', 'Credit', false, ['credit', 'credit amount', 'cr']),
      text('line_description', 'Line description', false, ['line description', 'line memo', 'line details', 'item description', 'line item description']),
      text('customer', 'Customer', false, ['customer', 'customer name', 'client']),
      text('vendor', 'Supplier', false, ['supplier', 'vendor', 'supplier name', 'vendor name']),
      text('project', 'Project', false, ['project', 'job']),
    ],
    templateRows: [
      { reference: 'JNL-001', entry_date: '2026-09-30', description: 'September depreciation', account: 'Depreciation Expense', debit: '1250', credit: '', line_description: '', customer: '', vendor: '', project: '' },
      { reference: 'JNL-001', entry_date: '2026-09-30', description: 'September depreciation', account: 'Accumulated Depreciation', debit: '', credit: '1250', line_description: '', customer: '', vendor: '', project: '' },
    ],
    optionKeys: ['skip_invalid'],
  },

  opening_balances: {
    entity: 'opening_balances',
    label: 'Opening balances',
    description: 'Your trial balance as at the day before you start using the system. Debits must equal credits.',
    kind: 'transaction',
    fields: [
      text('account', 'Account', true, ACCOUNT_ALIASES),
      num('debit', 'Debit', false, ['debit', 'debit amount', 'dr', 'debit balance']),
      num('credit', 'Credit', false, ['credit', 'credit amount', 'cr', 'credit balance']),
    ],
    templateRows: [
      { account: 'Equipment', debit: '85000', credit: '' },
      { account: 'Retained Earnings', debit: '', credit: '85000' },
    ],
    optionKeys: ['as_at_date', 'balancing_account_id'],
  },
};

export function entitySpec(entity: string): EntitySpec {
  const spec = ENTITY_SPECS[entity as ImportEntityType];
  if (!spec) throw new Error(`Unknown import type: ${entity}`);
  return spec;
}

/** Canonicalize an enumerated value through the field's value aliases. */
export function canonicalValue(field: FieldSpec, value: string): string | null {
  if (!field.valueAliases) return value;
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return field.valueAliases[key] ?? null;
}
