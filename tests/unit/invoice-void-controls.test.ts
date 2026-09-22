/**
 * Guards the controls on voiding an invoice.
 *
 * What void_invoice used to do, all four at once: it took an invoice id alone
 * with no membership check while EXECUTE was granted to `authenticated` (so any
 * signed-in user could void any company's invoice); it INSERTed the reversal
 * journal straight into the tables, skipping the posting engine and therefore
 * the period check, the policy check, the journal number and the posting
 * request; it never returned the stock the invoice had issued, leaving the
 * ledger and the stock records disagreeing; and it could be run twice.
 *
 * The behaviour is proved against production by
 * tools/staging-recovery/probe-sell-stock-on-invoice.ts. These run on every
 * commit so the shapes cannot come back.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20260922120000_voiding_an_invoice_is_a_posting_not_a_status.sql');
const edge = read('supabase/functions/invoices/index.ts');
const detail = read('src/pages/InvoiceDetail.tsx');

/** The function body only, so the header comment quoting the old code cannot satisfy a check. */
const body = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.void_invoice'),
  migration.indexOf('COMMENT ON FUNCTION public.void_invoice'),
);

describe('voiding an invoice', () => {
  it('requires the company and the person doing it', () => {
    expect(body).toContain('p_company_id IS NULL OR p_actor_user_id IS NULL');
  });

  it('checks the caller is a member of that company', () => {
    expect(body).toContain('FROM public.company_users cu');
    expect(body).toMatch(/cu\.user_id = p_actor_user_id AND cu\.company_id = p_company_id/);
    expect(body).toContain("ERRCODE = '42501'");
  });

  it('finds the invoice only within that company', () => {
    expect(body).toMatch(/FROM public\.invoices\s+WHERE id = p_invoice_id AND company_id = p_company_id/);
  });

  it('locks the invoice before acting on it', () => {
    expect(body).toContain('FOR UPDATE');
  });

  it('refuses a second void', () => {
    expect(body).toContain("v_inv.status = 'void'");
    expect(body).toContain('has already been voided');
  });

  it('refuses an invoice that was never posted', () => {
    expect(body).toContain('v_inv.journal_entry_id IS NULL');
  });

  it('refuses an invoice with a settlement against it', () => {
    expect(body).toContain('invoice_allocated_amount');
    expect(body).toContain('settled against it');
  });

  it('reverses through the posting engine', () => {
    expect(body).toContain('public.posting_engine_rollback(');
    // and not by hand-rolling the mirror for a posting the engine owns
    expect(body).toContain("idempotency_key = v_key AND status = 'committed'");
  });

  it('still checks the period and allocates a number on the legacy path', () => {
    // Two Spaceman invoices predate the posting engine and have no request to
    // roll back; they must not become the loophole.
    expect(body).toContain('public.assert_period_open(p_company_id, CURRENT_DATE)');
    expect(body).toContain('public.posting_engine_next_journal_number(p_company_id)');
  });

  it('returns the stock the invoice issued', () => {
    expect(body).toContain("transaction_type = 'issue'");
    expect(body).toContain('public.eim_get_or_create_balance');
    expect(body).toContain('qty_on_hand = qty_on_hand + v_qty');
    expect(body).toContain('public.eim_sync_product_qty');
  });

  it('puts a cost layer back only where one was taken', () => {
    // weighted average does not consume layers, so returning one would invent
    // stock value that never left.
    expect(body).toMatch(/IN \('fifo', 'specific'\)/);
    expect(body).toContain('inv_cost_layers');
  });

  it('ties the stock return to the reversal journal', () => {
    expect(body).toMatch(/journal_entry_id[\s\S]{0,400}v_je_id/);
    expect(body).toContain('Stock returned when invoice');
  });

  it('records who voided it, when and why', () => {
    expect(body).toContain('voided_at = now()');
    expect(body).toContain('voided_by = p_actor_user_id');
    expect(body).toContain('void_reason');
  });

  it('is taken away from signed-in users and left to the service role', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.void_invoice\(uuid, uuid, uuid, text\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.void_invoice\(uuid, uuid, uuid, text\)\s*\n?\s*TO service_role;/,
    );
  });

  it('drops the old one-argument version so nothing can call the unguarded shape', () => {
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.void_invoice(uuid);');
  });

  it('pins the statuses an invoice may hold', () => {
    expect(migration).toContain("CHECK (status IN ('draft', 'sent', 'paid', 'partially_paid', 'void'))");
  });

  it('only adds stock movements in the backfill, never rewrites a journal', () => {
    const backfill = migration.slice(migration.indexOf('DO $backfill$'));
    expect(backfill).not.toMatch(/UPDATE\s+public\.journal_entry_items/i);
    expect(backfill).not.toMatch(/DELETE\s+FROM\s+public\.journal_entr/i);
    // and it must not double-return stock that already came back
    expect(backfill).toContain("r.transaction_type = 'receipt'");
  });
});

describe('the invoice edge function', () => {
  it('passes the company and the actor to the void', () => {
    expect(edge).toContain('p_company_id: company_id');
    expect(edge).toMatch(/void_invoice[\s\S]{0,300}p_actor_user_id: user\.id/);
  });

  it('does not swallow the void failure', () => {
    expect(edge).toMatch(/void_invoice[\s\S]{0,400}if \(voidError\) throw voidError;/);
  });
});

describe('the invoice detail screen', () => {
  it('shows the real reason a void was refused', () => {
    // supabase-js collapses every non-2xx into "returned a non-2xx status
    // code", so without unwrapping it the user is told nothing at all.
    expect(detail).toContain('edgeErrorMessage');
    expect(detail).toMatch(/VOID[\s\S]{0,500}edgeErrorMessage/);
  });
});
