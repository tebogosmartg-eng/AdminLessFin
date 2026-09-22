/**
 * Accounting Readiness — the composition.
 *
 * Every FACT now comes from the database function accounting_facts(company):
 * which control roles the chart carries, whether it is classified, whether a
 * financial year is open, whether VAT is configured. Those rules -- including
 * that an account is matched on its role and never on its name -- are proved
 * against the real database by tools/staging-recovery/probe-accounting-facts.ts
 * and the migration rehearsal.
 *
 * What is left in TypeScript, and what these test, is what the facts add up to:
 * the six setup steps, the progress, the status, and the sentences Accounting
 * Setup shows. It used to exist twice -- once in the edge function and once in
 * a frontend mirror -- and nowhere in the database.
 */
import { describe, expect, it } from 'vitest';
import {
  composeReadiness,
  nextIncompleteStep,
  resolveReadinessGate,
  type AccountingFacts,
} from '../../supabase/functions/_shared/accountingReadiness/compose';

/** A company with everything in place; each test spoils exactly one thing. */
function facts(overrides: Partial<AccountingFacts> = {}): AccountingFacts {
  const base: AccountingFacts = {
    company_id: 'co-1',
    as_of: '2026-09-22',
    calendar: {
      has_year: true,
      has_open_year: true,
      current_year: {
        id: 'fy-1', year_code: 'FY2026', status: 'open',
        start_date: '2026-01-01', end_date: '2026-12-31', contains_today: true,
      },
      year_count: 1,
      open_year_count: 1,
      open_years_containing_today: 1,
      period_count: 12,
      open_period_count: 1,
      current_period: { id: 'p-9', status: 'open', start_date: '2026-09-01', end_date: '2026-09-30' },
    },
    chart: {
      account_count: 15,
      active_count: 15,
      missing_types: [],
      unclassified: [],
      duplicate_codes: [],
      duplicate_numbers: [],
      normal_balance_errors: [],
    },
    control_accounts: {
      trade_debtors: true, trade_creditors: true, vat_control: true, bank: true,
      retained_earnings: true, profit_loss: true,
      inventory: false, fixed_assets: false, payroll_clearing: false,
    },
    tax: { rate_count: 1, vat_account_count: 1 },
    banking: { bank_account_count: 1, opening_balances_posted: true },
    ledger: { journal_count: 10, total_debits: 100, total_credits: 100, balanced: true, unbalanced_journals: [] },
    payroll: { active_mapping_count: 0 },
    flags: {
      bank_accounts_skipped: false,
      opening_balances_zero_intentional: false,
      inventory_enabled: false,
      fixed_assets_enabled: false,
      payroll_enabled: false,
    },
    ...overrides,
  };
  return base;
}

