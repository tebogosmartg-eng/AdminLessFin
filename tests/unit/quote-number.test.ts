import { describe, expect, it } from 'vitest';
import { nextQuoteNumber } from '../../src/lib/quotes/quoteNumber';

describe('next quotation number', () => {
  it('starts at QTE-00001 when the company has no QTE quotes', () => {
    expect(nextQuoteNumber([])).toBe('QTE-00001');
  });

  it('increments the highest QTE number, not the most recently created quote', () => {
    expect(nextQuoteNumber(['QTE-00001', 'QDOC-1789588595128'])).toBe('QTE-00002');
  });

  it('ignores probe and email prefixes', () => {
    expect(nextQuoteNumber(['QTE-00005', 'CLOSURE-Q-1', 'SR-AUDIT-9', 'Q-EMAIL-1'])).toBe('QTE-00006');
  });

  it('does not collapse to 00001 just because the latest row is not a QTE number', () => {
    expect(nextQuoteNumber(['QTE-00001', 'QDOC-1789588595128'])).not.toBe('QTE-00001');
  });
});
