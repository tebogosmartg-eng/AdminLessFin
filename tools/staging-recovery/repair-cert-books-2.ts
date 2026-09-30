/**
 * CERT TX book completion, round two — through the product's own routes:
 *
 *  1. Chart classification (chart-of-accounts PUT/POST): finance costs and
 *     income tax were classified as "Other Expenses"; a tax payable account
 *     did not exist.
 *  2. The seeded "suppliers paid" payments were really dividends. Round one
 *     reclassified the balance (Dr Drawings / Cr Accrued), which left the cash
 *     itself attributed to Accrued Expenses — operating cash flow. Each
 *     payment is now reversed and re-recorded as the dividend it was, on its
 *     original date, with the round-one reclassification reversed alongside.
 *     Balances are unchanged; the cash is attributed to the dividend.
 *  3. Income tax for both years at 27% of profit before tax, with the 2025
 *     assessment settled in 2026 and a 2026 provisional payment.
 *
 * Every journal goes through journal-entries POST (posting_engine_submit) and
 * is guarded by its description, so a re-run posts nothing twice.
 *
 *   npx tsx tools/staging-recovery/repair-cert-books-2.ts
 */
import { connect, invoke } from './edgeProbe';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';

type Line = { account: string; debit?: number; credit?: number };
type Entry = { date: string; description: string; lines: Line[] };

async function main() {
  const { supabase } = await connect('x');
  const call = async (fn: string, body: Record<string, unknown>) => {
    const r = await invoke(supabase, fn, { company_id: COMPANY, ...body });
    if (!r.ok) throw new Error(`${fn}.${body.method}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body as Record<string, unknown>;
  };
  const chart = async () => {
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('id, account_number, name, category, subcategory')
      .eq('company_id', COMPANY);
    if (error) throw error;
    return data ?? [];
  };

  // 1. Classification
  let accounts = await chart();
  const byName = (name: string) => accounts.find((a) => String(a.name).toLowerCase() === name.toLowerCase());
  for (const [name, category] of [
    ['Finance Costs (Interest Paid)', 'Finance Costs'],
    ['Income Tax Expense', 'Taxation'],
  ] as const) {
    const a = byName(name);
    if (!a) throw new Error(`No account ${name}`);
    if (a.category === category) {
      console.log(`skip classify ${name} (already ${category})`);
      continue;
    }
    await call('chart-of-accounts', { method: 'PUT', accountId: a.id, accountData: { category } });
    console.log(`ok   ${name} -> ${category}`);
  }
  if (!byName('Current Tax Payable')) {
    await call('chart-of-accounts', {
      method: 'POST',
      accountData: {
        account_number: 2210,
        account_code: '2210',
        name: 'Current Tax Payable',
        type: 'Liability',
        category: 'Current Liabilities',
        subcategory: 'Statutory Payables',
        normal_balance: 'credit',
        is_active: true,
        allow_manual_posting: true,
      },
    });
    console.log('ok   Current Tax Payable created');
  } else console.log('skip Current Tax Payable (exists)');
  accounts = await chart();

  // 2 + 3. Journals
  const tax2025 = Math.round(1_086_650 * 0.27 * 100) / 100;
  const tax2026 = Math.round(2_001_200 * 0.27 * 100) / 100;
  const ENTRIES: Entry[] = [
    {
      date: '2025-11-30',
      description: 'Reversal — payment of 30 November 2025 recorded against an accrual; re-recorded as the dividend it was',
      lines: [
        { account: 'Bank - Current Account', debit: 640_000 },
        { account: 'Accrued Expenses', credit: 640_000 },
      ],
    },
    {
      date: '2025-11-30',
      description: 'Reversal — reclassification of the 30 November 2025 payment, superseded by the re-recorded dividend',
      lines: [
        { account: 'Accrued Expenses', debit: 640_000 },
        { account: 'Drawings / Dividends', credit: 640_000 },
      ],
    },
    {
      date: '2025-11-30',
      description: 'Dividend paid to the shareholder — 30 November 2025',
      lines: [
        { account: 'Drawings / Dividends', debit: 640_000 },
        { account: 'Bank - Current Account', credit: 640_000 },
      ],
    },
    {
      date: '2026-11-15',
      description: 'Reversal — payment of 15 November 2026 recorded against an accrual; re-recorded as the dividend it was',
      lines: [
        { account: 'Bank - Current Account', debit: 1_180_000 },
        { account: 'Accrued Expenses', credit: 1_180_000 },
      ],
    },
    {
      date: '2026-11-15',
      description: 'Reversal — reclassification of the 15 November 2026 payment, superseded by the re-recorded dividend',
      lines: [
        { account: 'Accrued Expenses', debit: 1_180_000 },
        { account: 'Drawings / Dividends', credit: 1_180_000 },
      ],
    },
    {
      date: '2026-11-15',
      description: 'Dividend paid to the shareholder — 15 November 2026',
      lines: [
        { account: 'Drawings / Dividends', debit: 1_180_000 },
        { account: 'Bank - Current Account', credit: 1_180_000 },
      ],
    },
    {
      date: '2025-12-31',
      description: 'Income tax — current tax for the year ended 31 December 2025 at 27%',
      lines: [
        { account: 'Income Tax Expense', debit: tax2025 },
        { account: 'Current Tax Payable', credit: tax2025 },
      ],
    },
    {
      date: '2026-06-30',
      description: 'Income tax — 2025 assessment paid to SARS',
      lines: [
        { account: 'Current Tax Payable', debit: tax2025 },
        { account: 'Bank - Current Account', credit: tax2025 },
      ],
    },
    {
      date: '2026-08-31',
      description: 'Income tax — 2026 first provisional payment to SARS',
      lines: [
        { account: 'Current Tax Payable', debit: 250_000 },
        { account: 'Bank - Current Account', credit: 250_000 },
      ],
    },
    {
      date: '2026-12-31',
      description: 'Income tax — current tax for the year ended 31 December 2026 at 27%',
      lines: [
        { account: 'Income Tax Expense', debit: tax2026 },
        { account: 'Current Tax Payable', credit: tax2026 },
      ],
    },
  ];

  const { data: existing } = await supabase.from('journal_entries').select('description').eq('company_id', COMPANY);
  const already = new Set((existing ?? []).map((j) => String(j.description ?? '')));
  const idOf = (name: string) => {
    const a = accounts.find((x) => String(x.name).toLowerCase() === name.toLowerCase());
    if (!a) throw new Error(`Account not in chart: ${name}`);
    return a.id;
  };
  for (const e of ENTRIES) {
    if (already.has(e.description)) {
      console.log(`skip ${e.date} ${e.description.slice(0, 60)}`);
      continue;
    }
    const items = e.lines.map((l) => ({
      account_id: idOf(l.account),
      type: l.debit ? 'debit' : 'credit',
      amount: l.debit ?? l.credit ?? 0,
    }));
    await call('journal-entries', { method: 'POST', entryData: { entry_date: e.date, description: e.description, items } });
    console.log(`ok   ${e.date} ${e.description.slice(0, 70)}`);
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
