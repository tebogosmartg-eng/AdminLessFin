/**
 * The invoice document model.
 *
 * These tests exist because the three things that made the printed invoice
 * wrong were all in the journal-to-document translation, and none of them
 * showed up as an error -- they showed up as a plausible-looking invoice with
 * the wrong words and the wrong total.
 */
import { describe, it, expect } from 'vitest';
import {
  buildInvoiceDocument,
  invoiceFileName,
  daysOverdue,
  type RawInvoiceDocument,
} from '@/lib/invoices/invoiceDocument';

const income = (name: string) => ({ id: 'acc-' + name, name, type: 'Income' });
const vatAccount = { id: 'acc-vat', name: 'VAT Output', type: 'Liability', account_role: 'output_vat' };
const arAccount = { id: 'acc-ar', name: 'Trade Receivables', type: 'Asset', account_role: 'trade_receivable' };
const inventoryAccount = { id: 'acc-inv', name: 'Inventory', type: 'Asset', account_role: 'inventory_asset' };
const cogsAccount = { id: 'acc-cogs', name: 'Cost of Sales', type: 'Expense' };

function raw(overrides: Partial<RawInvoiceDocument> = {}): RawInvoiceDocument {
  return {
    invoice: {
      id: 'inv-1',
      invoice_number: 'INV-00042',
      invoice_date: '2026-09-01',
      due_date: '2026-10-01',
      status: 'sent',
      notes: null,
      customers: { name: 'Meat and Veg', payment_terms: 30 },
      journal_entries: {
        journal_number: 'JE-000900',
        journal_entry_items: [
          {
            amount: 1000,
            type: 'credit',
            description: 'Brand refresh, phase one',
            quantity: 4,
            unit_price: 250,
            chart_of_accounts: income('Consulting Income'),
          },
          { amount: 1000, type: 'debit', chart_of_accounts: arAccount },
        ],
      },
      ...(overrides.invoice ?? {}),
    },
    company: { name: 'Spaceman', logo_url: null },
    master: null,
    banking: null,
    settlement: { gross: 1000, allocated: 0, outstanding: 1000 },
    ...overrides,
  };
}

describe('what a line says', () => {
  it('prints the description that was typed on the invoice', () => {
    const doc = buildInvoiceDocument(raw());
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].description).toBe('Brand refresh, phase one');
    expect(doc.lines[0].quantity).toBe(4);
    expect(doc.lines[0].unitPrice).toBe(250);
  });

  it('falls back to the account name on a line posted before descriptions were kept', () => {
    const input = raw();
    const items = input.invoice.journal_entries as { journal_entry_items: Array<Record<string, unknown>> };
    items.journal_entry_items[0].description = null;
    items.journal_entry_items[0].quantity = null;
    items.journal_entry_items[0].unit_price = null;

    const doc = buildInvoiceDocument(input);
    expect(doc.lines[0].description).toBe('Consulting Income');
    expect(doc.lines[0].quantity).toBeNull();
  });

  it('never leaves a line blank, even with no description and no account name', () => {
    const input = raw();
    const items = input.invoice.journal_entries as { journal_entry_items: Array<Record<string, unknown>> };
    items.journal_entry_items[0].description = '   ';
    items.journal_entry_items[0].chart_of_accounts = { id: 'x', name: null, type: 'Income' };

    expect(buildInvoiceDocument(input).lines[0].description).toBe('Goods and services supplied');
  });

  it('hides a quantity of one, which tells the reader nothing', () => {
    const input = raw();
    const items = input.invoice.journal_entries as { journal_entry_items: Array<Record<string, unknown>> };
    items.journal_entry_items[0].quantity = 1;
    items.journal_entry_items[0].unit_price = 1000;

    const doc = buildInvoiceDocument(input);
    expect(doc.lines[0].quantity).toBeNull();
    expect(doc.lines[0].unitPrice).toBeNull();
    expect(doc.lines[0].amount).toBe(1000);
  });
});

