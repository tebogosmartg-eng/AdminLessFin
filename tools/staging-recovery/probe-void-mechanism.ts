import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);
const BILL = 'bc74c049-260a-4cc9-a1d6-994f6502dfed';
const JE = '4e7e026d-9efc-467d-9ff6-7397836c1392';

async function main() {
  const { supabase: s, company } = await connect('Spaceman');

  console.log('=== posting_requests for this bill ===');
  const pr = await s.from('posting_requests').select('*')
    .eq('company_id', company.id).ilike('idempotency_key', `%${BILL}%`);
  console.log(`  rows: ${pr.data?.length ?? 0} ${pr.error ? 'ERR ' + pr.error.message : ''}`);
  for (const r of pr.data ?? []) {
    const rec = r as Record<string, unknown>;
    console.log(`    key=${rec.idempotency_key} status=${rec.status} je=${rec.journal_entry_id}`);
  }

  console.log(NL + '=== what idempotency keys do bill postings actually use? ===');
  const anyPr = await s.from('posting_requests').select('idempotency_key, status, journal_entry_id, module, document_type')
    .eq('company_id', company.id).limit(400);
  const billKeys = (anyPr.data ?? []).filter((r) => /bill/i.test(String(r.idempotency_key)) || /bill/i.test(String(r.document_type)));
  console.log(`  bill-related posting_requests: ${billKeys.length} of ${anyPr.data?.length ?? 0}`);
  for (const r of billKeys.slice(0, 8)) {
    console.log(`    ${r.idempotency_key} | module=${r.module} doc=${r.document_type} status=${r.status}`);
  }

  console.log(NL + '=== calling posting_engine_rollback with the void handler key ===');
  const rb = await s.rpc('posting_engine_rollback', {
    p_idempotency_key: `accounts_payable:bill:${BILL}`,
    p_company_id: company.id,
    p_reason: 'diagnostic re-run',
  } as never);
  console.log(`  error: ${rb.error ? rb.error.message : 'none'}`);
  console.log(`  data : ${JSON.stringify(rb.data)}`);

  console.log(NL + '=== is the original bill journal still standing? ===');
  const it = await s.from('journal_entry_items').select('type, amount').eq('journal_entry_id', JE);
  console.log(`  lines: ${JSON.stringify(it.data)}`);

  console.log(NL + '=== an EARLIER voided bill that DID reverse (JE-000126) ===');
  const ok = await s.from('journal_entries').select('id, journal_number, description, vendor_id, bill_id')
    .eq('company_id', company.id).ilike('description', '%Bill voided%').limit(5);
  for (const j of ok.data ?? []) {
    console.log(`  ${j.journal_number} :: ${j.description} vendor_id=${j.vendor_id ? 'SET' : 'NULL'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