describe('accounting readiness composition', () => {
  it('a company with everything in place is ready at 100%', () => {
    const r = composeReadiness(facts());
    expect(r.accountingReady).toBe(true);
    expect(r.status).toBe('READY');
    expect(r.progressPercent).toBe(100);
    expect(r.validation.errors).toEqual([]);
  });

  it('a brand new company has not started', () => {
    const r = composeReadiness(facts({
      calendar: { ...facts().calendar, has_year: false, has_open_year: false, current_year: null, year_count: 0, open_year_count: 0, open_years_containing_today: 0, period_count: 0, open_period_count: 0, current_period: null },
      chart: { ...facts().chart, account_count: 0, active_count: 0, missing_types: ['Asset', 'Liability', 'Equity', 'Income', 'Expense'] },
      control_accounts: { trade_debtors: false, trade_creditors: false, vat_control: false, bank: false, retained_earnings: false, profit_loss: false, inventory: false, fixed_assets: false, payroll_clearing: false },
      tax: { rate_count: 0, vat_account_count: 0 },
      banking: { bank_account_count: 0, opening_balances_posted: true },
    }));
    expect(r.status).toBe('NOT_STARTED');
    expect(r.accountingReady).toBe(false);
    expect(r.progressPercent).toBe(0);
    expect(r.validation.accountCount).toBe(0);
  });

  it('needs an open financial year', () => {
    const r = composeReadiness(facts({
      calendar: { ...facts().calendar, has_open_year: false },
    }));
    expect(r.validation.activeFinancialYear).toBe(false);
    expect(r.accountingReady).toBe(false);
    expect(r.validation.errors).toContain('Active financial year is required.');
  });

  it('needs tax configured', () => {
    const r = composeReadiness(facts({ tax: { rate_count: 0, vat_account_count: 1 } }));
    expect(r.steps.tax_configuration.complete).toBe(false);
    expect(r.accountingReady).toBe(false);
    expect(r.validation.errors).toContain('Required tax configuration is missing.');
  });

  it('names the control accounts that are missing', () => {
    const r = composeReadiness(facts({
      control_accounts: { ...facts().control_accounts, retained_earnings: false },
    }));
    expect(r.validation.missingControlAccounts).toEqual(['retained_earnings']);
    expect(r.validation.mandatoryControlAccounts).toBe(false);
    expect(r.steps.chart_of_accounts.complete).toBe(false);
    expect(r.validation.errors.join(' ')).toContain('retained_earnings');
  });

  it('asks for a stock control account only when inventory is switched on', () => {
    const off = composeReadiness(facts());
    expect(off.validation.missingControlAccounts).toEqual([]);
    expect(off.accountingReady).toBe(true);

    const on = composeReadiness(facts({
      flags: { ...facts().flags, inventory_enabled: true },
    }));
    expect(on.validation.missingControlAccounts).toEqual(['inventory']);
    expect(on.accountingReady).toBe(false);
  });

  it('accepts a payroll account mapping in place of a payroll clearing account', () => {
    const withoutMapping = composeReadiness(facts({
      flags: { ...facts().flags, payroll_enabled: true },
    }));
    expect(withoutMapping.validation.missingControlAccounts).toEqual(['payroll_clearing']);

    const withMapping = composeReadiness(facts({
      flags: { ...facts().flags, payroll_enabled: true },
      payroll: { active_mapping_count: 3 },
    }));
    expect(withMapping.validation.missingControlAccounts).toEqual([]);
  });

  it('accepts a bank account on file in place of a mapped bank control account', () => {
    const r = composeReadiness(facts({
      control_accounts: { ...facts().control_accounts, bank: false },
      banking: { bank_account_count: 2, opening_balances_posted: true },
    }));
    expect(r.validation.controlAccounts.bank).toBe(true);
    expect(r.accountingReady).toBe(true);
  });

  it('accepts banking being explicitly skipped', () => {
    const r = composeReadiness(facts({
      control_accounts: { ...facts().control_accounts, bank: false },
      banking: { bank_account_count: 0, opening_balances_posted: true },
      flags: { ...facts().flags, bank_accounts_skipped: true },
    }));
    expect(r.validation.bankAccountOrSkipped).toBe(true);
    expect(r.validation.openingBalancesComplete).toBe(true);
    expect(r.accountingReady).toBe(true);
  });

  it('turns the chart facts into the sentences the setup screen shows', () => {
    const r = composeReadiness(facts({
      chart: {
        ...facts().chart,
        missing_types: ['Equity'],
        duplicate_codes: ['1220'],
        normal_balance_errors: [{ name: 'Closing Stock', type: 'Expense', expected: 'debit' }],
      },
    }));
    expect(r.validation.coaIntegrity).toBe(false);
    expect(r.validation.coaIntegrityErrors).toContain('Missing foundational account type: Equity.');
    expect(r.validation.coaIntegrityErrors).toContain('Duplicate account code: 1220.');
    expect(r.validation.coaIntegrityErrors).toContain(
      'Closing Stock: A Expense account normally carries a debit balance.',
    );
  });

  // An unclassified legacy account is something to attend to, not a reason to
  // stop a company posting.
  it('reports unclassified accounts without revoking readiness', () => {
    const r = composeReadiness(facts({
      chart: {
        ...facts().chart,
        unclassified: [
          { id: 'a', name: 'Sundry', type: 'Asset' },
          { id: 'b', name: 'Suspense', type: 'Asset' },
        ],
      },
    }));
    expect(r.validation.accountsRequiringClassification).toBe(2);
    expect(r.validation.accountsRequiringClassificationNames).toEqual(['Sundry', 'Suspense']);
    expect(r.accountingReady).toBe(true);
  });

  // Two open years both containing today means the data itself cannot say which
  // year is current. The screens must be able to say so rather than guess.
  it('says when the financial calendar is ambiguous', () => {
    const r = composeReadiness(facts({
      calendar: { ...facts().calendar, open_year_count: 3, open_years_containing_today: 2 },
    }));
    expect(r.validation.financialYearAmbiguous).toBe(true);
    expect(r.validation.errors.join(' ')).toContain('ambiguous');
    // and it is still ready — an overlapping calendar is a correction, not a block
    expect(r.accountingReady).toBe(true);
  });

  it('carries the current financial year so every screen shows the same one', () => {
    const r = composeReadiness(facts());
    expect(r.validation.currentFinancialYear?.year_code).toBe('FY2026');
  });

  it('reports whether the ledger balances', () => {
    const r = composeReadiness(facts({
      ledger: { journal_count: 3, total_debits: 100, total_credits: 99.99, balanced: false, unbalanced_journals: [{ journal_number: 'JE-000017', drift: -0.01 }] },
    }));
    expect(r.validation.ledgerBalanced).toBe(false);
  });

  it('points at the first step that is not done', () => {
    const r = composeReadiness(facts({ tax: { rate_count: 0, vat_account_count: 0 } }));
    expect(nextIncompleteStep(r.steps)).toBe('tax_configuration');
  });

  it('progress counts completed steps, never a manual flag', () => {
    const r = composeReadiness(facts({
      tax: { rate_count: 0, vat_account_count: 0 },
      banking: { bank_account_count: 0, opening_balances_posted: true },
    }));
    // calendar + chart done; tax, banking, opening balances, validation not
    expect(r.progressPercent).toBe(33);
    expect(r.status).toBe('IN_PROGRESS');
  });
});

