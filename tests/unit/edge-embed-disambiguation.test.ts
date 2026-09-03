import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards PostgREST embeds in the edge functions against relationship ambiguity.
 *
 * journal_entries reaches invoices by two different foreign keys — its own
 * `invoice_id`, and the invoice's `journal_entry_id` — and the same is true of
 * bills. PostgREST refuses an embed that does not say which one it means, and
 * the refusal is a 500 at runtime. This is invisible to ordinary tests: the
 * query string is valid TypeScript, and only the database knows the schema.
 *
 * It shipped that way. `customers` GET_DETAILS returned a 500 for every
 * customer in every company, and the page rendered it as "Customer not found.";
 * `calendar-events` dropped every invoice and bill; `send-invoice-email` and
 * `send-statement-email` failed or emailed an empty statement, because neither
 * checked the error.
 *
 * A source-level assertion is the right shape here. The runtime check needs a
 * live database (tools/staging-recovery/probe-embed-shapes.ts validates every
 * static select against the real schema); this one costs nothing and runs on
 * every commit.
 */

const FUNCTIONS_DIR = path.join(process.cwd(), 'supabase/functions');

/** Table pairs joined by more than one foreign key, so an embed must name one. */
const AMBIGUOUS: Record<string, string[]> = {
  journal_entries: ['invoices', 'bills'],
  invoices: ['journal_entries'],
  bills: ['journal_entries'],
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

type StaticSelect = { file: string; table: string; select: string };

/** Every `.from('table').…select(<literal>)` in the edge functions. */
function staticSelects(): StaticSelect[] {
  const found: StaticSelect[] = [];
  for (const file of sourceFiles(FUNCTIONS_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /\.from\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)\s*(?:\.[A-Za-z]+\([^)]*\)\s*)*?\.select\(\s*([`'"])([\s\S]*?)\2/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(src))) {
      found.push({
        file: path.relative(process.cwd(), file).split(path.sep).join('/'),
        table: match[1],
        select: match[3],
      });
    }
  }
  return found;
}

describe('edge function PostgREST embeds', () => {
  it('finds the select statements to check', () => {
    expect(staticSelects().length).toBeGreaterThan(100);
  });

  it('names the foreign key whenever two tables are joined by more than one', () => {
    const offenders: string[] = [];
    for (const { file, table, select } of staticSelects()) {
      for (const child of AMBIGUOUS[table] ?? []) {
        // An embed of `child` that is not immediately preceded by `!<hint>`.
        const bare = new RegExp('(?<![!\\w])' + child + '\\s*\\(');
        if (bare.test(select)) {
          offenders.push(`${file}: from('${table}') embeds '${child}' without naming the foreign key`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the disambiguated embeds that replaced them', () => {
    const read = (p: string) => fs.readFileSync(path.join(FUNCTIONS_DIR, p), 'utf8');
    // The forward key: the invoice a journal is FOR, matching the invoice_id the
    // statement row already returns.
    expect(read('customers/index.ts')).toContain('invoices!invoice_id ( invoice_number )');
    expect(read('send-statement-email/index.ts')).toContain('invoices!invoice_id(invoice_number)');
    expect(read('send-statement-email/index.ts')).toContain('bills!bill_id(bill_number)');
    // The reverse key: a document's own posting journal, which excludes the
    // void-reversal entries that would otherwise double-count.
    expect(read('calendar-events/index.ts')).toContain('journal_entries!journal_entry_id(');
    expect(read('send-invoice-email/index.ts')).toContain('journal_entries!journal_entry_id (');
  });

  it('checks the error on the reads whose failure would otherwise be silent', () => {
    const statement = fs.readFileSync(path.join(FUNCTIONS_DIR, 'send-statement-email/index.ts'), 'utf8');
    expect(statement).toContain('if (transactionsError) throw transactionsError;');
    expect(statement).toContain('if (openingError) throw openingError;');

    const calendar = fs.readFileSync(path.join(FUNCTIONS_DIR, 'calendar-events/index.ts'), 'utf8');
    expect(calendar).toContain('for the calendar:');

    const work = fs.readFileSync(path.join(FUNCTIONS_DIR, 'work/index.ts'), 'utf8');
    expect(work).toContain('if (jeiError) throw jeiError;');
  });
});
