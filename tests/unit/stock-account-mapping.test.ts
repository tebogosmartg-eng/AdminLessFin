/**
 * Guards what a stock product is allowed to post its cost to.
 *
 * The defect this pins: post_sales_invoice_atomic checked only that a stock
 * product HAD an inventory asset account and a cost of sales account, never
 * that they were those things. A live tenant had a stock product whose "stock"
 * account was the trade receivable control account and whose "cost of sales"
 * account was Fuel, so every sale debited Fuel and CREDITED ACCOUNTS RECEIVABLE
 * with the cost of the goods -- understating what customers owed. The
 * accounting policy could not catch it, because it looks for the roles
 * `inventory_asset` and `cogs` and neither account carried one.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260922140000_a_stock_product_must_name_real_stock_accounts.sql'),
  'utf8',
);

/** The function body only — the header comment describes the old behaviour. */
const body = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.post_sales_invoice_atomic'));

const CONTROL_ROLES = [
  'trade_receivable',
  'trade_payable',
  'bank',
  'input_vat',
  'output_vat',
  'vat_control',
  'retained_earnings',
];

describe('a stock product must name real stock accounts', () => {
  it('requires the stock account to be an asset', () => {
    expect(body).toContain("v_stock_account.type <> 'Asset'");
  });

  it('requires the cost of sales account to be an expense', () => {
    expect(body).toContain("v_cogs_account.type <> 'Expense'");
  });

  it.each(CONTROL_ROLES)('keeps the cost of goods out of the %s account', (role) => {
    // Both checks share one list, so each role must appear at least twice.
    const hits = body.split(`'${role}'`).length - 1;
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('checks both accounts belong to the company posting the invoice', () => {
    const scoped = body.split('company_id = p_company_id').length - 1;
    expect(scoped).toBeGreaterThanOrEqual(2);
    expect(body).toContain('does not belong to this company');
  });

  it('checks the accounts before any stock is consumed', () => {
    // Otherwise the failure reads as a stock problem rather than a mapping one.
    expect(body.indexOf('is not a stock account')).toBeLessThan(body.indexOf('eim_consume_stock('));
  });

  it('names the offending account in the message', () => {
    expect(body).toContain('v_stock_account.name');
    expect(body).toContain('v_cogs_account.name');
  });

  it('does not demand an account_role, only that it is not a control account', () => {
    // Several companies map a perfectly good cost of sales account without
    // setting a role; refusing those would be wrong.
    expect(body).not.toMatch(/v_cogs_account\.account_role\s*<>\s*'cogs'/);
    expect(body).not.toMatch(/v_stock_account\.account_role\s*<>\s*'inventory_asset'/);
  });

  it('posts the cost to the account it actually checked', () => {
    // The credit used to be re-derived with COALESCE, which could differ from
    // the account the check ran against.
    expect(body).toContain("jsonb_build_object('account_id', v_stock_account_id, 'credit', v_consumed.total_cost)");
  });

  it('repairs nothing and rewrites no posted entry', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.journal_entry_items/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.journal/i);
    expect(migration).not.toMatch(/UPDATE\s+products\s+SET/i);
  });
});