/**
 * The gate.
 *
 * The edge function used to ratchet readiness: a company that had ever been
 * READY stayed READY whatever its books said, while the same response carried
 * live steps that disagreed. Four companies were in that state, one of them a
 * live client with no equity account.
 *
 * Now the status is always the evaluation's, and the only thing that opens the
 * modules without complete setup is an exception that is RECORDED.
 */
describe('the readiness gate', () => {
  const incomplete = composeReadiness(facts({ tax: { rate_count: 0, vat_account_count: 0 } }));
  const complete = composeReadiness(facts());

  it('no longer ratchets: a company once READY reports its real status', () => {
    const gate = resolveReadinessGate({ status: 'READY' }, incomplete);
    expect(gate.status).toBe('IN_PROGRESS');
    expect(gate.setupComplete).toBe(false);
    expect(gate.modulesUnlocked).toBe(false);
  });

  it('opens the modules under a recorded exception, and says so', () => {
    const gate = resolveReadinessGate({
      status: 'READY',
      modules_unlocked_by_exception: true,
      exception_reason: 'Grandfathered while the books are corrected.',
      exception_granted_at: '2026-09-22T00:00:00Z',
    }, incomplete);
    expect(gate.modulesUnlocked).toBe(true);
    // the exception opens the modules; it does not make the company "ready"
    expect(gate.setupComplete).toBe(false);
    expect(gate.status).toBe('IN_PROGRESS');
    expect(gate.exception?.reason).toBe('Grandfathered while the books are corrected.');
    expect(gate.clearException).toBe(false);
  });

  it('clears the exception the first time setup is genuinely complete', () => {
    const gate = resolveReadinessGate({ status: 'IN_PROGRESS', modules_unlocked_by_exception: true }, complete);
    expect(gate.clearException).toBe(true);
    expect(gate.exception).toBeNull();
    expect(gate.modulesUnlocked).toBe(true);
    expect(gate.status).toBe('READY');
  });

  it('gates again if setup regresses after the exception has cleared', () => {
    const gate = resolveReadinessGate({ status: 'READY', modules_unlocked_by_exception: false }, incomplete);
    expect(gate.modulesUnlocked).toBe(false);
  });

  it('a complete company is READY with no exception', () => {
    const gate = resolveReadinessGate({ status: 'READY' }, complete);
    expect(gate).toEqual({
      setupComplete: true, status: 'READY', modulesUnlocked: true, exception: null, clearException: false,
    });
  });

  it('keeps an administrator lock visible as its own status', () => {
    const gate = resolveReadinessGate({ status: 'LOCKED' }, incomplete);
    expect(gate.status).toBe('LOCKED');
    expect(gate.modulesUnlocked).toBe(true);
    expect(gate.setupComplete).toBe(false);
  });
});
