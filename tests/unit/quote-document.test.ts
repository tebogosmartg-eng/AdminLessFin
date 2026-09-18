/**
 * The quotation document model.
 *
 * The headline test is the VAT one. A quote collected a tax rate per line,
 * showed the VAT while drafting, and then dropped it from every saved view --
 * so a customer accepted one price and was invoiced another. The rounding here
 * deliberately matches post_sales_invoice_atomic so the two cannot part company
 * again.
 */
import { describe, it, expect } from 'vitest';
import {
  buildQuoteDocument,
  quoteTotals,
  validityWording,
  type RawQuoteDocument,
} from '@/lib/quotes/quoteDocument';

const TODAY = '2026-09-16';
const VAT = { id: 'rate-vat', name: 'VAT 15%', rate: 15 };
const ZERO = { id: 'rate-zero', name: 'Zero rated', rate: 0 };

function raw(overrides: Partial<RawQuoteDocument> = {}): RawQuoteDocument {
  return {
    quote: {
      id: 'q-1',
      quote_number: 'QTE-00042',
      quote_date: '2026-09-01',
      expiry_date: '2026-10-01',
      status: 'sent',
      description: 'Brand refresh, two phases',
      terms: 'Fifty per cent deposit on acceptance.',
      customers: { name: 'Kudzanai' },
      quote_items: [
        { description: 'Design', quantity: 4, unit_price: 250, tax_rate_id: 'rate-vat' },
      ],
      ...(overrides.quote ?? {}),
    },
    company: { name: 'Spaceman', logo_url: null },
    master: null,
    banking: null,
    taxRates: [VAT, ZERO],
    invoices: [],
    ...overrides,
  };
}

describe('the tax a quote was captured with', () => {
  it('appears on the total, instead of being collected and dropped', () => {
    const doc = buildQuoteDocument(raw(), { today: TODAY });
    expect(doc.subtotal).toBe(1000);
    expect(doc.taxTotal).toBe(150);
    expect(doc.total).toBe(1150);
    expect(doc.taxLines).toEqual([{ label: 'VAT 15%', amount: 150 }]);
  });

  it('rounds per line, the way the invoice raised from it will', () => {
    // 3 x 33.33 = 99.99; 15% of that is 14.9985, which the posting function
    // rounds to 15.00 per line. Totalling first and rounding once would give
    // the same answer here but not on every quote, so the rule has to match.
    const input = raw();
    input.quote.quote_items = [
      { description: 'A', quantity: 3, unit_price: 33.33, tax_rate_id: 'rate-vat' },
      { description: 'B', quantity: 1, unit_price: 0.01, tax_rate_id: 'rate-vat' },
    ];
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.lines[0].taxAmount).toBe(15);
    expect(doc.lines[1].taxAmount).toBe(0);
    expect(doc.taxTotal).toBe(15);
    expect(doc.total).toBe(115);
  });

  it('groups lines that share a rate into one VAT line', () => {
    const input = raw();
    input.quote.quote_items = [
      { description: 'A', quantity: 1, unit_price: 100, tax_rate_id: 'rate-vat' },
      { description: 'B', quantity: 1, unit_price: 200, tax_rate_id: 'rate-vat' },
    ];
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.taxLines).toEqual([{ label: 'VAT 15%', amount: 45 }]);
    expect(doc.total).toBe(345);
  });

  it('leaves a zero-rated line out of the VAT summary', () => {
    const input = raw();
    input.quote.quote_items = [
      { description: 'Standard', quantity: 1, unit_price: 100, tax_rate_id: 'rate-vat' },
      { description: 'Exported', quantity: 1, unit_price: 500, tax_rate_id: 'rate-zero' },
    ];
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.taxLines).toEqual([{ label: 'VAT 15%', amount: 15 }]);
    expect(doc.subtotal).toBe(600);
    expect(doc.total).toBe(615);
  });

  it('charges nothing when no line carries a rate', () => {
    const input = raw();
    input.quote.quote_items = [{ description: 'A', quantity: 2, unit_price: 50 }];
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.taxTotal).toBe(0);
    expect(doc.total).toBe(100);
    expect(doc.taxLines).toEqual([]);
  });

  it('resolves a rate embedded on the line as readily as one from the list', () => {
    const input = raw({ taxRates: [] });
    input.quote.quote_items = [
      { description: 'A', quantity: 1, unit_price: 100, tax_rate_id: 'rate-vat', tax_rates: VAT },
    ];
    expect(buildQuoteDocument(input, { today: TODAY }).total).toBe(115);
  });

  it('does not invent tax when the rate id points at nothing', () => {
    const input = raw({ taxRates: [] });
    input.quote.quote_items = [
      { description: 'A', quantity: 1, unit_price: 100, tax_rate_id: 'rate-that-was-deleted' },
    ];
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.taxTotal).toBe(0);
    expect(doc.total).toBe(100);
  });
});

