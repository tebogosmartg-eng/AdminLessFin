/**
 * The shared statement computation used by the customers function, the vendors
 * function and the statement email.
 *
 * The first test is the defect itself. Summing every line of a balanced journal
 * gives zero, and that is what all three copies did for the opening balance --
 * so every statement, including the ones emailed to customers, opened at 0.00.
 */
import { describe, it, expect } from 'vitest';
import {
  buildStatementRows,
  closingBalance,
  controlAccountFilter,
  controlMovement,
  describeClosing,
} from '../../supabase/functions/_shared/partyStatement';

const AR = 'acc-ar';
const AP = 'acc-ap';
const SALES = 'acc-sales';
const VAT = 'acc-vat';
const BANK = 'acc-bank';
const EXPENSE = 'acc-expense';

/** A sale of 1000 + 150 VAT: balanced, as every posted journal is. */
const sale = [
  { account_id: AR, type: 'debit', amount: 1150 },
  { account_id: SALES, type: 'credit', amount: 1000 },
  { account_id: VAT, type: 'credit', amount: 150 },
];
const receipt = [
  { account_id: BANK, type: 'debit', amount: 400 },
  { account_id: AR, type: 'credit', amount: 400 },
];
const bill = [
  { account_id: EXPENSE, type: 'debit', amount: 870 },
  { account_id: VAT, type: 'debit', amount: 130 },
  { account_id: AP, type: 'credit', amount: 1000 },
];
const supplierPayment = [
  { account_id: AP, type: 'debit', amount: 300 },
  { account_id: BANK, type: 'credit', amount: 300 },
];

describe('the defect', () => {
  it('summing every line of balanced journals always gives zero', () => {
    // What all three copies did. Kept as a test so the reason for the rule
    // below is written down where the rule is enforced.
    const everyLine = [...sale, ...receipt].reduce(
      (t, i) => t + (i.type === 'debit' ? i.amount : -i.amount), 0,
    );
    expect(everyLine).toBe(0);
  });

  it('counting only the control account gives what the customer actually owes', () => {
    expect(controlMovement([...sale, ...receipt], new Set([AR]), 'receivable')).toBe(750);
  });
});

describe('controlMovement', () => {
  it('raises a receivable on a debit and lowers it on a credit', () => {
    expect(controlMovement(sale, new Set([AR]), 'receivable')).toBe(1150);
    expect(controlMovement(receipt, new Set([AR]), 'receivable')).toBe(-400);
  });

  it('raises a payable on a credit and lowers it on a debit', () => {
    expect(controlMovement(bill, new Set([AP]), 'payable')).toBe(1000);
    expect(controlMovement(supplierPayment, new Set([AP]), 'payable')).toBe(-300);
  });

  it('ignores every account that is not a control account', () => {
    expect(controlMovement(sale, new Set([AP]), 'payable')).toBe(0);
  });

  it('counts every control account when a company has more than one', () => {
    const twoControls = [
      { account_id: AR, type: 'debit', amount: 100 },
      { account_id: 'acc-ar-2', type: 'debit', amount: 50 },
      { account_id: SALES, type: 'credit', amount: 150 },
    ];
    expect(controlMovement(twoControls, new Set([AR, 'acc-ar-2']), 'receivable')).toBe(150);
  });

  it('accepts amounts as strings, the way numeric columns can arrive', () => {
    expect(controlMovement([{ account_id: AR, type: 'debit', amount: '99.99' }], new Set([AR]), 'receivable')).toBe(99.99);
  });

  it('rounds to the cent rather than carrying float drift', () => {
    const drift = [
      { account_id: AR, type: 'debit', amount: 0.1 },
      { account_id: AR, type: 'debit', amount: 0.2 },
    ];
    expect(controlMovement(drift, new Set([AR]), 'receivable')).toBe(0.3);
  });

  it('is zero for no lines at all', () => {
    expect(controlMovement(null, new Set([AR]), 'receivable')).toBe(0);
    expect(controlMovement([], new Set([AR]), 'receivable')).toBe(0);
  });
});

