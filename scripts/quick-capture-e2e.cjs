const https = require('https');

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN to run this script');
  process.exit(1);
}
const projectRef = process.env.SUPABASE_PROJECT_REF || 'zaulhnpohrgqqodvzhxp';
const companyId = process.env.EAM_CERT_COMPANY_ID || '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';
const bankAccountId = process.env.QC_BANK_ACCOUNT_ID || 'bfba5185-d35d-4ae8-aad1-502dc8c5c120';
const fuelCategoryId = process.env.QC_FUEL_CATEGORY_ID || '074ab46b-7eef-4b38-a820-9e0b5c749f82';
const fuelAccountId = process.env.QC_FUEL_ACCOUNT_ID || 'b5c3cac9-5fd3-4427-af0f-202fecc5ada1';
const uniformsCategoryId = process.env.QC_UNIFORMS_CATEGORY_ID || '58d74d79-ec60-4955-a8bb-f9ec9c66cdb2';
const uniformsAccountId = process.env.QC_UNIFORMS_ACCOUNT_ID || '9a2324db-eefe-443c-814f-1bcd6669f5d8';

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
          else resolve(JSON.parse(d));
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== BANK-PAID PATH ===');
  const bankRpc = await q(`
    SELECT public.record_bank_transaction_atomic(
      '${companyId}'::uuid,
      '${bankAccountId}'::uuid,
      'withdrawal',
      'decrease',
      CURRENT_DATE,
      89.99,
      '${fuelAccountId}'::uuid,
      'Phase4 bank-paid fuel — Engen',
      'QC:Engen Bank',
      NULL
    ) AS result`);
  console.log('BANK_RPC', JSON.stringify(bankRpc, null, 2));
  const bankTxnId = bankRpc[0].result.bank_transaction_id;
  const bankJournalId = bankRpc[0].result.journal_id;
  const bankAttach = `https://zaulhnpohrgqqodvzhxp.supabase.co/storage/v1/object/public/attachments/${companyId}/quick-capture/${bankTxnId}/receipt.jpg`;

  const capture = await q(`
    SELECT public.record_bank_paid_quick_capture(
      '${companyId}'::uuid,
      '${bankAccountId}'::uuid,
      '${bankTxnId}'::uuid,
      '${fuelAccountId}'::uuid,
      89.99,
      CURRENT_DATE,
      'Phase4 bank-paid fuel — Engen',
      'Engen Bank',
      '${fuelCategoryId}'::uuid,
      '${bankAttach}',
      NULL
    ) AS result`);
  console.log('BANK_CAPTURE', JSON.stringify(capture, null, 2));

  const bankTxn = await q(`SELECT id, amount, transaction_type, attachment_url, journal_entry_id, description FROM bank_transactions WHERE id = '${bankTxnId}'`);
  console.log('BANK_TXN_ROW', JSON.stringify(bankTxn, null, 2));

  const bankLines = await q(`
    SELECT jei.type, jei.amount, c.name, c.type AS account_type
    FROM journal_entry_items jei
    JOIN chart_of_accounts c ON c.id = jei.account_id
    WHERE jei.journal_entry_id = '${bankJournalId}'
    ORDER BY jei.type DESC`);
  console.log('BANK_JE_LINES', JSON.stringify(bankLines, null, 2));

  const inRegister = await q(`SELECT COUNT(*)::int AS cnt FROM bank_transactions WHERE id = '${bankTxnId}'`);
  console.log('BANK_REGISTER_PRESENT', JSON.stringify(inRegister, null, 2));

  console.log('=== OWNER-PAID PATH (with attachment) ===');
  const ownerAttach = `https://zaulhnpohrgqqodvzhxp.supabase.co/storage/v1/object/public/attachments/${companyId}/quick-capture/owner-e2e/receipt.jpg`;
  const ownerRpc = await q(`
    SELECT public.record_owner_paid_expense_atomic(
      '${companyId}'::uuid,
      '${uniformsAccountId}'::uuid,
      450.00,
      CURRENT_DATE,
      'Phase4 owner-paid uniforms',
      'Uniform World',
      '${uniformsCategoryId}'::uuid,
      '${ownerAttach}',
      NULL
    ) AS result`);
  console.log('OWNER_RPC', JSON.stringify(ownerRpc, null, 2));
  const ownerJournalId = ownerRpc[0].result.journal_id;
  const ownerCaptureId = ownerRpc[0].result.capture_id;

  const ownerLines = await q(`
    SELECT jei.type, jei.amount, c.name, c.type AS account_type
    FROM journal_entry_items jei
    JOIN chart_of_accounts c ON c.id = jei.account_id
    WHERE jei.journal_entry_id = '${ownerJournalId}'
    ORDER BY jei.type DESC`);
  console.log('OWNER_JE_LINES', JSON.stringify(ownerLines, null, 2));

  const ownerCapture = await q(`SELECT id, payment_source_kind, attachment_url, journal_entry_id, vendor_name FROM quick_expense_captures WHERE id = '${ownerCaptureId}'`);
  console.log('OWNER_CAPTURE', JSON.stringify(ownerCapture, null, 2));

  const ownerInBank = await q(`SELECT COUNT(*)::int AS cnt FROM bank_transactions WHERE journal_entry_id = '${ownerJournalId}'`);
  console.log('OWNER_ABSENT_FROM_BANK_REGISTER', JSON.stringify(ownerInBank, null, 2));

  // Trial balance style: sum of JE items for these accounts today
  const tb = await q(`
    SELECT c.name, c.type,
      SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE 0 END) AS debits,
      SUM(CASE WHEN jei.type = 'credit' THEN jei.amount ELSE 0 END) AS credits
    FROM journal_entry_items jei
    JOIN journal_entries je ON je.id = jei.journal_entry_id
    JOIN chart_of_accounts c ON c.id = jei.account_id
    WHERE je.company_id = '${companyId}'
      AND je.id IN ('${bankJournalId}', '${ownerJournalId}')
    GROUP BY c.name, c.type
    ORDER BY c.type, c.name`);
  console.log('TB_SLICE_FOR_BOTH', JSON.stringify(tb, null, 2));

  // Category suggestion check (seed history already has Engen)
  const suggest = await q(`SELECT public.suggest_quick_expense_category('${companyId}'::uuid, 'Engen', NULL) AS suggestion`);
  console.log('SUGGEST_ENGEN', JSON.stringify(suggest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
