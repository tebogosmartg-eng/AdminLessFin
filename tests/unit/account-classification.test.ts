import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_CLASSIFICATIONS,
  CLASSIFICATION_REQUIRED_LABEL,
  classificationError,
  classificationsForType,
  countAccountsRequiringClassification,
  hierarchySortKey,
  isClassificationRequired,
  isValidClassification,
  resolveAccountHierarchy,
  subclassificationError,
  subclassificationsForClassification,
} from '../../src/lib/accounting/accountClassification';
import {
  isCurrentAssetAccount,
  isCurrentLiabilityAccount,
} from '../../src/lib/accounting/accountRoles';
import { RECOMMENDED_CONTROL_SPECS } from '../../src/governance/domains/accountingReadiness/controlAccountMapping';

/**
 * The Chart of Accounts is the single source of truth for account
 * classification. These tests pin that contract: the Trial Balance hierarchy is
 * a pure function of type + category + subcategory, never of the account name,
 * code, number, balance, or journal activity.
 */
describe('Account classification — Chart of Accounts is authoritative', () => {
  describe('Phase 10 — Trial Balance hierarchy test cases', () => {
    it('1. Accounts Payable — Liability / Current Liabilities', () => {
      const h = resolveAccountHierarchy({
        type: 'Liability',
        category: 'Current Liabilities',
        subcategory: 'Trade and Other Payables',
      });
      expect(h.l1).toBe('Liabilities');
      expect(h.l2).toBe('Current Liabilities');
      expect(h.l3).toBe('Trade and Other Payables');
      expect(h.unclassified).toBe(false);
    });

    it('2. Shareholders Loan — Liability / Non-Current Liabilities, with no repeated level', () => {
      const h = resolveAccountHierarchy({
        type: 'Liability',
        category: 'Non-Current Liabilities',
        subcategory: null,
      });
      expect(h.l1).toBe('Liabilities');
      expect(h.l2).toBe('Non-Current Liabilities');
      // l3 mirrors l2 so consumers render the classification exactly once,
      // instead of the "Non-current > Non-current" duplication.
      expect(h.l3).toBe(h.l2);
    });

    it('3. Inventory — Asset / Current Assets / Inventory', () => {
      const h = resolveAccountHierarchy({
        type: 'Asset',
        category: 'Current Assets',
        subcategory: 'Inventory',
      });
      expect([h.l1, h.l2, h.l3]).toEqual(['Assets', 'Current Assets', 'Inventory']);
    });

    it('4. Computer Equipment — Asset / Non-Current Assets / PPE', () => {
      const h = resolveAccountHierarchy({
        type: 'Asset',
        category: 'Non-Current Assets',
        subcategory: 'Property, Plant and Equipment',
      });
      expect([h.l1, h.l2, h.l3]).toEqual([
        'Assets',
        'Non-Current Assets',
        'Property, Plant and Equipment',
      ]);
    });

    it('5. Sales — Income / Revenue', () => {
      const h = resolveAccountHierarchy({ type: 'Income', category: 'Revenue' });
      expect(h.l1).toBe('Income');
      expect(h.l2).toBe('Revenue');
      expect(h.l3).toBe('Revenue');
    });

    it('6. Advertising — Expense / Operating Expenses', () => {
      const h = resolveAccountHierarchy({ type: 'Expense', category: 'Operating Expenses' });
      expect(h.l1).toBe('Expenses');
      expect(h.l2).toBe('Operating Expenses');
    });
  });

  describe('Phase 11 — classification is the only input to presentation', () => {
    it('re-classifying Shareholders Loan to current moves it, with no other change', () => {
      const account = {
        type: 'Liability',
        category: 'Non-Current Liabilities',
        subcategory: null as string | null,
      };
      expect(resolveAccountHierarchy(account).l2).toBe('Non-Current Liabilities');

      const edited = { ...account, category: 'Current Liabilities' };
      expect(resolveAccountHierarchy(edited).l2).toBe('Current Liabilities');
      expect(resolveAccountHierarchy(edited).l1).toBe('Liabilities');
    });

    it('identical accounts differing only in classification present differently', () => {
      const base = { type: 'Liability', name: 'Shareholders Loan', account_number: 4001 };
      expect(resolveAccountHierarchy({ ...base, category: 'Current Liabilities' }).l2).toBe(
        'Current Liabilities',
      );
      expect(resolveAccountHierarchy({ ...base, category: 'Non-Current Liabilities' }).l2).toBe(
        'Non-Current Liabilities',
      );
    });
  });

  describe('Phase 6 — no name, code, number, or balance heuristics', () => {
    it('a Liability named "Shareholders Loan" is NOT assumed non-current', () => {
      // The deployed defect: /loan/ in the name forced Non-current.
      const h = resolveAccountHierarchy({
        type: 'Liability',
        category: 'Current Liabilities',
        subcategory: null,
      });
      expect(h.l2).toBe('Current Liabilities');
    });

    it('account number 4001 does not influence the hierarchy', () => {
      const a = resolveAccountHierarchy({
        type: 'Liability',
        category: 'Current Liabilities',
      } as Record<string, unknown>);
      const b = resolveAccountHierarchy({
        type: 'Liability',
        category: 'Current Liabilities',
        account_number: 4001,
        name: 'Long-term mortgage bond',
      } as Record<string, unknown>);
      expect(a).toEqual(b);
    });

    it('the resolver reads no field other than type, category, and subcategory', () => {
      const noisy = {
        type: 'Asset',
        category: 'Current Assets',
        subcategory: 'Inventory',
        name: 'Land and Buildings',
        account_number: 9999,
        account_code: '1110',
        balance: -12345,
        normal_balance: 'credit',
      };
      expect(resolveAccountHierarchy(noisy)).toEqual(
        resolveAccountHierarchy({
          type: 'Asset',
          category: 'Current Assets',
          subcategory: 'Inventory',
        }),
      );
    });
  });

  describe('Phase 4 — invalid combinations are rejected', () => {
    it.each([
      ['Liability', 'Non-Current Assets'],
      ['Asset', 'Current Liabilities'],
      ['Expense', 'Current Assets'],
      ['Income', 'Operating Expenses'],
      ['Equity', 'Revenue'],
    ])('%s + %s is rejected', (type, category) => {
      expect(isValidClassification(type, category)).toBe(false);
      expect(classificationError(type, category)).toBeTruthy();
    });

    it('a Liability with no classification is rejected', () => {
      expect(classificationError('Liability', null)).toBe(
        'Classification is required for a Liability account.',
      );
      expect(classificationError('Liability', '   ')).toBeTruthy();
    });

    it('every valid type/classification pair is accepted', () => {
      for (const [type, categories] of Object.entries(ACCOUNT_CLASSIFICATIONS)) {
        for (const category of categories) {
          expect(classificationError(type, category)).toBeNull();
        }
      }
    });

    it('a statement line must belong to the chosen classification', () => {
      expect(subclassificationError('Current Assets', 'Property, Plant and Equipment')).toBeTruthy();
      expect(subclassificationError('Current Assets', 'Inventory')).toBeNull();
      expect(subclassificationError('Current Assets', '')).toBeNull();
      expect(subclassificationError('Revenue', 'Inventory')).toBeTruthy();
    });

    it('classification options depend on the account type', () => {
      expect(classificationsForType('Liability')).toEqual([
        'Current Liabilities',
        'Non-Current Liabilities',
      ]);
      expect(classificationsForType('Equity')).toEqual(['Equity']);
      expect(classificationsForType('nonsense')).toEqual([]);
      expect(subclassificationsForClassification('Non-Current Liabilities')).toContain(
        'Interest-bearing Borrowings',
      );
    });
  });

  describe('Phase 5 — unclassified accounts are flagged, never guessed', () => {
    it('an unclassified account groups under Classification Required', () => {
      const h = resolveAccountHierarchy({ type: 'Liability', category: null });
      expect(h.l1).toBe('Liabilities');
      expect(h.l2).toBe(CLASSIFICATION_REQUIRED_LABEL);
      expect(h.l3).toBe(CLASSIFICATION_REQUIRED_LABEL);
      expect(h.unclassified).toBe(true);
    });

    it('the legacy category = type backfill counts as unclassified', () => {
      expect(isClassificationRequired({ type: 'Liability', category: 'Liability' })).toBe(true);
      expect(isClassificationRequired({ type: 'Asset', category: 'Asset' })).toBe(true);
      // 'Equity' is both a type name and a valid Equity classification.
      expect(isClassificationRequired({ type: 'Equity', category: 'Equity' })).toBe(false);
    });

    it('a subcategory alone does not classify an account', () => {
      const h = resolveAccountHierarchy({
        type: 'Liability',
        category: null,
        subcategory: 'Trade and Other Payables',
      });
      expect(h.unclassified).toBe(true);
      expect(h.l3).toBe(CLASSIFICATION_REQUIRED_LABEL);
    });

    it('counts only active accounts needing a decision', () => {
      const accounts = [
        { type: 'Liability', category: 'Current Liabilities' },
        { type: 'Liability', category: null },
        { type: 'Asset', category: 'Asset' },
        { type: 'Asset', category: null, is_active: false },
      ];
      expect(countAccountsRequiringClassification(accounts)).toBe(2);
    });
  });

  describe('Phase 7 — downstream consumers agree with the Chart of Accounts', () => {
    it('an explicitly non-current asset is never counted as current', () => {
      const account = {
        id: 'a1',
        type: 'Asset',
        category: 'Non-Current Assets',
        // A statement line that used to force "current" on its own.
        subcategory: 'Trade and Other Receivables',
      };
      expect(isCurrentAssetAccount(account)).toBe(false);
    });

    it('an explicitly non-current liability is never counted as current', () => {
      const account = {
        id: 'l1',
        type: 'Liability',
        category: 'Non-Current Liabilities',
        subcategory: 'Trade and Other Payables',
      };
      expect(isCurrentLiabilityAccount(account)).toBe(false);
    });

    it('an unclassified account still resolves from role/statement-line metadata', () => {
      expect(
        isCurrentAssetAccount({
          id: 'a2',
          type: 'Asset',
          category: null,
          subcategory: 'Cash and Cash Equivalents',
        }),
      ).toBe(true);
    });
  });

  describe('presentation order is deterministic', () => {
    it('orders Assets before Liabilities, current before non-current', () => {
      const keys = [
        hierarchySortKey({ type: 'Asset', category: 'Current Assets' }),
        hierarchySortKey({ type: 'Asset', category: 'Non-Current Assets' }),
        hierarchySortKey({ type: 'Liability', category: 'Current Liabilities' }),
        hierarchySortKey({ type: 'Liability', category: 'Non-Current Liabilities' }),
        hierarchySortKey({ type: 'Equity', category: 'Equity' }),
        hierarchySortKey({ type: 'Income', category: 'Revenue' }),
        hierarchySortKey({ type: 'Expense', category: 'Cost of Sales' }),
      ];
      expect(keys).toEqual([...keys].sort((a, b) => a - b));
    });

    it('sorts unclassified accounts last within their statement group', () => {
      expect(hierarchySortKey({ type: 'Asset', category: null })).toBeGreaterThan(
        hierarchySortKey({ type: 'Asset', category: 'Non-Current Assets' }),
      );
    });
  });
});

