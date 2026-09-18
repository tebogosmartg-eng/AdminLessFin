/**
 * Guards the next-invoice-number rule at the source level.
 *
 * The defect this pins: the routine read the most recently CREATED invoice and
 * took the number from it, so a company whose newest invoice was not an
 * INV-##### (a converted document, an imported reference, a timestamp) was
 * offered INV-00001 -- which it had already used. Saving then failed on a
 * duplicate key and the invoice form could not be used at all. Three live
 * companies were in that state, including a client with 49 invoices.
 *
 * The behaviour is proved against production by
 * tools/staging-recovery/probe-invoice-next-number.ts; these run on every
 * commit so the shape cannot come back.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20260918140000_invoice_numbers_follow_the_highest_not_the_latest.sql');
const edge = read('supabase/functions/invoices/index.ts');

/**
 * The migration's header quotes the OLD code so the next reader knows what was
 * wrong. Assertions about what the file does must therefore read the function
 * bodies, not the whole file, or the quoted defect fails its own test.
 */
const bodies = migration
  .split('AS $$')
  .slice(1)
  .map((chunk) => chunk.split('$$;')[0])
  .join('\n');

/** The GET_NEXT_INVOICE_NUMBER arm alone, not the cases around it. */
const numberCase = (() => {
  const from = edge.indexOf("case 'GET_NEXT_INVOICE_NUMBER'");
  const next = edge.indexOf("case '", from + 1);
  return edge.slice(from, next === -1 ? undefined : next);
})();

describe('the next invoice number', () => {
  it('comes from the highest number used, not the latest row created', () => {
    expect(bodies).toContain("MAX(substring(invoice_number FROM '^INV-(\\d{1,9})$')::bigint)");
    expect(bodies).not.toMatch(/ORDER BY created_at DESC/i);
  });

  it('is asked of a company, never inferred from whoever is asking', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.invoice_next_number(p_company_id uuid)');
    expect(numberCase).toContain("rpc('invoice_next_number', { p_company_id: company_id })");
  });

  it('counts only a bounded digit run, so a timestamp reference cannot drive or overflow the sequence', () => {
    expect(bodies).toContain('\\d{1,9}');
    expect(bodies).not.toMatch(/::integer/);
    expect(numberCase).toContain('/^INV-(\\d{1,9})$/');
  });

  it('checks the number it is about to offer is actually free', () => {
    // The old fallback only ran when the routine ERRORED. Returning INV-00001
    // for a company that already has one is a wrong answer, not an error, so
    // nothing caught it.
    expect(numberCase).toContain(".eq('invoice_number', candidate)");
  });

  it('still answers for a company that has never raised an invoice', () => {
    expect(bodies).toContain('COALESCE(MAX(');
    expect(bodies).toContain("RETURN 'INV-00001'");
  });
});
