import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ROLES,
  SINGLETON_ACCOUNT_ROLES,
  findAccountByRole,
  inferAccountRole,
  isCashEquivalentAccount,
  resolveControlAccounts,
  roleForTemplateCode,
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
