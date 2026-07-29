const fs = require('fs');
const https = require('https');

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN to run this script');
  process.exit(1);
}
const projectRef = process.env.SUPABASE_PROJECT_REF || 'zaulhnpohrgqqodvzhxp';

function q(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      {
        hostname: 'api.supabase.com',
        path: `/v1/projects/${projectRef}/database/query`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${d}`));
          else {
            try {
              resolve(JSON.parse(d));
            } catch {
              resolve(d);
            }
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const step = process.argv[2] || 'verify';

  if (step === 'record') {
    try {
      await q(`INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260723141752') ON CONFLICT DO NOTHING`);
      console.log('migration version recorded');
    } catch (e) {
      console.log('record attempt1:', e.message);
      const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'`);
      console.log('cols', cols);
    }
    return;
  }

  if (step === 'verify-gap1') {
    const col = await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='bank_transactions' AND column_name='attachment_url'`);
    console.log('ATTACHMENT_COL', JSON.stringify(col, null, 2));
    const pre = await q(`SELECT id, amount, attachment_url IS NULL AS attachment_is_null, created_at FROM bank_transactions ORDER BY created_at ASC LIMIT 5`);
    console.log('PREEXISTING_BANK_TXNS', JSON.stringify(pre, null, 2));
    return;
  }

  if (step === 'seed-and-owner') {
    const companies = await q(`SELECT id, name FROM companies ORDER BY created_at ASC LIMIT 5`);
    console.log('COMPANIES', JSON.stringify(companies, null, 2));
    const companyId = process.env.COMPANY_ID || companies[0]?.id;
    if (!companyId) throw new Error('No company');

    const seeded = await q(`SELECT public.seed_quick_expense_categories('${companyId}'::uuid) AS seed`);
    console.log('SEEDED', JSON.stringify(seeded, null, 2));

    const cats = await q(`
      SELECT q.label, q.id AS category_id, c.id AS account_id, c.name AS account_name, c.type, c.account_number
      FROM quick_expense_categories q
      JOIN chart_of_accounts c ON c.id = q.expense_account_id
      WHERE q.company_id = '${companyId}'
      ORDER BY q.sort_order`);
    console.log('CATEGORIES', JSON.stringify(cats, null, 2));

    const due = await q(`SELECT public.ensure_due_to_owner_account('${companyId}'::uuid) AS id`);
    const dueId = due[0].id;
    const dueRow = await q(`SELECT id, account_number, name, type, normal_balance FROM chart_of_accounts WHERE id = '${dueId}'`);
    console.log('DUE_TO_OWNER', JSON.stringify(dueRow, null, 2));

    const expenseId = cats[0].account_id;
    const result = await q(`
      SELECT public.record_owner_paid_expense_atomic(
        '${companyId}'::uuid,
        '${expenseId}'::uuid,
        125.50,
        CURRENT_DATE,
        'Phase1 checkpoint fuel — owner paid',
        'Engen Checkpoint',
        '${cats[0].category_id}'::uuid,
        NULL,
        NULL
      ) AS result`);
    console.log('OWNER_PAID_RPC', JSON.stringify(result, null, 2));

    const captureId = result[0].result.capture_id;
    const journalId = result[0].result.journal_id;

    const lines = await q(`
      SELECT jei.type, jei.amount, c.name, c.type AS account_type
      FROM journal_entry_items jei
      JOIN chart_of_accounts c ON c.id = jei.account_id
      WHERE jei.journal_entry_id = '${journalId}'
      ORDER BY jei.type DESC`);
    console.log('JOURNAL_LINES', JSON.stringify(lines, null, 2));

    const bankHit = await q(`
      SELECT COUNT(*)::int AS cnt FROM bank_transactions
      WHERE journal_entry_id = '${journalId}' OR id::text = '${captureId}'`);
    console.log('BANK_REGISTER_HITS_FOR_OWNER_PAID', JSON.stringify(bankHit, null, 2));

    const capture = await q(`SELECT * FROM quick_expense_captures WHERE id = '${captureId}'`);
    console.log('CAPTURE', JSON.stringify(capture, null, 2));
    return;
  }

  if (step === 'sql') {
    const sql = process.argv[3];
    const out = await q(sql);
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log('usage: node scripts/quick-capture-db.js <record|verify-gap1|seed-and-owner|sql>');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