describe('which credits are invoice lines', () => {
  it('leaves the inventory credit and the cost of sales debit off a stock invoice', () => {
    const doc = buildInvoiceDocument(
      raw({
        invoice: {
          id: 'inv-2',
          invoice_number: 'INV-00043',
          invoice_date: '2026-09-01',
          due_date: '2026-10-01',
          status: 'sent',
          customers: { name: 'Meat and Veg' },
          journal_entries: {
            journal_entry_items: [
              { amount: 1000, type: 'credit', description: 'Ten crates', quantity: 10, unit_price: 100, chart_of_accounts: income('Sales') },
              { amount: 150, type: 'credit', chart_of_accounts: vatAccount, journal_entry_item_tax_rates: [{ tax_rates: { name: 'VAT 15%', rate: 15 } }] },
              { amount: 600, type: 'credit', chart_of_accounts: inventoryAccount },
              { amount: 600, type: 'debit', chart_of_accounts: cogsAccount },
              { amount: 1150, type: 'debit', chart_of_accounts: arAccount },
            ],
          },
        },
        settlement: { gross: 1150, allocated: 0, outstanding: 1150 },
      }),
    );

    expect(doc.lines.map((l) => l.description)).toEqual(['Ten crates']);
    expect(doc.subtotal).toBe(1000);
    expect(doc.taxLines).toEqual([{ label: 'VAT 15%', amount: 150 }]);
    expect(doc.taxTotal).toBe(150);
  });

  it('totals a stock invoice at the receivable, not at the sum of the debits', () => {
    // Summing the debits -- what the screen did -- gives 1750: the amount owed
    // plus the cost of the goods sold.
    const doc = buildInvoiceDocument(
      raw({
        invoice: {
          id: 'inv-2',
          invoice_number: 'INV-00043',
          invoice_date: '2026-09-01',
          due_date: '2026-10-01',
          status: 'sent',
          customers: { name: 'Meat and Veg' },
          journal_entries: {
            journal_entry_items: [
              { amount: 1000, type: 'credit', chart_of_accounts: income('Sales') },
              { amount: 150, type: 'credit', chart_of_accounts: vatAccount },
              { amount: 600, type: 'credit', chart_of_accounts: inventoryAccount },
              { amount: 600, type: 'debit', chart_of_accounts: cogsAccount },
              { amount: 1150, type: 'debit', chart_of_accounts: arAccount },
            ],
          },
        },
        settlement: { gross: 1150, allocated: 0, outstanding: 1150 },
      }),
    );

    expect(doc.total).toBe(1150);
    expect(doc.linesReconcile).toBe(true);
  });

  it('still shows the lines when no account in the journal has been typed', () => {
    const doc = buildInvoiceDocument(
      raw({
        invoice: {
          id: 'inv-3',
          invoice_number: 'INV-00044',
          invoice_date: '2026-09-01',
          due_date: '2026-10-01',
          status: 'sent',
          customers: { name: 'Legacy Customer' },
          journal_entries: {
            journal_entry_items: [
              { amount: 500, type: 'credit', chart_of_accounts: { id: 'a', name: 'zuru' } },
              { amount: 500, type: 'debit', chart_of_accounts: { id: 'b', name: 'AR' } },
            ],
          },
        },
        settlement: { gross: 500, allocated: 0, outstanding: 500 },
      }),
    );

    expect(doc.lines.map((l) => l.description)).toEqual(['zuru']);
    expect(doc.total).toBe(500);
  });

  it('reports lines that do not add up rather than quietly printing them', () => {
    const doc = buildInvoiceDocument(
      raw({ settlement: { gross: 1500, allocated: 0, outstanding: 1500 } }),
    );
    expect(doc.total).toBe(1500);
    expect(doc.subtotal).toBe(1000);
    expect(doc.linesReconcile).toBe(false);
  });

  it('adds the lines up itself when the server sent no receivable figure', () => {
    const doc = buildInvoiceDocument(raw({ settlement: null }));
    expect(doc.total).toBe(1000);
    expect(doc.amountDue).toBe(1000);
  });
});

describe('what is still owed', () => {
  it('carries the part payment through to the balance due', () => {
    const doc = buildInvoiceDocument(
      raw({ settlement: { gross: 1000, allocated: 400, outstanding: 600 } }),
    );
    expect(doc.total).toBe(1000);
    expect(doc.amountPaid).toBe(400);
    expect(doc.amountDue).toBe(600);
  });

  it('marks a paid invoice as needing nothing', () => {
    const input = raw({ settlement: { gross: 1000, allocated: 1000, outstanding: 0 } });
    input.invoice.status = 'paid';
    const doc = buildInvoiceDocument(input);
    expect(doc.isPaid).toBe(true);
    expect(doc.isOverdue).toBe(false);
    expect(doc.amountDue).toBe(0);
    expect(doc.statusLabel).toBe('Paid in full');
  });

  it('does not chase a void invoice', () => {
    const input = raw();
    input.invoice.status = 'void';
    const doc = buildInvoiceDocument(input);
    expect(doc.isVoid).toBe(true);
    expect(doc.isOverdue).toBe(false);
  });

  it('names a part-paid invoice in words a customer understands', () => {
    const input = raw({ settlement: { gross: 1000, allocated: 400, outstanding: 600 } });
    input.invoice.status = 'partially_paid';
    expect(buildInvoiceDocument(input).statusLabel).toBe('Part paid');
  });
});

