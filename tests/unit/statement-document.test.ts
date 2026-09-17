/**
 * The statement of account model.
 *
 * The defect this follows: both statements opened at 0.00 whatever the party
 * owed, because the edge function summed every journal line rather than the
 * control-account lines and a balanced journal nets to zero. The running
 * balance and closing balance on every statement ever emailed were wrong.
 *
 * These tests pin the arithmetic a reader checks by hand -- brought forward,
 * each movement, the balance after it -- and the refusal to quietly paper over
 * a closing balance that does not match.
 */
import { describe, it, expect } from 'vitest';
import {
  buildStatementDocument,
  closingWording,
  headlineLabel,
  type RawStatementDocument,
} from '@/lib/statements/statementDocument';

function receivable(overrides: Partial<RawStatementDocument> = {}): RawStatementDocument {
  return {
    side: 'receivable',
    party: { name: 'Meat and Veg' },
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
    opening_balance: 500,
    closing_balance: 700,
    opening_balance_known: true,
    statement: [
      { date: '2026-09-05', description: 'Invoice INV-1', invoice_number: 'INV-1', type: 'invoice', amount: 400 },
      { date: '2026-09-20', description: 'Payment received', type: 'payment', amount: 200 },
    ],
    company: { name: 'Spaceman' },
    ...overrides,
  };
}

function payable(overrides: Partial<RawStatementDocument> = {}): RawStatementDocument {
  return {
    side: 'payable',
    party: { name: 'Acme Supplies' },
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
    opening_balance: 1000,
    closing_balance: 1300,
    opening_balance_known: true,
    statement: [
      { date: '2026-09-05', description: 'Bill BIL-1', bill_number: 'BIL-1', type: 'bill', amount: 500 },
      { date: '2026-09-20', description: 'Payment made', type: 'payment', amount: 200 },
    ],
    company: { name: 'Spaceman' },
    ...overrides,
  };
}

describe('the running balance', () => {
  it('starts at the brought-forward balance, not at zero', () => {
    const doc = buildStatementDocument(receivable());
    expect(doc.openingBalance).toBe(500);
    expect(doc.lines[0].balance).toBe(900);
  });

  it('accumulates through every movement to the closing balance', () => {
    const doc = buildStatementDocument(receivable());
    expect(doc.lines.map((l) => l.balance)).toEqual([900, 700]);
    expect(doc.closingBalance).toBe(700);
    expect(doc.reconciles).toBe(true);
  });

  it('runs the other way on the supplier side', () => {
    // A bill increases what we owe; a payment reduces it.
    const doc = buildStatementDocument(payable());
    expect(doc.lines.map((l) => l.direction)).toEqual(['charge', 'credit']);
    expect(doc.lines.map((l) => l.balance)).toEqual([1500, 1300]);
    expect(doc.closingBalance).toBe(1300);
  });

  it('totals the charges and the credits separately', () => {
    const doc = buildStatementDocument(receivable());
    expect(doc.totalCharges).toBe(400);
    expect(doc.totalCredits).toBe(200);
  });

  it('holds the opening balance when nothing moved in the period', () => {
    const doc = buildStatementDocument(
      receivable({ statement: [], closing_balance: 500 }),
    );
    expect(doc.lines).toEqual([]);
    expect(doc.closingBalance).toBe(500);
    expect(doc.reconciles).toBe(true);
  });

  it('carries a negative opening balance through, rather than flooring it at zero', () => {
    // The real case: a customer whose control account stood at -238 826,72.
    const doc = buildStatementDocument(
      receivable({
        opening_balance: -238826.72,
        closing_balance: -238426.72,
        statement: [{ date: '2026-09-05', description: 'Invoice', type: 'invoice', amount: 400 }],
      }),
    );
    expect(doc.openingBalance).toBe(-238826.72);
    expect(doc.lines[0].balance).toBe(-238426.72);
    expect(doc.reconciles).toBe(true);
  });

  it('rounds to the cent at every step rather than accumulating float drift', () => {
    const doc = buildStatementDocument(
      receivable({
        opening_balance: 0.1,
        closing_balance: 0.3,
        statement: [
          { date: '2026-09-05', description: 'A', type: 'invoice', amount: 0.1 },
          { date: '2026-09-06', description: 'B', type: 'invoice', amount: 0.1 },
        ],
      }),
    );
    expect(doc.lines.map((l) => l.balance)).toEqual([0.2, 0.3]);
    expect(doc.reconciles).toBe(true);
  });
});

