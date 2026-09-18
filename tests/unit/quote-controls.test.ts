/**
 * Guards the quotation controls at the source level.
 *
 * Each assertion names something the live API accepted when this module was
 * probed: a made-up status, a quote with no lines, a negative quantity,
 * another company's income account, a row written straight past the edge
 * function, the rewriting of an already-accepted price, the deletion of a quote
 * that had been invoiced, and -- on the conversion -- the same quote invoiced
 * four times over, once at 500%, and once after being declined.
 *
 * The behaviour is proved against the live database by
 * tools/staging-recovery/probe-quote-controls.ts; these cost nothing and run on
 * every commit, so the unsafe shapes cannot quietly come back.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20260918160000_quotations_are_controlled_documents.sql');
const quotesEdge = read('supabase/functions/quotes/index.ts');
const invoicesEdge = read('supabase/functions/invoices/index.ts');

describe('the quotes edge function', () => {
  it('authorises the caller against the company before anything else', () => {
    expect(quotesEdge).toContain('await bootstrapTenantRequest(req, _ctx)');
  });

  it('writes nothing to the tables itself', () => {
    for (const table of ['quotes', 'quote_items']) {
      expect(quotesEdge).not.toMatch(new RegExp(`from\\(\\s*['"]${table}['"]\\s*\\)\\s*\\.(insert|update|delete)`));
    }
  });

  it('passes the authenticated user as the actor on every write', () => {
    for (const rpc of ['save_quote_atomic', 'set_quote_status_atomic', 'delete_quote_atomic']) {
      const call = quotesEdge.slice(quotesEdge.indexOf(`rpc('${rpc}'`));
      expect(call.slice(0, call.indexOf('}));'))).toContain('p_actor_user_id: user.id');
    }
  });

  it('scopes every read of a quotation to the company', () => {
    const reads = quotesEdge.split(".from('quotes')").slice(1);
    expect(reads.length).toBeGreaterThan(0);
    for (const chunk of reads) {
      expect(chunk.slice(0, chunk.indexOf(';'))).toContain(".eq('company_id', company_id)");
    }
  });
});

describe('turning a quotation into an invoice', () => {
  it('happens in one locked transaction, not as two calls with a gap between them', () => {
    const block = invoicesEdge.slice(invoicesEdge.indexOf("case 'CREATE_FROM_QUOTE'"));
    const arm = block.slice(0, block.indexOf('break;'));
    expect(arm).toContain("rpc('convert_quote_to_invoice_atomic'");
    // Building the lines here and posting them separately is what let two
    // clicks raise two full invoices from one quotation.
    expect(arm).not.toContain("rpc('post_sales_invoice_atomic'");
    expect(arm).not.toContain('percentage / 100.0');
  });

  it('locks the quotation and caps what may still be invoiced against it', () => {
    expect(migration).toContain('FROM public.quotes WHERE id = p_quote_id AND company_id = p_company_id\n  FOR UPDATE');
    expect(migration).toContain('public.quote_invoiced_amount(p_quote_id)');
    expect(migration).toContain('v_this > v_room + 0.005');
  });

  it('refuses a percentage that is not a share of the quotation', () => {
    expect(migration).toContain('IF v_pct <= 0 OR v_pct > 100 THEN');
  });

  it('invoices only an accepted quotation', () => {
    expect(migration).toContain("IF v_quote.status <> 'accepted' THEN");
  });

  it('resolves the receivable and VAT accounts by role, not from the caller', () => {
    expect(migration).toContain("AND type = 'Asset' AND account_role = 'trade_receivable'");
    expect(migration).toContain("account_role IN ('output_vat', 'vat_control')");
  });
});

describe('the migration', () => {
  it('leaves members able to read quotations but not write them directly', () => {
    expect(migration).toContain('CREATE POLICY quotes_select ON public.quotes\n  FOR SELECT TO authenticated');
    expect(migration).toContain('DROP POLICY IF EXISTS "Company members can manage quotes"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Company members can manage quote items"');
  });

  it('allows only a status that exists', () => {
    expect(migration).toContain("CHECK (status IN ('draft', 'sent', 'accepted', 'declined'))");
    expect(migration).toContain("IF v_status NOT IN ('draft', 'sent', 'accepted', 'declined') THEN");
  });

  it('validates every line against this company', () => {
    expect(migration).toContain('that income account does not belong to this company');
    expect(migration).toContain('the product does not belong to this company');
    expect(migration).toContain('the tax rate does not belong to this company');
    expect(migration).toContain('the quantity must be more than zero');
    expect(migration).toContain('A quotation needs at least one line.');
  });

  it('fixes what a customer has accepted or been invoiced for', () => {
    expect(migration).toContain('has been accepted and can no longer be changed');
    expect(migration).toContain('has already been invoiced and can no longer be changed');
    expect(migration).toContain('has been invoiced and cannot be deleted');
  });

  it('records who answered the quotation, and when', () => {
    expect(migration).toContain('accepted_at');
    expect(migration).toContain('accepted_by');
    expect(migration).toContain('decline_reason');
  });

  it('keeps every new function away from signed-in users', () => {
    for (const fn of [
      'save_quote_atomic', 'set_quote_status_atomic', 'delete_quote_atomic',
      'convert_quote_to_invoice_atomic', 'quote_gross_amount', 'quote_invoiced_amount',
    ]) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(`));
      expect(migration).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)[^;]*authenticated`));
    }
  });
});
