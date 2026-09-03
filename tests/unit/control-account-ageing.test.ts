import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AGEING_BUCKETS,
  bucketForDaysOverdue,
  bucketTotal,
  daysOverdue,
  emptyBuckets,
  round2,
} from '../../supabase/functions/_shared/controlAccountAgeing.ts';

describe('creditors ageing — bucket boundaries', () => {
  it('treats a bill that is not yet due as current, including on its due date', () => {
    expect(bucketForDaysOverdue(-30)).toBe('current');
    expect(bucketForDaysOverdue(0)).toBe('current');
  });

  it('places each day on the correct side of every boundary', () => {
    expect(bucketForDaysOverdue(1)).toBe('days_1_30');
    expect(bucketForDaysOverdue(30)).toBe('days_1_30');
    expect(bucketForDaysOverdue(31)).toBe('days_31_60');
    expect(bucketForDaysOverdue(60)).toBe('days_31_60');
    expect(bucketForDaysOverdue(61)).toBe('days_61_90');
    expect(bucketForDaysOverdue(90)).toBe('days_61_90');
    expect(bucketForDaysOverdue(91)).toBe('days_120_plus');
    expect(bucketForDaysOverdue(4000)).toBe('days_120_plus');
  });

  it('labels the final bucket by what it actually holds', () => {
    // The KEY stays days_120_plus because the per-supplier statement, its PDF
    // and the stored evidence already use it; the label must still be honest.
    const last = AGEING_BUCKETS[AGEING_BUCKETS.length - 1];
    expect(last.key).toBe('days_120_plus');
    expect(last.label).toBe('90+ days');
  });

  it('exposes the five buckets in ageing order', () => {
    expect(AGEING_BUCKETS.map((b) => b.key)).toEqual([
      'current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_120_plus',
    ]);
  });
});

describe('creditors ageing — day counting', () => {
  it('counts whole days from the due date to the reporting date', () => {
    expect(daysOverdue('2026-09-03', '2026-09-03')).toBe(0);
    expect(daysOverdue('2026-09-03', '2026-09-02')).toBe(1);
    expect(daysOverdue('2026-09-03', '2026-08-04')).toBe(30);
    expect(daysOverdue('2026-09-03', '2026-10-03')).toBe(-30);
  });

  it('treats a missing due date as current rather than guessing', () => {
    expect(daysOverdue('2026-09-03', null)).toBe(0);
    expect(bucketForDaysOverdue(daysOverdue('2026-09-03', null))).toBe('current');
  });
});

describe('creditors ageing — arithmetic', () => {
  it('totals the buckets', () => {
    const b = emptyBuckets();
    b.current = 100.5;
    b.days_1_30 = 20.25;
    b.days_120_plus = 9.25;
    expect(round2(bucketTotal(b))).toBe(130);
  });

  it('rounds to cents', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1234.5649)).toBe(1234.56);
  });
});

describe('creditors ageing — the reconciliation is not optional', () => {
  const SOURCE = fs.readFileSync(
    path.join(process.cwd(), 'supabase/functions/_shared/controlAccountAgeing.ts'),
    'utf-8',
  );

  it('reports movements that are not open bills, rather than hiding them', () => {
    // An age analysis ages OPEN BILLS. The control account can also hold
    // payments on account, credit notes and direct journals. Presenting the
    // aged total as the creditors balance would be wrong by construction.
    expect(SOURCE).toContain('unallocated_to_parties');
    expect(SOURCE).toContain('unattributed_to_any_party');
    expect(SOURCE).toContain('general_ledger_control_balance');
    expect(SOURCE).toContain('variance');
  });

  it('identifies the control account by role, never by display name', () => {
    expect(SOURCE).toContain("accountRole: 'trade_payable'");
    expect(SOURCE).toContain("accountRole: 'trade_receivable'");
    expect(SOURCE).toContain("'account_role', spec.accountRole");
    expect(SOURCE).not.toMatch(/name.*ilike.*(payable|receivable)/i);
  });

  it('ages both sides from one algorithm, so they cannot drift apart', () => {
    // Creditors and debtors differ only in the account role, which entry side
    // increases the balance, and which document and party tables to read.
    expect(SOURCE).toMatch(/computeControlAgeAnalysis/);
    expect(SOURCE).toMatch(/computeApAgeAnalysis[\s\S]{0,120}'payable'/);
    expect(SOURCE).toMatch(/computeArAgeAnalysis[\s\S]{0,120}'receivable'/);
    expect(SOURCE).toContain("increasesOn: 'credit'");
    expect(SOURCE).toContain("increasesOn: 'debit'");
  });

  it('excludes voided and paid bills from the analysis', () => {
    expect(SOURCE).toContain('("void","paid")');
  });

  it('pages every read, so a large company cannot be silently truncated', () => {
    // PostgREST caps a response at 1000 rows without saying so; an unpaged read
    // would report a wrong creditors balance rather than an error.
    expect(SOURCE).toMatch(/const PAGE = 1000/);
    expect(SOURCE).toMatch(/readAll</);
  });
});