describe('one quote, one number', () => {
  it('the list, the drafting preview and the document all agree', () => {
    // These were three separate calculations: the preview added VAT, the list
    // and the saved document did not, and the invoice raised from the quote
    // did. quoteTotals is now the only one of them.
    const items = [
      { description: 'A', quantity: 3, unit_price: 33.33, tax_rate_id: 'rate-vat' },
      { description: 'B', quantity: 2, unit_price: 125.5, tax_rate_id: 'rate-vat' },
      { description: 'C', quantity: 1, unit_price: 80, tax_rate_id: 'rate-zero' },
    ];
    const listTotal = quoteTotals(items, [VAT, ZERO]);

    const input = raw();
    input.quote.quote_items = items;
    const doc = buildQuoteDocument(input, { today: TODAY });

    expect(listTotal.subtotal).toBe(doc.subtotal);
    expect(listTotal.taxTotal).toBe(doc.taxTotal);
    expect(listTotal.total).toBe(doc.total);

    // And summing the per-line figures the preview renders gives the same.
    const perLine = items.reduce(
      (t, item) => t + quoteTotals([item], [VAT, ZERO]).total,
      0,
    );
    expect(Math.round(perLine * 100)).toBe(Math.round(doc.total * 100));
  });

  it('resolves rates embedded on the line, which is how the list gets them', () => {
    const items = [
      { quantity: 1, unit_price: 200, tax_rate_id: 'rate-vat', tax_rates: VAT },
    ];
    expect(quoteTotals(items).total).toBe(230);
  });

  it('totals an empty quote at zero rather than NaN', () => {
    expect(quoteTotals([])).toEqual({ subtotal: 0, taxTotal: 0, total: 0 });
    expect(quoteTotals(null)).toEqual({ subtotal: 0, taxTotal: 0, total: 0 });
  });

  it('treats a missing quantity or price as zero, not as NaN', () => {
    const totals = quoteTotals([{ description: 'Blank line' }], [VAT]);
    expect(totals).toEqual({ subtotal: 0, taxTotal: 0, total: 0 });
  });
});

describe('what a line says', () => {
  it('prints the description that was typed', () => {
    const doc = buildQuoteDocument(raw(), { today: TODAY });
    expect(doc.lines[0]).toMatchObject({ description: 'Design', quantity: 4, unitPrice: 250, amount: 1000 });
  });

  it('falls back to the product name, then to a plain phrase', () => {
    const input = raw();
    input.quote.quote_items = [
      { description: '  ', quantity: 1, unit_price: 10, products: { name: 'EIM Widget' } },
      { description: null, quantity: 1, unit_price: 10 },
    ];
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.lines[0].description).toBe('EIM Widget');
    expect(doc.lines[1].description).toBe('Goods and services quoted');
  });

  it('survives a quote with no lines at all', () => {
    const input = raw();
    input.quote.quote_items = [];
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.lines).toEqual([]);
    expect(doc.total).toBe(0);
  });
});

