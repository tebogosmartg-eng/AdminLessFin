/**
 * Finding 14 — bank statement lines. The tenant had none, so the only way to
 * tell "empty because broken" from "empty because nothing imported" is to
 * import a real statement and follow it through to matching.
 */
import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const ba = await invoke(s, 'banking', { method: 'GET_BANK_ACCOUNTS', company_id });
  const accounts = (ba.body as Array<Record<string, unknown>>) ?? [];
  const acct = accounts.find((a) => String(a.name ?? '').includes('Spaceman')) ?? accounts[0];
  console.log(`bank account: ${acct?.name}`);

  const before = await invoke(s, 'banking', { method: 'GET_STATEMENT_LINES', company_id, bankAccountId: acct?.id });
  console.log(`lines before: ${Array.isArray(before.body) ? before.body.length : tech(before)}`);

  const today = new Date().toISOString().slice(0, 10);
  const imp = await invoke(s, 'banking', {
    method: 'IMPORT_STATEMENT', company_id,
    statementData: {
      bank_account_id: acct?.id,
      period_start: today, period_end: today,
      opening_balance: 0, closing_balance: -150.25,
      file_name: `SR-STATEMENT-${Date.now()}.csv`,
      lines: [
        { line_date: today, description: 'SR probe debit', amount: -100.25, external_reference: 'SR1' },
        { line_date: today, description: 'SR probe credit', amount: -50.00, external_reference: 'SR2' },
      ],
    },
  });
  console.log(`import: ${imp.status} ${imp.ok ? JSON.stringify(imp.body).slice(0, 160) : tech(imp)}`);

  const after = await invoke(s, 'banking', { method: 'GET_STATEMENT_LINES', company_id, bankAccountId: acct?.id });
  const lines = Array.isArray(after.body) ? (after.body as Array<Record<string, unknown>>) : [];
  console.log(`lines after : ${lines.length}`);
  if (lines[0]) console.log(`  keys: ${Object.keys(lines[0]).join(', ')}`);
  if (lines[0]) console.log(`  sample: ${JSON.stringify(lines[0]).slice(0, 220)}`);

  const outstanding = await invoke(s, 'banking', { method: 'GET_OUTSTANDING', company_id, bankAccountId: acct?.id });
  console.log(`outstanding: ${outstanding.status} ${Array.isArray(outstanding.body) ? outstanding.body.length + ' rows' : tech(outstanding)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