describe('buildStatementRows', () => {
  const journals = [
    { id: 'j1', entry_date: '2026-09-01', description: 'Invoice INV-1', journal_entry_items: sale },
    { id: 'j2', entry_date: '2026-09-05', description: 'Receipt', journal_entry_items: receipt },
    // Tagged to the customer but never touched receivables -- e.g. a cost
    // recharge journal. It did not move the balance.
    {
      id: 'j3', entry_date: '2026-09-06', description: 'Internal reclass',
      journal_entry_items: [
        { account_id: SALES, type: 'debit', amount: 10 },
        { account_id: 'acc-other', type: 'credit', amount: 10 },
      ],
    },
  ];

  it('lists only journals that moved the control account', () => {
    const rows = buildStatementRows(journals, new Set([AR]), 'receivable', () => ({}));
    expect(rows.map((r) => r.id)).toEqual(['j1', 'j2']);
  });

  it('classifies by the net movement, not the gross debits', () => {
    const rows = buildStatementRows(journals, new Set([AR]), 'receivable', () => ({}));
    expect(rows.map((r) => [r.type, r.amount])).toEqual([['invoice', 1150], ['payment', 400]]);
  });

  it('never labels a non-control journal a payment', () => {
    // The old fallback compared all debits with all credits -- two equal
    // numbers -- and so called every such journal a payment.
    const rows = buildStatementRows([journals[2]], new Set([AR]), 'receivable', () => ({}));
    expect(rows).toEqual([]);
  });

  it('resolves a journal that raises and settles to the one movement it made', () => {
    const both = [{
      id: 'j4', entry_date: '2026-09-07', description: 'Invoice and part payment',
      journal_entry_items: [
        { account_id: AR, type: 'debit', amount: 500 },
        { account_id: AR, type: 'credit', amount: 200 },
        { account_id: SALES, type: 'credit', amount: 500 },
        { account_id: BANK, type: 'debit', amount: 200 },
      ],
    }];
    const rows = buildStatementRows(both, new Set([AR]), 'receivable', () => ({}));
    expect(rows.map((r) => [r.type, r.amount])).toEqual([['invoice', 300]]);
  });

  it('calls a raising movement a bill on the supplier side', () => {
    const rows = buildStatementRows(
      [
        { id: 'b1', entry_date: '2026-09-01', description: 'Bill', journal_entry_items: bill },
        { id: 'b2', entry_date: '2026-09-02', description: 'Payment', journal_entry_items: supplierPayment },
      ],
      new Set([AP]), 'payable', () => ({}),
    );
    expect(rows.map((r) => [r.type, r.amount])).toEqual([['bill', 1000], ['payment', 300]]);
  });

  it('carries the caller-supplied reference fields through', () => {
    const rows = buildStatementRows(journals, new Set([AR]), 'receivable', (t) => ({ ref: 'REF-' + t.id }));
    expect(rows[0]).toMatchObject({ id: 'j1', ref: 'REF-j1', date: '2026-09-01', description: 'Invoice INV-1' });
  });
});

describe('closingBalance', () => {
  it('adds charges and subtracts payments from the opening balance', () => {
    expect(closingBalance(100, [
      { type: 'invoice', amount: 1150 },
      { type: 'payment', amount: 400 },
    ])).toBe(850);
  });

  it('works the same way round on the supplier side', () => {
    expect(closingBalance(0, [{ type: 'bill', amount: 1000 }, { type: 'payment', amount: 300 }])).toBe(700);
  });

  it('holds the opening balance when nothing moved', () => {
    expect(closingBalance(-238826.72, [])).toBe(-238826.72);
  });
});

describe('describeClosing', () => {
  it('asks for the balance due when one is owed', () => {
    expect(describeClosing('receivable', 850, true).label).toBe('Balance due');
  });

  it('never headlines a credit balance as due', () => {
    expect(describeClosing('receivable', -150, true)).toEqual({
      label: 'In credit',
      wording: 'This account is in credit. No payment is due.',
    });
  });

  it('says nothing is outstanding at zero', () => {
    expect(describeClosing('payable', 0, true).label).toBe('Nothing outstanding');
  });

  it('does not name a balance it could not derive', () => {
    expect(describeClosing('receivable', 0, false).label).toBe('Balance');
    expect(describeClosing('receivable', 0, false).wording).toMatch(/cannot be stated/);
  });
});

describe('controlAccountFilter', () => {
  it('finds receivables on the asset side and payables on the liability side', () => {
    expect(controlAccountFilter('receivable')).toEqual({ type: 'Asset', account_role: 'trade_receivable' });
    expect(controlAccountFilter('payable')).toEqual({ type: 'Liability', account_role: 'trade_payable' });
  });
});
