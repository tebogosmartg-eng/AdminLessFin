/**
 * RB-005 REGRESSION VAULT — no US month-first date format on an en-ZA product.
 *
 * The customer statement rendered dates as `MM/dd/yyyy`, which is ambiguous and
 * wrong for South African users and inconsistent with the app-wide `dd MMM yyyy`.
 * This static guard fails if any `MM/dd/yyyy` (or `MM-dd-yyyy`) format literal
 * reappears anywhere under src/.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname, '../../src');
const US_DATE = /['"`]MM[/-]dd[/-]yyyy['"`]/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

describe('RB-005 — no US date format literals', () => {
  it('has no MM/dd/yyyy (or MM-dd-yyyy) format strings under src/', () => {
    const offenders = walk(SRC).filter((f) => US_DATE.test(readFileSync(f, 'utf8')));
    expect(offenders, `US date format found in:\n${offenders.join('\n')}`).toEqual([]);
  });
});
