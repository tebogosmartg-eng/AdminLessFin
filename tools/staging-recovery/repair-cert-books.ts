/**
 * CERT TX book completion — every entry goes through the journal-entries edge
 * function (posting_engine_submit, module manual_journal), the same gateway
 * the product uses. Each entry is guarded by its description: run twice and
 * nothing double-posts.
 *
 *   npx tsx tools/staging-recovery/repair-cert-books.ts [--dry]
 */
import { connect, invoke } from './edgeProbe';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';

type Line = { account: string; debit?: number; credit?: number };
type Entry = { date: string; description: string; lines: Line[] };

const ENTRIES: Entry[] = [
  {
    date: '2025-12-31',
    description: 'Interest received on current account for the year ended 31 December 2025',
    lines: [
      { account: 'Bank - Current Account', debit: 4_100 },
      { account: 'Interest Income', credit: 4_100 },
    ],
  },
  {
    date: '2026-12-31',
    description: 'Interest received on current account for the year ended 31 December 2026',
    lines: [
      { account: 'Bank - Current Account', debit: 18_350 },
      { account: 'Interest Income', credit: 18_350 },
    ],
  },
  // The seeded "suppliers paid" entries debited Accrued Expenses for accruals
  // that were never raised (the intended cost-of-sales accruals were refused —
  // the Purchases account is sub-ledger controlled). The cash genuinely left
  // the bank; these corrections recognise those payments as the distributions
  // they effectively were, clearing the hanging debit on Accrued Expenses.
  {
    date: '2025-12-31',
    description:
      'Correction — payment of 30 November 2025 recorded against an accrual never raised; recognised as a distribution to the shareholder',
    lines: [
      { account: 'Drawings / Dividends', debit: 640_000 },
      { account: 'Accrued Expenses', credit: 640_000 },
    ],
  },
  {
    date: '2026-12-31',
    description:
      'Correction — payment of 15 November 2026 recorded against an accrual never raised; recognised as a distribution to the shareholder',
    lines: [
      { account: 'Drawings / Dividends', debit: 1_180_000 },
      { account: 'Accrued Expenses', credit: 1_180_000 },
    ],
  },
];

async function main() {
  const dry = process.argv.includes('--dry');
  const { supabase } = await connect('x');

  const { data: accounts, error } = await supabase
    .from('chart_of_accounts')
    .select('id, name')
    .eq('company_id', COMPANY);
  if (error) throw error;
  const byName = new Map((accounts ?? []).map((a) => [String(a.name).trim().toLowerCase(), a]));

  const { data: existing } = await supabase
    .from('journal_entries')
    .select('description')
    .eq('company_id', COMPANY);
  const already = new Set((existing ?? []).map((j) => String(j.description ?? '')));

  for (const entry of ENTRIES) {
    if (already.has(entry.description)) {
      console.log(`skip (already posted)  ${entry.description.slice(0, 60)}`);
      continue;
    }
    const items = entry.lines.map((l) => {
      const account = byName.get(l.account.trim().toLowerCase());
      if (!account) throw new Error(`Account not in chart: ${l.account}`);
      return { account_id: account.id, type: l.debit ? 'debit' : 'credit', amount: l.debit ?? l.credit ?? 0 };
    });
    if (dry) {
      console.log(`would post  ${entry.date}  ${entry.description.slice(0, 70)}`);
      continue;
    }
    const r = await invoke(supabase, 'journal-entries', {
      method: 'POST',
      company_id: COMPANY,
      entryData: { entry_date: entry.date, description: entry.description, items },
    });
    if (!r.ok) {
      console.log(`FAIL ${entry.date}  ${entry.description.slice(0, 60)}`);
      console.log(`     status=${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
      continue;
    }
    console.log(`ok   ${entry.date}  ${entry.description.slice(0, 70)}`);
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
