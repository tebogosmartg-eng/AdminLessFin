/**
 * Give a test company enough of a ledger to show what the disclosure engine
 * does — assets by class, their depreciation, receivables and an allowance,
 * borrowings, trade and payroll costs — across two years so comparatives appear.
 *
 * Every entry goes through posting_engine_submit, the same gateway the product
 * uses, so what comes out the other end is a real trial balance and not a
 * fixture. Entries are described as demonstration data so they can be found and
 * reversed.
 *
 *   npx tsx tools/staging-recovery/seed-disclosure-demo.ts <company-id> [--dry]
 */
import { connect, invoke } from './edgeProbe';

const TAG = 'AFS disclosure demonstration';

type Line = { account: string; debit?: number; credit?: number };
type Entry = { date: string; description: string; lines: Line[] };

/** Two years of a small trading company, in the order they would have happened. */
const ENTRIES: Entry[] = [
  // ── FY2025 ────────────────────────────────────────────────────────────────
  {
    date: '2025-01-15',
    description: `${TAG} — capital introduced`,
    lines: [
      { account: 'Bank - Current Account', debit: 900_000 },
      { account: 'Share Capital', credit: 900_000 },
    ],
  },
  {
    date: '2025-02-01',
    description: `${TAG} — property acquired`,
    lines: [
      { account: 'Land and Buildings', debit: 1_200_000 },
      { account: 'Long-term Loans', credit: 1_200_000 },
    ],
  },
  {
    date: '2025-02-10',
    description: `${TAG} — vehicles and equipment acquired`,
    lines: [
      { account: 'Motor Vehicles', debit: 480_000 },
      { account: 'Computer Equipment', debit: 165_000 },
      { account: 'Office Equipment', debit: 92_000 },
      { account: 'Furniture and Fittings', debit: 78_000 },
      { account: 'Bank - Current Account', credit: 815_000 },
    ],
  },
  {
    date: '2025-06-30',
    description: `${TAG} — trading, first year`,
    lines: [
      { account: 'Bank - Current Account', debit: 1_870_000 },
      { account: 'Prepaid Expenses', debit: 280_000 },
      { account: 'Sales - Goods', credit: 1_870_000 },
      { account: 'Sales - Services', credit: 280_000 },
    ],
  },
  {
    date: '2025-07-31',
    description: `${TAG} — cost of goods sold, first year`,
    lines: [
      { account: 'Purchases', debit: 980_000 },
      { account: 'Accrued Expenses', credit: 980_000 },
    ],
  },
  {
    date: '2025-09-30',
    description: `${TAG} — employee costs, first year`,
    lines: [
      { account: 'Salaries and Wages', debit: 620_000 },
      { account: 'UIF Contribution (Employer)', debit: 6_200 },
      { account: 'Bank - Current Account', credit: 626_200 },
    ],
  },
  {
    date: '2025-10-31',
    description: `${TAG} — operating costs, first year`,
    lines: [
      { account: 'Lease / Rent Paid', debit: 144_000 },
      { account: 'Insurance', debit: 38_000 },
      { account: 'Telephone and Internet', debit: 21_000 },
      { account: 'Bank - Current Account', credit: 203_000 },
    ],
  },
  {
    date: '2025-11-30',
    description: `${TAG} — suppliers paid, first year`,
    lines: [
      { account: 'Accrued Expenses', debit: 640_000 },
      { account: 'Bank - Current Account', credit: 640_000 },
    ],
  },
  {
    date: '2025-12-31',
    description: `${TAG} — allowance for doubtful debts, first year`,
    lines: [
      { account: 'Bad Debts', debit: 32_000 },
      { account: 'Provision for Doubtful Debts', credit: 32_000 },
    ],
  },

  // ── FY2026 ────────────────────────────────────────────────────────────────
  {
    date: '2026-02-28',
    description: `${TAG} — equipment additions`,
    lines: [
      { account: 'Computer Equipment', debit: 94_000 },
      { account: 'Furniture and Fittings', debit: 46_000 },
      { account: 'Bank - Current Account', credit: 140_000 },
    ],
  },
  {
    date: '2026-03-31',
    description: `${TAG} — instalment sale agreement`,
    lines: [
      { account: 'Motor Vehicles', debit: 385_000 },
      { account: 'Instalment Sale Liabilities', credit: 385_000 },
    ],
  },
  {
    date: '2026-06-30',
    description: `${TAG} — trading, current year`,
    lines: [
      { account: 'Bank - Current Account', debit: 2_910_000 },
      { account: 'Prepaid Expenses', debit: 510_000 },
      { account: 'Sales - Goods', credit: 2_910_000 },
      { account: 'Sales - Services', credit: 510_000 },
    ],
  },
  {
    date: '2026-07-31',
    description: `${TAG} — cost of goods sold, current year`,
    lines: [
      { account: 'Purchases', debit: 1_545_000 },
      { account: 'Accrued Expenses', credit: 1_545_000 },
    ],
  },
  {
    date: '2026-08-31',
    description: `${TAG} — employee costs, current year`,
    lines: [
      { account: 'Salaries and Wages', debit: 845_000 },
      { account: 'UIF Contribution (Employer)', debit: 8_450 },
      { account: 'Bank - Current Account', credit: 853_450 },
    ],
  },
  {
    date: '2026-09-30',
    description: `${TAG} — operating costs, current year`,
    lines: [
      { account: 'Lease / Rent Paid', debit: 168_000 },
      { account: 'Insurance', debit: 44_500 },
      { account: 'Telephone and Internet', debit: 26_400 },
      { account: 'Repairs and Maintenance', debit: 57_800 },
      { account: 'Bank - Current Account', credit: 296_700 },
    ],
  },
  {
    date: '2026-11-15',
    description: `${TAG} — suppliers paid, current year`,
    lines: [
      { account: 'Accrued Expenses', debit: 1_180_000 },
      { account: 'Bank - Current Account', credit: 1_180_000 },
    ],
  },
  {
    date: '2026-11-30',
    description: `${TAG} — loan repayments and interest`,
    lines: [
      { account: 'Long-term Loans', debit: 180_000 },
      { account: 'Interest Paid', debit: 96_400 },
      { account: 'Bank - Current Account', credit: 276_400 },
    ],
  },
  {
    date: '2026-12-31',
    description: `${TAG} — allowance for doubtful debts, current year`,
    lines: [
      { account: 'Bad Debts', debit: 18_500 },
      { account: 'Provision for Doubtful Debts', credit: 18_500 },
    ],
  },
];

