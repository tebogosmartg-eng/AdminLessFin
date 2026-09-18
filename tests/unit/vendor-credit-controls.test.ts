/**
 * Guards the supplier credit controls at the source level.
 *
 * Each assertion names a defect that shipped: a DELETE that erased posted
 * journals across tenants, posting functions any signed-in user could call for
 * any company, an "allocation" journal that debited and credited the same
 * account, and a bill payment that recorded nothing about which bill it paid.
 * The behaviour itself is proved against the live database by
 * tools/staging-recovery/verify-vendor-credits.ts; these cost nothing and run
 * on every commit, so the unsafe shapes cannot quietly come back.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const edge = read('supabase/functions/vendor-credits/index.ts');
const migration = read('supabase/migrations/20260918100000_supplier_credits_through_the_posting_engine.sql');

describe('the vendor-credits edge function', () => {
  it('never deletes journal entries or supplier credits', () => {
    expect(edge).not.toMatch(/from\(\s*['"]journal_entry_items['"]\s*\)\s*\.delete/);
    expect(edge).not.toMatch(/from\(\s*['"]journal_entries['"]\s*\)\s*\.delete/);
    expect(edge).not.toMatch(/from\(\s*['"]vendor_credits['"]\s*\)\s*\.delete/);
  });

  it('authorises the caller against the company before anything else', () => {
    expect(edge).toContain('await bootstrapTenantRequest(req, _ctx)');
  });

  it('passes the authenticated user as the actor on every write', () => {
    for (const rpc of ['post_vendor_credit_atomic', 'apply_vendor_credit_atomic', 'unapply_vendor_credit_atomic', 'void_vendor_credit_atomic']) {
      const call = edge.slice(edge.indexOf(`rpc('${rpc}'`));
      expect(call.slice(0, call.indexOf('}));'))).toContain('p_actor_user_id: user.id');
    }
  });

  it('no longer calls the functions that bypassed the posting engine', () => {
    expect(edge).not.toContain("'create_vendor_credit'");
    expect(edge).not.toContain("'allocate_vendor_credit'");
  });

  it('scopes every read of a supplier credit to the company', () => {
    const reads = edge.split(".from('vendor_credits')").slice(1);
    expect(reads.length).toBeGreaterThan(0);
    for (const chunk of reads) {
      expect(chunk.slice(0, chunk.indexOf(';'))).toContain(".eq('company_id', company_id)");
    }
  });
});

describe('paying a bill', () => {
  const payments = read('supabase/functions/payments/index.ts');

  it('sends the company and the actor with the bill, so one company cannot pay another"s', () => {
    const call = payments.slice(payments.indexOf("rpc('pay_specific_bill'"));
    const args = call.slice(0, call.indexOf('}));'));
    expect(args).toContain('p_company_id: company_id');
    expect(args).toContain('p_actor_user_id: user.id');
  });

  it('records what the payment paid off', () => {
    expect(migration).toContain('INSERT INTO public.bill_payment_allocations');
    expect(migration).toContain('public.bill_refresh_payment_status(p_bill_id)');
  });

  it('drops the signature that took a bill id with no company beside it', () => {
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.pay_specific_bill(uuid, date, uuid, uuid, numeric)');
  });
});

describe('the migration', () => {
  it('posts through the posting engine', () => {
    expect(migration).toContain('public.posting_engine_submit(');
    expect(migration).toContain("'document_type', 'vendor_credit'");
  });

  it('voids by reversal, never by deletion', () => {
    expect(migration).toContain('public.posting_engine_rollback(');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.journal_entr/i);
  });

  it('settles bills through the allocation table, not a self-cancelling journal', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.bill_payment_allocations');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.allocate_vendor_credit');
  });

  it('keeps every new function away from signed-in users', () => {
    for (const fn of [
      'post_vendor_credit_atomic', 'apply_vendor_credit_atomic', 'unapply_vendor_credit_atomic', 'void_vendor_credit_atomic',
      'vendor_credit_total', 'vendor_credit_applied_amount', 'bill_credited_amount', 'vendor_credit_settlements',
      'vendor_credit_next_number', 'bill_gross_amount', 'bill_allocated_amount', 'bill_outstanding_amount',
      'bill_refresh_payment_status', 'pay_specific_bill',
    ]) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated`));
      expect(migration).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)[^;]*authenticated`));
    }
  });

  it('leaves members able to read supplier credits but not write them directly', () => {
    expect(migration).toContain('CREATE POLICY vendor_credits_select ON public.vendor_credits\n  FOR SELECT TO authenticated');
    expect(migration).toContain('DROP POLICY IF EXISTS "Company members can manage vendor_credits"');
    expect(migration).toContain('CREATE POLICY bill_payment_allocations_select ON public.bill_payment_allocations\n  FOR SELECT TO authenticated');
  });

  it('requires a reason and caps a credit at what the bill has left to credit', () => {
    expect(migration).toContain('A supplier credit must say why it is being issued.');
    expect(migration).toContain('public.bill_credited_amount(v_bill_found)');
  });

  it('refuses to post a credit to the control account, the bank or VAT', () => {
    expect(migration).toContain("('trade_payable', 'trade_receivable', 'bank', 'input_vat', 'output_vat', 'vat_control')");
  });

  it('withdraws a reversed journal"s allocations without touching the receivables side', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.bill_allocations_follow_reversal()');
    expect(migration).not.toContain('DROP TRIGGER IF EXISTS invoice_allocations_follow_reversal_trg');
  });
});

describe('prefilling a credit from its bill', () => {
  it('reads the tax rate off the cost line, where a bill records it', () => {
    // Found in production: record_bill_with_taxes links the rate to the COST
    // line, while a sales invoice links it to the VAT line. Copying the invoice
    // logic found no rate on a bill, so no VAT rate was suggested and crediting
    // a VAT-inclusive bill in full reversed the goods and left the VAT behind.
    const block = edge.slice(edge.indexOf("case 'GET_BILL_FOR_CREDIT'"));
    expect(block).toContain("cost.some((i) => rateOf(i)?.tax_rate_id) ? cost : vatLines");
  });

  it('only suggests a rate that reproduces the bill VAT to the cent', () => {
    expect(edge).toContain('Math.abs(reproduced - vatTotal) < 0.005');
  });
});

describe('the creditors age analysis', () => {
  const ageing = read('supabase/functions/_shared/controlAccountAgeing.ts');

  it('reads the payables allocations the way it reads the receivables ones', () => {
    expect(ageing).toContain("side === 'receivable' ? 'invoice_payment_allocations' : 'bill_payment_allocations'");
    expect(ageing).toContain("side === 'receivable' ? 'invoice_id' : 'bill_id'");
    expect(ageing).not.toContain('There is no allocation table on the payables side yet');
  });
});