describe('Classification vocabulary is consistent across the platform', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

  it('the edge twin of the classification module is byte-identical', () => {
    expect(read('supabase/functions/_shared/chartOfAccounts/accountClassification.ts')).toBe(
      read('src/lib/accounting/accountClassification.ts'),
    );
  });

  it('the database CHECK constraint lists exactly the module vocabulary', () => {
    const migration = read(
      'supabase/migrations/20260822120000_coa_authoritative_account_classification.sql',
    );
    const constraint = migration.slice(
      migration.indexOf('ADD CONSTRAINT chart_of_accounts_category_classification_check'),
    );
    for (const [type, categories] of Object.entries(ACCOUNT_CLASSIFICATIONS)) {
      for (const category of categories) {
        expect(constraint).toContain(`'${category}'`);
      }
      expect(constraint).toContain(`type::text = '${type}'`);
    }
  });

  it('every generated template account satisfies the classification constraint', () => {
    const templates = read('supabase/functions/_shared/chartOfAccounts/templates.ts');
    const rows = [...templates.matchAll(/type: '(\w+)', cat: '([^']+)'(?:, sub: '([^']+)')?/g)];
    expect(rows.length).toBeGreaterThan(50);
    for (const [, type, category, sub] of rows) {
      expect(classificationError(type, category), `${type} / ${category}`).toBeNull();
      if (sub) {
        expect(subclassificationError(category, sub), `${category} / ${sub}`).toBeNull();
      }
    }
  });

  it('every recommended control account satisfies the classification constraint', () => {
    const specs = Object.values(RECOMMENDED_CONTROL_SPECS);
    expect(specs.length).toBeGreaterThanOrEqual(8);
    for (const spec of specs) {
      expect(classificationError(spec.type, spec.category), spec.name).toBeNull();
      expect(subclassificationError(spec.category, spec.subcategory), spec.name).toBeNull();
    }
  });

  it('the Trial Balance edge function no longer classifies by name or number', () => {
    const edge = read('supabase/functions/accounting/index.ts');
    const tb = edge.slice(edge.indexOf("case 'GET_HIERARCHICAL_TRIAL_BALANCE'"));
    expect(tb).toContain('resolveAccountHierarchy(acc)');
    // The exact heuristics that produced "Liabilities > Non-current > Non-current".
    expect(tb).not.toContain('/cash|bank|petty/');
    expect(tb).not.toContain('/long|non.?current|loan|mortgage|bond/');
    expect(tb).not.toMatch(/l2: 'Non-current', l3: 'Non-current'/);
  });
});