describe('banking details', () => {
  it('prints the default account with the invoice number as the reference', () => {
    const doc = buildInvoiceDocument(
      raw({
        banking: {
          name: 'Spaceman Operating Account',
          bank_name: 'FNB',
          account_number: '62001234567',
          branch_code: '250655',
          account_type: 'bank',
          currency: 'ZAR',
        },
      }),
    );
    expect(doc.banking).toMatchObject({
      accountName: 'Spaceman Operating Account',
      bankName: 'FNB',
      accountNumber: '62001234567',
      branchCode: '250655',
      reference: 'INV-00042',
      incomplete: false,
    });
  });

  it('flags an account whose number nobody has captured', () => {
    const doc = buildInvoiceDocument(
      raw({ banking: { name: 'Spaceman Operating Account', bank_name: 'FNB', account_number: null } }),
    );
    expect(doc.banking?.incomplete).toBe(true);
  });

  it('is null when no default account has been nominated', () => {
    expect(buildInvoiceDocument(raw()).banking).toBeNull();
  });
});

describe('company identity', () => {
  it('prefers the registered master-data identity over the companies row', () => {
    const doc = buildInvoiceDocument(
      raw({
        company: { name: 'Spaceman', address: 'Old address', tax_id: '9999', logo_url: 'https://cdn/logo.png' },
        master: {
          company_profile: { registered_name: 'Spaceman Holdings (Pty) Ltd', registration_number: '2019/123456/07' },
          addresses: { business_address: '12 Long Street\nCape Town', email: 'accounts@spaceman.co.za', telephone: '021 555 0100' },
          tax_registrations: { vat_number: '4123456789', income_tax_number: '9012345678' },
        },
      }),
    );
    expect(doc.company.name).toBe('Spaceman Holdings (Pty) Ltd');
    expect(doc.company.address).toBe('12 Long Street\nCape Town');
    expect(doc.company.registrationNumber).toBe('2019/123456/07');
    expect(doc.company.vatNumber).toBe('4123456789');
    expect(doc.company.logoUrl).toBe('https://cdn/logo.png');
  });

  it('falls back to the companies row when master data is empty', () => {
    const doc = buildInvoiceDocument(
      raw({ company: { name: 'Spaceman', address: '1 Main Road', tax_id: '9012345678' }, master: null }),
    );
    expect(doc.company.name).toBe('Spaceman');
    expect(doc.company.address).toBe('1 Main Road');
    expect(doc.company.taxId).toBe('9012345678');
  });
});

describe('the address blocks', () => {
  it('drops the blanks rather than printing empty lines', () => {
    const input = raw({
      master: {
        company_profile: { registered_name: 'Spaceman Holdings', registration_number: '2019/123456/07' },
        addresses: { business_address: '12 Long Street\nCape Town', email: '', telephone: '021 555 0100', website: '' },
        tax_registrations: { vat_number: '' },
      },
    });
    input.invoice.customers = {
      name: 'Meat and Veg',
      contact_name: 'Thandi',
      address: 'Shop 4\nMain Road',
      email: 'ap@meatandveg.co.za',
      phone: '',
      tax_id: '',
    };

    const doc = buildInvoiceDocument(input);
    expect(doc.fromLines).toEqual(['12 Long Street', 'Cape Town', 'Reg. no. 2019/123456/07', '021 555 0100']);
    expect(doc.billToLines).toEqual(['Attn: Thandi', 'Shop 4', 'Main Road', 'ap@meatandveg.co.za']);
  });

  it('gives an empty bill-to block nothing to print, so the document can say so', () => {
    const doc = buildInvoiceDocument(raw());
    expect(doc.billToLines).toEqual([]);
    expect(doc.customer.name).toBe('Meat and Veg');
  });
});

describe('file name and overdue days', () => {
  it('builds a file name safe on any filesystem', () => {
    expect(invoiceFileName({ number: 'INV/2026 #42' })).toBe('Invoice_INV_2026_42.pdf');
  });

  it('does not produce a bare underscore when the number is unprintable', () => {
    expect(invoiceFileName({ number: '///' })).toBe('Invoice_document.pdf');
  });

  it('counts whole days past the due date', () => {
    expect(daysOverdue('2026-09-01', '2026-09-16')).toBe(15);
    expect(daysOverdue('2026-09-16', '2026-09-16')).toBeNull();
    expect(daysOverdue('2026-10-01', '2026-09-16')).toBeNull();
    expect(daysOverdue('', '2026-09-16')).toBeNull();
  });
});