describe('validity', () => {
  it('counts the days a price is still held', () => {
    const doc = buildQuoteDocument(raw(), { today: TODAY });
    expect(doc.isExpired).toBe(false);
    expect(doc.daysUntilExpiry).toBe(15);
    expect(validityWording(doc)).toBe('Prices held for 15 more days.');
  });

  it('marks a lapsed quote expired', () => {
    const input = raw();
    input.quote.expiry_date = '2026-09-01';
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.isExpired).toBe(true);
    expect(doc.statusLabel).toBe('Expired');
    expect(validityWording(doc)).toMatch(/no longer held/);
  });

  it('does not expire a quote that has already been accepted', () => {
    // Stamping EXPIRED on an accepted quotation would contradict the agreement
    // it records.
    const input = raw();
    input.quote.expiry_date = '2026-09-01';
    input.quote.status = 'accepted';
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.isExpired).toBe(false);
    expect(doc.isAccepted).toBe(true);
    expect(validityWording(doc)).toBe('This quotation has been accepted.');
  });

  it('does not expire a declined quote either', () => {
    const input = raw();
    input.quote.expiry_date = '2026-09-01';
    input.quote.status = 'declined';
    expect(buildQuoteDocument(input, { today: TODAY }).isExpired).toBe(false);
  });

  it('handles a quote with no expiry date', () => {
    const input = raw();
    input.quote.expiry_date = null;
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.isExpired).toBe(false);
    expect(doc.daysUntilExpiry).toBeNull();
    expect(validityWording(doc)).toMatch(/does not carry an expiry date/);
  });

  it('calls a lapsed draft a Draft, not an Expired quotation', () => {
    // It was never offered to anyone, so it cannot have lapsed in a customer's
    // hands -- but the person about to send it still needs to see the date.
    const input = raw();
    input.quote.expiry_date = '2026-09-01';
    input.quote.status = 'draft';
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.statusLabel).toBe('Draft');
    expect(doc.isExpired).toBe(true);
    expect(validityWording(doc)).toMatch(/Set a new one before sending it/);
  });

  it('is not expired on its last valid day', () => {
    const input = raw();
    input.quote.expiry_date = TODAY;
    const doc = buildQuoteDocument(input, { today: TODAY });
    expect(doc.isExpired).toBe(false);
    expect(validityWording(doc)).toBe('This quotation expires today.');
  });
});

describe('scope and terms', () => {
  it('carries the quote’s own terms', () => {
    const doc = buildQuoteDocument(raw(), { today: TODAY });
    expect(doc.scope).toBe('Brand refresh, two phases');
    expect(doc.terms).toBe('Fifty per cent deposit on acceptance.');
  });

  it('falls back to the company standing wording when the quote has none', () => {
    const input = raw({ company: { name: 'Spaceman', default_quote_terms: 'Valid for 30 days.' } });
    input.quote.terms = null;
    expect(buildQuoteDocument(input, { today: TODAY }).terms).toBe('Valid for 30 days.');
  });

  it('prefers the terms the quote was issued with over the current standing wording', () => {
    const input = raw({ company: { name: 'Spaceman', default_quote_terms: 'New wording.' } });
    expect(buildQuoteDocument(input, { today: TODAY }).terms).toBe('Fifty per cent deposit on acceptance.');
  });
});

