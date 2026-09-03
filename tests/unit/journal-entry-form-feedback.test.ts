import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the feedback wiring in the Journal Entry form.
 *
 * These are source-level assertions on purpose. The defect they protect against
 * is not a wrong result — it is MISSING wiring, which produces no output at all
 * and therefore cannot be observed by asserting on a rendered value. It has
 * already regressed once: an edit that restructured the dialog layout dropped
 * the onInvalid argument from handleSubmit, and pressing Save on an unbalanced
 * entry went back to doing nothing whatsoever.
 */
const SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/components/JournalEntryForm.tsx'),
  'utf-8',
);

describe('Journal Entry form — a refused save must say why', () => {
  it('passes an onInvalid handler to handleSubmit', () => {
    // react-hook-form aborts a failed submit silently. Without the second
    // argument the user gets no reaction at all to pressing Save.
    expect(SOURCE).toMatch(/form\.handleSubmit\(\s*onSubmit\s*,\s*onInvalid\s*\)/);
  });

  it('reports an out-of-balance entry explicitly, naming both totals', () => {
    expect(SOURCE).toContain('does not balance');
    expect(SOURCE).toMatch(/more debit than credit/);
    expect(SOURCE).toMatch(/more credit than debit/);
  });

  it('derives the balance state from the live totals, not from the error tree', () => {
    // The schema reports the imbalance at path ["items"], but `items` is a
    // useFieldArray and react-hook-form re-files array-level errors, so reading
    // errors.items.message was unreliable and silently rendered nothing.
    expect(SOURCE).toMatch(/const\s+differenceCents\s*=/);
    expect(SOURCE).toMatch(/const\s+isOutOfBalance\s*=/);
  });

  it('checks the balance first in onInvalid, before the per-field branches', () => {
    const onInvalidStart = SOURCE.indexOf('const onInvalid');
    expect(onInvalidStart).toBeGreaterThan(-1);
    const body = SOURCE.slice(onInvalidStart, onInvalidStart + 900);
    const balanceCheck = body.indexOf('balanceBlocksSave');
    const itemBranch = body.indexOf('errors.items');
    expect(balanceCheck).toBeGreaterThan(-1);
    expect(itemBranch).toBeGreaterThan(-1);
    expect(balanceCheck).toBeLessThan(itemBranch);
  });

  it('shows the imbalance on screen as well as in a toast', () => {
    // A toast is dismissible and time-limited; the inline warning is what the
    // user still sees while they correct the amounts.
    expect(SOURCE).toMatch(/isOutOfBalance\s*&&\s*hasAnyAmount/);
    expect(SOURCE).toContain('role="alert"');
  });

  it('renders a FormMessage for every line-item field', () => {
    // Without these, a missing account or a zero amount fails validation with
    // nothing shown against the offending line.
    for (const field of ['items.${index}.account_id', 'items.${index}.type', 'items.${index}.amount']) {
      const at = SOURCE.indexOf(`name={\`${field}\`}`);
      expect(at, `${field} field not found`).toBeGreaterThan(-1);
      const block = SOURCE.slice(at, at + 700);
      expect(block, `${field} renders no <FormMessage />`).toContain('<FormMessage />');
    }
  });

  it('requires debits to equal credits exactly, in whole cents', () => {
    // A float tolerance would let the form accept an entry that
    // posting_engine_submit then refuses, which reads as "it will not save".
    expect(SOURCE).toMatch(/debitCents\s*===\s*creditCents/);
    expect(SOURCE).not.toMatch(/Math\.abs\(debits\s*-\s*credits\)\s*<\s*0\./);
  });
});
