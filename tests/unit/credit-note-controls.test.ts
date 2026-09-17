/**
 * Guards the credit note controls at the source level.
 *
 * Each assertion names a defect that shipped: a DELETE that erased posted
 * journals across tenants, posting functions any signed-in user could call for
 * any company, and an "allocation" journal that debited and credited the same
 * account. The behaviour itself is proved against the live database by
 * tools/staging-recovery/verify-credit-notes.ts; these cost nothing and run on
 * every commit, so the unsafe shapes cannot quietly come back.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const edge = read('supabase/functions/credit-notes/index.ts');
const migration = read('supabase/migrations/20260917100000_credit_notes_through_the_posting_engine.sql');

describe('the credit-notes edge function', () => {
  it('never deletes journal entries or credit notes', () => {
    expect(edge).not.toMatch(/from\(\s*['"]journal_entry_items['"]\s*\)\s*\.delete/);
    expect(edge).not.toMatch(/from\(\s*['"]journal_entries['"]\s*\)\s*\.delete/);
    expect(edge).not.toMatch(/from\(\s*['"]credit_notes['"]\s*\)\s*\.delete/);
  });

  it('authorises the caller against the company before anything else', () => {
    expect(edge).toContain('await bootstrapTenantRequest(req, _ctx)');
  });

  it('passes the authenticated user as the actor on every write', () => {
    for (const rpc of ['post_credit_note_atomic', 'apply_credit_note_atomic', 'unapply_credit_note_atomic', 'void_credit_note_atomic']) {
      const call = edge.slice(edge.indexOf(`rpc('${rpc}'`));
      expect(call.slice(0, call.indexOf('}));'))).toContain('p_actor_user_id: user.id');
    }
  });

  it('no longer calls the functions that bypassed the posting engine', () => {
    expect(edge).not.toContain("'create_credit_note'");
    expect(edge).not.toContain("'allocate_credit_note'");
  });

  it('scopes every read of a credit note to the company', () => {
    const reads = edge.split(".from('credit_notes')").slice(1);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.slice(0, read.indexOf(';'))).toContain(".eq('company_id', company_id)");
    }
  });
});

describe('the migration', () => {
  it('posts through the posting engine', () => {
    expect(migration).toContain('public.posting_engine_submit(');
    expect(migration).toContain("'document_type', 'credit_note'");
  });

  it('voids by reversal, never by deletion', () => {
    expect(migration).toContain('public.posting_engine_rollback(');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.journal_entr/i);
  });

  it('settles invoices through the allocation table, not a self-cancelling journal', () => {
    expect(migration).toContain('INSERT INTO public.invoice_payment_allocations');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.allocate_credit_note');
  });

  it('keeps every new function away from signed-in users', () => {
    for (const fn of [
      'post_credit_note_atomic', 'apply_credit_note_atomic', 'unapply_credit_note_atomic', 'void_credit_note_atomic',
      'credit_note_total', 'credit_note_applied_amount', 'invoice_credited_amount', 'credit_note_settlements',
      'credit_note_next_number',
    ]) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated`));
      expect(migration).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)[^;]*authenticated`));
    }
  });

  it('closes the same hole on the supplier-side credit functions', () => {
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.create_vendor_credit\([^)]*\)\s+FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.allocate_vendor_credit\([^)]*\)\s+FROM PUBLIC, anon, authenticated/);
  });

  it('leaves members able to read credit notes but not write them directly', () => {
    expect(migration).toContain('CREATE POLICY credit_notes_select ON public.credit_notes\n  FOR SELECT TO authenticated');
    expect(migration).toContain('DROP POLICY IF EXISTS "Company members can manage credit_notes"');
  });

  it('requires a reason and caps a credit at what the invoice has left to credit', () => {
    expect(migration).toContain('A credit note must say why it is being issued.');
    expect(migration).toContain('public.invoice_credited_amount(v_invoice_found)');
  });
});