async function main() {
  const [companyId] = process.argv.slice(2);
  const dry = process.argv.includes('--dry');
  if (!companyId) throw new Error('Pass the company id.');

  const { supabase } = await connect();

  const { data: accounts, error } = await supabase
    .from('chart_of_accounts')
    .select('id, name, account_number, type, subcategory')
    .eq('company_id', companyId);
  if (error) throw error;

  const byName = new Map<string, { id: string; name: string }>();
  for (const a of accounts || []) byName.set(String(a.name).trim().toLowerCase(), a);

  const resolve = (name: string) => {
    const hit = byName.get(name.trim().toLowerCase());
    if (hit) return hit;
    // Fall back to a unique partial match, so a chart that words an account
    // slightly differently still seeds rather than failing outright.
    const partial = (accounts || []).filter((a) =>
      String(a.name).toLowerCase().includes(name.toLowerCase()),
    );
    if (partial.length === 1) return partial[0];
    return null;
  };

  const missing = new Set<string>();
  for (const entry of ENTRIES) {
    for (const line of entry.lines) if (!resolve(line.account)) missing.add(line.account);
  }
  if (missing.size) {
    console.log(`accounts not found in this chart:\n  ${[...missing].join('\n  ')}`);
    if (!dry) throw new Error('Seed aborted — the chart does not carry every account.');
  }
  if (dry) {
    console.log(`${ENTRIES.length} entries would be posted.`);
    return;
  }

  let posted = 0;
  for (const entry of ENTRIES) {
    const items = entry.lines.map((l) => {
      const account = resolve(l.account)!;
      return {
        account_id: account.id,
        type: l.debit ? 'debit' : 'credit',
        amount: l.debit ?? l.credit ?? 0,
      };
    });
    const debits = items.filter((i) => i.type === 'debit').reduce((s, i) => s + i.amount, 0);
    const credits = items.filter((i) => i.type === 'credit').reduce((s, i) => s + i.amount, 0);
    if (Math.abs(debits - credits) > 0.005) {
      throw new Error(`"${entry.description}" does not balance: ${debits} vs ${credits}`);
    }

    const r = await invoke(supabase, 'journal-entries', {
      method: 'POST',
      company_id: companyId,
      entryData: { entry_date: entry.date, description: entry.description, items },
    });
    if (!r.ok) {
      console.log(`FAIL ${entry.date} ${entry.description}`);
      console.log(`     ${JSON.stringify(r.body).slice(0, 300)}`);
      continue;
    }
    posted += 1;
    console.log(`ok   ${entry.date}  ${entry.description}`);
  }
  console.log(`\nposted ${posted} of ${ENTRIES.length} entries.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
