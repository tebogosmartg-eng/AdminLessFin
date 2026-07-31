import { describe, it, expect } from 'vitest';
import {
  compareToGl,
  buildSubLedgerReconciliation,
  buildIdentityChecks,
  summariseReconciliation,
  RECONCILIATION_TOLERANCE,
} from '../../src/lib/accounting/subLedgerReconciliation';

describe('sub-ledger ↔ GL reconciliation control', () => {
  it('reports balanced when the sub-ledger equals the ledger', () => {
    const line = compareToGl({
      id: 'ar-gl',
      label: 'AR',
      subLedgerSource: 'ageing',
      subLedgerAmount: 12345.67,
      glSource: 'CFA receivables',
      glAmount: 12345.67,
    });
    expect(line.status).toBe('balanced');
    expect(line.variance).toBe(0);
  });

  it('exposes the difference rather than hiding or correcting it', () => {
    const line = compareToGl({
      id: 'assets-gl',
      label: 'Assets',
      subLedgerSource: 'register',
      subLedgerAmount: 100_000,
      glSource: 'GL',
      glAmount: 97_500,
    });
    expect(line.status).toBe('variance');
    expect(line.variance).toBe(2500);
    // The control must not alter either side.
    expect(line.subLedgerAmount).toBe(100_000);
    expect(line.glAmount).toBe(97_500);
  });

  it('signs the variance so direction is unambiguous', () => {
    const line = compareToGl({
      id: 'x', label: 'x', subLedgerSource: 's', glSource: 'g',
      subLedgerAmount: 90, glAmount: 100,
    });
    expect(line.variance).toBe(-10); // sub-ledger lower than the ledger
  });

  it('absorbs floating-point noise but never a real one-cent difference', () => {
    const noise = compareToGl({
      id: 'x', label: 'x', subLedgerSource: 's', glSource: 'g',
      subLedgerAmount: 0.1 + 0.2, glAmount: 0.3,
    });
    expect(noise.status).toBe('balanced');

    const realCent = compareToGl({
      id: 'y', label: 'y', subLedgerSource: 's', glSource: 'g',
      subLedgerAmount: 1000.01, glAmount: 1000.0,
    });
    expect(realCent.status).toBe('variance');
    expect(realCent.variance).toBe(0.01);
    expect(RECONCILIATION_TOLERANCE).toBeLessThan(0.01);
  });

  it('marks a missing feed unavailable, never balanced', () => {
    for (const missing of [null, undefined, NaN]) {
      const line = compareToGl({
        id: 'x', label: 'x', subLedgerSource: 's', glSource: 'g',
        subLedgerAmount: missing as number | null,
        glAmount: 500,
      });
      expect(line.status).toBe('unavailable');
      expect(line.variance).toBeNull();
    }
  });

  it('builds the full control set with explicit GL mappings', () => {
    const lines = buildSubLedgerReconciliation(
      { cash: 50_000, receivables: 20_000, payables: 8_000, vatNet: 1_500, fixedAssetsControl: 300_000, netCashFlow: 4_000 },
      { bankBalance: 50_000, arBalance: 20_000, apBalance: 8_000, vatBalance: 1_500, assetsNetBookValue: 300_000, cashFlowMovement: 4_000 },
    );
    const ids = lines.map((l) => l.id);
    expect(ids).toEqual([
      'bank-gl', 'ar-gl', 'ap-gl', 'vat-gl', 'assets-gl', 'inventory-gl', 'payroll-gl', 'cash-cashflow',
    ]);
    expect(lines.filter((l) => l.status === 'balanced')).toHaveLength(6);
  });

  it('does not report success when nothing could be evaluated', () => {
    const lines = buildSubLedgerReconciliation(null, null);
    const summary = summariseReconciliation(lines);
    expect(summary.unavailable).toBe(lines.length);
    // Every control unavailable must NOT read as a pass.
    expect(summary.allBalanced).toBe(false);
  });

  it('summarises counts and the largest variance', () => {
    const lines = buildSubLedgerReconciliation(
      { cash: 100, receivables: 200, payables: 300 },
      { bankBalance: 100, arBalance: 250, apBalance: 300 },
    );
    const summary = summariseReconciliation(lines);
    expect(summary.balanced).toBe(2);
    expect(summary.variance).toBe(1);
    expect(summary.largestVariance).toBe(50);
    expect(summary.allBalanced).toBe(false);
  });

  it('surfaces canonical identities without recomputing them', () => {
    const checks = buildIdentityChecks({
      trialBalanceBalanced: true,
      balanceSheetBalanced: false,
      profitIdentityHolds: true,
      equityIdentityHolds: null,
      totalDebits: 1000,
      totalCredits: 1000,
      totalAssets: 500,
      totalLiabilitiesAndEquity: 480,
    });
    expect(checks.map((c) => c.holds)).toEqual([true, false, true, null]);
    expect(checks[0].detail).toContain('1000.00');
    expect(checks[1].detail).toContain('480.00');
  });

  it('reports unknown identities as null rather than assuming they hold', () => {
    const checks = buildIdentityChecks(null);
    expect(checks.every((c) => c.holds === null)).toBe(true);
  });
});

describe('control-account discipline', () => {
  it('never compares the asset register against total assets', () => {
    // Total assets includes cash, receivables and inventory. Comparing an asset
    // register against it reports a large variance whenever the company simply
    // owns anything else — a false alarm, not a control. Without an explicit
    // fixed-asset control balance the line must read "not available".
    const lines = buildSubLedgerReconciliation(
      { cash: 10_000, receivables: 20_000 },
      { assetsNetBookValue: 4_916.67 },
    );
    const assets = lines.find((l) => l.id === 'assets-gl')!;
    expect(assets.status).toBe('unavailable');
    expect(assets.glAmount).toBeNull();
  });

  it('evaluates the asset control when a real control balance is supplied', () => {
    const lines = buildSubLedgerReconciliation(
      { fixedAssetsControl: 5_000 },
      { assetsNetBookValue: 4_916.67 },
    );
    const assets = lines.find((l) => l.id === 'assets-gl')!;
    expect(assets.status).toBe('variance');
    expect(assets.variance).toBe(-83.33);
  });
});
