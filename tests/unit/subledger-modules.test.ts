/**
 * Keeps the sub-ledger module allow-list the same in all three places it lives.
 *
 * The rule: stock and cost-of-sales accounts may only be posted by a routine
 * that moves stock in the sub-ledger at the same time, and never by hand. It is
 * enforced in the database by accounting_policy_evaluate_posting, and mirrored
 * twice in TypeScript -- once for the edge functions and once for the
 * governance screens. If the copies drift, the app tells the user one thing and
 * the ledger does another.
 *
 * The defect this pins: the allow-list named only the two Inventory modules, so
 * post_sales_invoice_atomic -- which does consume stock and does write
 * inventory_transactions -- was refused, and a stock item could not be sold on
 * an invoice at all.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SUBLEDGER_MODULES } from '../../src/governance/domains/accountingPolicyEngine/evaluate';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const migration = read('supabase/migrations/20260922100000_selling_stock_charges_its_cost.sql');
const edgeEngine = read('supabase/functions/_shared/accountingPolicyEngine/evaluate.ts');
const appEngine = read('src/governance/domains/accountingPolicyEngine/evaluate.ts');

/** The body of accounting_subledger_modules, without the header comment. */
const allowListBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.accounting_subledger_modules'),
  migration.indexOf('COMMENT ON FUNCTION public.accounting_subledger_modules'),
);

describe('sub-ledger module allow-list', () => {
  it('lets the sales invoice move stock', () => {
    expect(SUBLEDGER_MODULES.inventory).toContain('sales_invoice');
    expect(allowListBody).toContain("'sales_invoice'");
  });

  it('still lets the two Inventory modules move stock', () => {
    expect(SUBLEDGER_MODULES.inventory).toContain('inventory_receipt');
    expect(SUBLEDGER_MODULES.inventory).toContain('inventory_issue');
  });

  it('lets nothing else move stock', () => {
    expect([...SUBLEDGER_MODULES.inventory].sort()).toEqual(
      ['inventory_issue', 'inventory_receipt', 'sales_invoice'],
    );
    for (const module of ['manual_journal', 'accounts_payable', 'banking', 'payroll', 'fixed_assets']) {
      expect(SUBLEDGER_MODULES.inventory as readonly string[]).not.toContain(module);
    }
  });

  it('leaves fixed assets to the Fixed Assets module alone', () => {
    expect([...SUBLEDGER_MODULES.fixed_assets]).toEqual(['fixed_assets']);
    expect(allowListBody).toContain("WHEN 'fixed_assets' THEN ARRAY['fixed_assets']");
  });

  it('matches the list the database enforces', () => {
    for (const module of SUBLEDGER_MODULES.inventory) {
      expect(allowListBody).toContain(`'${module}'`);
    }
  });

  it('reads the allow-list from a function rather than declaring it inline', () => {
    // An inline ARRAY[...] in the evaluator is what made this a 200-line
    // re-declaration to change, and is why the sales module was never added.
    expect(migration).toContain("public.accounting_subledger_modules('inventory')");
    expect(migration).not.toContain("v_inventory_modules text[] := ARRAY[");
  });

  it('keeps the two TypeScript copies identical', () => {
    // They are maintained as byte-for-byte mirrors apart from the header line.
    const strip = (s: string) => s.split('\n').slice(2).join('\n');
    expect(strip(edgeEngine)).toEqual(strip(appEngine));
  });

  it('says what the rule is, not which module owns it', () => {
    expect(migration).not.toContain('may only be posted from the Inventory module');
    expect(edgeEngine).not.toContain('may only be posted from the Inventory module');
    expect(migration).toContain('written only where stock actually moves');
  });

  it('keeps the policy mandatory and blocking', () => {
    // The migration renames and re-describes the policy; it must not relax it.
    expect(migration).not.toMatch(/is_mandatory\s*=\s*false/);
    expect(migration).not.toMatch(/default_severity\s*=\s*'(warning|information)'/);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.accounting_policy_definitions/i);
  });
});