describe('when the statement does not add up', () => {
  it('says so rather than quietly adopting one figure', () => {
    // The ledger says the account closes at 999; the movements shown reach 700.
    const doc = buildStatementDocument(receivable({ closing_balance: 999 }));
    expect(doc.closingBalance).toBe(999);
    expect(doc.reconciles).toBe(false);
  });

  it('falls back to the accumulated balance when the server states none', () => {
    const doc = buildStatementDocument(receivable({ closing_balance: null }));
    expect(doc.closingBalance).toBe(700);
    expect(doc.reconciles).toBe(true);
  });

  it('reports a balance it cannot derive as unknown, not as zero', () => {
    const doc = buildStatementDocument(
      receivable({ opening_balance: 0, closing_balance: 0, opening_balance_known: false, statement: [] }),
    );
    expect(doc.balanceKnown).toBe(false);
    expect(closingWording(doc)).toMatch(/no trade receivable control account/i);
  });
});

describe('what the closing balance means in words', () => {
  it('asks for settlement when something is owed', () => {
    expect(closingWording(buildStatementDocument(receivable()))).toMatch(/settle the balance due/i);
  });

  it('says nothing is outstanding at zero', () => {
    const doc = buildStatementDocument(receivable({ closing_balance: 0, statement: [] , opening_balance: 0 }));
    expect(closingWording(doc)).toBe('Nothing is outstanding on this account.');
  });

  it('does not chase a customer who is in credit', () => {
    const doc = buildStatementDocument(receivable({ closing_balance: -150 }));
    expect(closingWording(doc)).toMatch(/in credit. No payment is due/i);
  });

  it('never asks a supplier to pay us', () => {
    const doc = buildStatementDocument(payable());
    expect(closingWording(doc)).toMatch(/owed by us to the supplier/i);
    expect(doc.banking).toBeNull();
  });
});

describe('what the headline figure is called', () => {
  it('asks for the balance due when one is owed', () => {
    expect(headlineLabel(buildStatementDocument(receivable()))).toBe('Balance due');
  });

  it('never headlines a credit balance as due', () => {
    // "Balance due" over a credit balance asks for money the customer does not
    // owe, which is the one thing a statement must never do.
    expect(headlineLabel(buildStatementDocument(receivable({ closing_balance: -150 })))).toBe('In credit');
  });

  it('says nothing is outstanding at zero', () => {
    const doc = buildStatementDocument(receivable({ opening_balance: 0, closing_balance: 0, statement: [] }));
    expect(headlineLabel(doc)).toBe('Nothing outstanding');
  });

  it('calls a supplier account in debit what it is', () => {
    expect(headlineLabel(buildStatementDocument(payable({ closing_balance: -20 })))).toBe('In debit');
  });

  it('does not name a figure it could not derive', () => {
    const doc = buildStatementDocument(receivable({ opening_balance_known: false }));
    expect(headlineLabel(doc)).toBe('Balance');
  });
});

describe('presentation', () => {
  it('uses the invoice or bill number as the reference, else a dash', () => {
    const doc = buildStatementDocument(receivable());
    expect(doc.lines.map((l) => l.reference)).toEqual(['INV-1', '-']);
  });

  it('quotes a credit note by its own number, and never calls it a payment', () => {
    // A credit note's journal is not FOR an invoice, so without its own number
    // the row had no reference, and a blank description read "Payment received".
    const doc = buildStatementDocument(
      receivable({
        statement: [
          { date: '2026-09-05', description: 'Invoice INV-1', invoice_number: 'INV-1', type: 'invoice', amount: 400 },
          { date: '2026-09-08', description: null, credit_note_number: 'CN-00001', type: 'payment', amount: 200 },
        ],
      }),
    );
    expect(doc.lines[1].reference).toBe('CN-00001');
    expect(doc.lines[1].description).toBe('Credit note');
    expect(doc.lines[1].direction).toBe('credit');
  });

  it('heads the receivable credit column for payments and credit notes alike', () => {
    expect(buildStatementDocument(receivable()).wording.creditColumn).toBe('Credits');
    expect(buildStatementDocument(payable()).wording.creditColumn).toBe('Paid');
  });

  it('never leaves a description blank', () => {
    const doc = buildStatementDocument(
      receivable({
        statement: [
          { date: '2026-09-05', description: null, type: 'invoice', amount: 10 },
          { date: '2026-09-06', description: '   ', type: 'payment', amount: 5 },
        ],
        closing_balance: 505,
      }),
    );
    expect(doc.lines[0].description).toBe('Charge');
    expect(doc.lines[1].description).toBe('Payment received');
  });

  it('gives each side its own wording', () => {
    expect(buildStatementDocument(receivable()).wording.chargeColumn).toBe('Invoiced');
    expect(buildStatementDocument(payable()).wording.chargeColumn).toBe('Billed');
    expect(buildStatementDocument(payable()).wording.title).toBe('SUPPLIER STATEMENT');
  });

  it('carries the ageing when the caller supplied it, and null when not', () => {
    expect(buildStatementDocument(receivable()).ageing).toBeNull();
    const aged = buildStatementDocument(payable({ ageing: { current: 100, total: 100 } }));
    expect(aged.ageing).toMatchObject({ current: 100, days_1_30: 0, total: 100 });
  });
});
