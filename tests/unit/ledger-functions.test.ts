/**
 * The canonical money functions: tenant-safe, and one definition of cash.
 *
 * get_balances_as_of_date, get_period_activity and get_cash_flow_statement feed
 * both the Trial Balance and the Financial Statements. Three defects, all
 * proved against production before they were fixed:
 *
 *   - Any signed-in user could read any company's ledger: SECURITY DEFINER,
 *     executable by `authenticated`, no membership check. 5 of 6 reads of
 *     foreign companies returned data.
 *   - The cash flow statement decided what cash is by account NAME
 *     ('%cash%', '%bank%', '%checking%') while the balance sheet decides by
 *     role and classification. One company's cash flow read 0 against 672 225,82
 *     of real cash movement, because its bank accounts are not named "bank".
 *   - Each cash movement was counted once per other line in its journal; two
 *     companies reported exactly 4x their real cash movement.
 *
 * Behaviour is proved against live data by the migration rehearsal and by
 * tools/staging-recovery/probe-ledger-tenant-isolation.ts. These pin the shape.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20260922190000_the_ledger_functions_are_tenant_safe_and_cash_reconciles.sql');
const cfa = read('supabase/functions/_shared/canonicalFinancialAggregation.ts');

/** The body of one function, from its CREATE to the next CREATE. */
function body(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const next = migration.indexOf('CREATE OR REPLACE FUNCTION', start + 1);
  return migration.slice(start, next === -1 ? undefined : next);
}

const MONEY = ['get_balances_as_of_date', 'get_period_activity', 'get_cash_flow_statement'];

describe('the ledger functions', () => {
  it.each(MONEY)('%s checks the caller may read the company before anything else', (fn) => {
    const b = body(fn);
    expect(b).toContain('PERFORM public.assert_can_read_company_ledger(p_company_id);');
    expect(b.indexOf('assert_can_read_company_ledger')).toBeLessThan(b.indexOf('RETURN QUERY'));
  });

  it.each(MONEY)('%s never guesses the company from a profile', (fn) => {
    expect(body(fn)).not.toContain('active_company_id');
  });

  it('the guard uses the same membership rule as the row policies', () => {
    const guard = body('assert_can_read_company_ledger');
    expect(guard).toContain('public.is_company_member(p_company_id)');
    expect(guard).toContain("ERRCODE = '42501'");
    // the service role (edge functions, after authorising) carries no user
    expect(guard).toContain('auth.uid() IS NOT NULL');
  });

  it('refuses a missing company outright', () => {
    expect(body('assert_can_read_company_ledger')).toContain('p_company_id IS NULL');
  });
});

describe('what counts as cash', () => {
  it('the cash flow statement no longer decides by account name', () => {
    const cf = body('get_cash_flow_statement');
    expect(cf).not.toMatch(/lower\(name\)\s+LIKE/i);
    expect(cf).not.toMatch(/name\s+LIKE\s+'%(cash|bank|checking)%'/i);
    expect(cf).toContain('public.cash_account_ids(p_company_id)');
  });

  it('cash is defined by role and classification in one SQL function', () => {
    const whole = body('cash_account_ids');
    // just the SQL between the dollar quotes, not the comment describing it
    const rule = whole.slice(whole.indexOf('AS $$') + 5, whole.indexOf('$$;'));
    expect(rule).toContain("a.account_role IN ('bank', 'cash')");
    expect(rule).toContain("a.subcategory = 'Cash and Cash Equivalents'");
    expect(rule).not.toMatch(/\bname\b/);
  });

  it('the balance sheet uses the same test, so the two cannot drift apart', () => {
    const fn = cfa.slice(cfa.indexOf('function isCashBalanceAccount'), cfa.indexOf('function isCashBalanceAccount') + 400);
    expect(fn).toMatch(/r === 'bank' \|\| r === 'cash'/);
    expect(fn).toContain("'Cash and Cash Equivalents'");
  });
});

describe('each cash movement is counted once', () => {
  it('reads the cash from the counter-lines, not the cash line times every counter-line', () => {
    const cf = body('get_cash_flow_statement');
    // the old shape carried the cash line's full amount onto every other line
    expect(cf).not.toContain('cm.move_amount');
    expect(cf).toContain('-1 * jei.amount');
    expect(cf).toContain('SELECT DISTINCT je.id AS journal_entry_id');
  });

  it('classifies by the account\'s own cash flow classification first, then its category', () => {
    const cf = body('get_cash_flow_statement');
    expect(cf.indexOf("cl.cfc = 'operating'")).toBeLessThan(cf.indexOf("cl.account_category = 'Current Assets'"));
    // collecting a debtor is operating; buying equipment is investing
    expect(cf).toContain("cl.account_type = 'Asset' AND cl.account_category = 'Current Assets' THEN 'Operating'");
    expect(cf).toContain("cl.account_type = 'Asset' AND cl.account_category = 'Non-Current Assets' THEN 'Investing'");
    expect(cf).toContain("cl.account_type = 'Liability' AND cl.account_category = 'Current Liabilities' THEN 'Operating'");
  });
});