describe('conversion and identity', () => {
  it('says which invoice the quote became', () => {
    const doc = buildQuoteDocument(
      raw({ invoices: [{ id: 'inv-9', invoice_number: 'INV-00100', status: 'sent' }] }),
      { today: TODAY },
    );
    expect(doc.convertedTo).toEqual({ id: 'inv-9', number: 'INV-00100' });
  });

  it('is null when the quote has not been invoiced', () => {
    expect(buildQuoteDocument(raw(), { today: TODAY }).convertedTo).toBeNull();
  });

  it('prefers the registered master-data identity', () => {
    const doc = buildQuoteDocument(
      raw({
        company: { name: 'Spaceman', address: 'Old', logo_url: 'https://cdn/logo.png' },
        master: {
          company_profile: { registered_name: 'Spaceman Holdings (Pty) Ltd', registration_number: '2019/123456/07' },
          addresses: { business_address: '12 Long Street\nCape Town', telephone: '021 555 0100' },
          tax_registrations: { vat_number: '4123456789' },
        },
      }),
      { today: TODAY },
    );
    expect(doc.company.name).toBe('Spaceman Holdings (Pty) Ltd');
    expect(doc.letterheadLines).toEqual([
      '12 Long Street', 'Cape Town', 'Reg. no. 2019/123456/07', 'VAT no. 4123456789', '021 555 0100',
    ]);
  });

  it('gives an empty customer block nothing to print, so the document can say so', () => {
    expect(buildQuoteDocument(raw(), { today: TODAY }).customerLines).toEqual([]);
  });

  it('uses the quote number as the deposit reference', () => {
    const doc = buildQuoteDocument(
      raw({ banking: { name: 'Operating', bank_name: 'FNB', account_number: '62001234567' } }),
      { today: TODAY },
    );
    expect(doc.banking).toMatchObject({ reference: 'QTE-00042', incomplete: false });
  });
});

describe('the lines, once a quotation records them properly', () => {
  it('prints them in the order they were entered, not the order the database returned them', () => {
    const doc = buildQuoteDocument(
      raw({
        quote: {
          ...raw().quote,
          quote_items: [
            { position: 2, description: 'Delivery', quantity: 1, unit_price: 30, line_amount: 30 },
            { position: 1, description: 'Widget', quantity: 2, unit_price: 100, line_amount: 200 },
          ],
        },
      }),
      { today: TODAY },
    );
    expect(doc.lines.map((l) => l.description)).toEqual(['Widget', 'Delivery']);
  });

  it('shows what was quoted, not what the rate happens to be today', () => {
    // The customer accepted 200.00 + 30.00 VAT. Editing the tax rate afterwards
    // must not restate the offer they accepted.
    const doc = buildQuoteDocument(
      raw({
        quote: {
          ...raw().quote,
          quote_items: [
            { position: 1, description: 'Widget', quantity: 2, unit_price: 100, line_amount: 200, tax_amount: 30, tax_rate_id: 'rate-vat' },
          ],
        },
        taxRates: [{ id: 'rate-vat', name: 'VAT 15%', rate: 25 }],
      }),
      { today: TODAY },
    );
    expect(doc.lines[0].amount).toBe(200);
    expect(doc.lines[0].taxAmount).toBe(30);
    expect(doc.total).toBe(230);
  });
});

describe('what has been invoiced off a quotation', () => {
  const accepted = () => ({ ...raw().quote, status: 'accepted' });

  it('says how much is still to come when only part of it has been invoiced', () => {
    const doc = buildQuoteDocument(
      raw({ quote: accepted(), conversion: { total: 1150, invoiced: 460, left_to_invoice: 690 } }),
      { today: TODAY },
    );
    expect(doc.isPartlyInvoiced).toBe(true);
    expect(doc.invoicedAmount).toBe(460);
    expect(doc.leftToInvoice).toBe(690);
    expect(validityWording(doc)).toContain('still to come');
  });

  it('says so plainly once all of it has been invoiced', () => {
    const doc = buildQuoteDocument(
      raw({ quote: accepted(), conversion: { total: 1150, invoiced: 1150, left_to_invoice: 0 } }),
      { today: TODAY },
    );
    expect(doc.isPartlyInvoiced).toBe(false);
    expect(validityWording(doc)).toBe('This quotation has been invoiced in full.');
  });

  it('still reads as a live offer when nothing has been invoiced', () => {
    const doc = buildQuoteDocument(raw({ conversion: { total: 1150, invoiced: 0, left_to_invoice: 1150 } }), { today: TODAY });
    expect(doc.isPartlyInvoiced).toBe(false);
    expect(validityWording(doc)).not.toContain('invoiced');
  });
});
