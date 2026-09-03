import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ROLES,
  SINGLETON_ACCOUNT_ROLES,
  findAccountByRole,
  inferAccountRole,
  isCashEquivalentAccount,
  resolveControlAccounts,
  roleForTemplateCode,
  manuallyPostableAccounts,
} from '../../src/lib/accounting/accountRoles';

describe('accountRoles vocabulary expansion', () => {
  it('includes every role admitted by the CoA CHECK constraint expansion', () => {
    for (const role of [
      'current_year_earnings',
      'rounding',
      'exchange_gain_loss',
      'payroll_control',
      'bank',
      'cash',
      'sales',
    ] as const) {
      expect(ACCOUNT_ROLES).toContain(role);
    }
  });

  it('treats current_year_earnings and rounding as singleton roles', () => {
    expect(SINGLETON_ACCOUNT_ROLES.has('current_year_earnings')).toBe(true);
    expect(SINGLETON_ACCOUNT_ROLES.has('rounding')).toBe(true);
    expect(SINGLETON_ACCOUNT_ROLES.has('bank')).toBe(false);
    expect(SINGLETON_ACCOUNT_ROLES.has('sales')).toBe(false);
  });

  it('resolves roles from account_role without using display names', () => {
    const accounts = [
      { id: '1', name: 'Renamed AR', account_role: 'trade_receivable' as const },
      { id: '2', name: 'Operating Float', account_role: 'bank' as const, type: 'Asset' as const },
      { id: '3', name: 'Primary Revenue', account_role: 'sales' as const, type: 'Income' as const },
      { id: '4', name: 'Petty', account_role: 'cash' as const, type: 'Asset' as const },
    ];

    expect(findAccountByRole(accounts, 'trade_receivable')?.id).toBe('1');
    expect(findAccountByRole(accounts, 'bank')?.id).toBe('2');
    expect(findAccountByRole(accounts, 'sales')?.id).toBe('3');
    expect(isCashEquivalentAccount(accounts[1])).toBe(true);
    expect(isCashEquivalentAccount(accounts[3])).toBe(true);
    expect(inferAccountRole({ id: 'x', name: 'Anything', account_role: 'rounding' })).toBe('rounding');
  });

  it('maps template codes for bank, cash and sales', () => {
    expect(roleForTemplateCode('1260')).toBe('bank');
    expect(roleForTemplateCode('1270')).toBe('cash');
    expect(roleForTemplateCode('4010')).toBe('sales');
  });

  it('resolveControlAccounts returns expanded role slots', () => {
    const resolved = resolveControlAccounts([
      { id: 'ar', account_role: 'trade_receivable' },
      { id: 'sales', account_role: 'sales' },
      { id: 'bank', account_role: 'bank' },
      { id: 're', account_role: 'retained_earnings' },
      { id: 'cye', account_role: 'current_year_earnings' },
    ]);
    expect(resolved.ar?.id).toBe('ar');
    expect(resolved.sales?.id).toBe('sales');
    expect(resolved.bank?.id).toBe('bank');
    expect(resolved.retainedEarnings?.id).toBe('re');
    expect(resolved.currentYearEarnings?.id).toBe('cye');
  });
});

describe('manuallyPostableAccounts honours the database posting flags', () => {
  const account = (over: Record<string, unknown> = {}) => ({
    id: over.id as string ?? 'acc-1',
    name: 'Office Costs',
    type: 'Expense',
    account_role: null,
    is_active: true,
    ...over,
  });

  it('offers an ordinary active account', () => {
    expect(manuallyPostableAccounts([account()])).toHaveLength(1);
  });

  it('withholds an account the database blocks from posting', () => {
    expect(manuallyPostableAccounts([account({ posting_blocked: true })])).toHaveLength(0);
  });

  it('withholds an account that disallows manual posting', () => {
    expect(manuallyPostableAccounts([account({ allow_manual_posting: false })])).toHaveLength(0);
  });

  it('still offers an account when the flags are absent, so a caller that does not select those columns is unaffected', () => {
    const withoutFlags = account();
    expect('posting_blocked' in withoutFlags).toBe(false);
    expect('allow_manual_posting' in withoutFlags).toBe(false);
    expect(manuallyPostableAccounts([withoutFlags])).toHaveLength(1);
  });

  it('treats the permissive values as permissive', () => {
    expect(
      manuallyPostableAccounts([account({ posting_blocked: false, allow_manual_posting: true })]),
    ).toHaveLength(1);
  });

  it('still withholds inactive accounts', () => {
    expect(manuallyPostableAccounts([account({ is_active: false })])).toHaveLength(0);
  });

  it('still withholds module-restricted roles regardless of the flags', () => {
    const restricted = manuallyPostableAccounts([
      account({ account_role: 'accumulated_depreciation', allow_manual_posting: true }),
    ]);
    expect(restricted).toHaveLength(0);
  });

  it('filters a mixed list down to exactly the postable accounts', () => {
    const list = [
      account({ id: 'ok' }),
      account({ id: 'blocked', posting_blocked: true }),
      account({ id: 'no-manual', allow_manual_posting: false }),
      account({ id: 'inactive', is_active: false }),
    ];
    expect(manuallyPostableAccounts(list).map((a) => a.id)).toEqual(['ok']);
  });
});
