/**
 * Live proof of the quotation email path.
 *
 * Creates a REAL quotation in production, then attempts a REAL send and
 * captures the exact response. Also exercises the negative paths that the
 * early configuration guard used to mask, so the whole chain the platform
 * controls is evidenced independently of the external mail provider.
 */
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);
const RECIPIENT = process.env.QUOTE_TEST_RECIPIENT || 'tebogosmartg@gmail.com';

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  console.log(`company: ${company.name}`);
  console.log(`recipient: ${RECIPIENT}`);

  const cust = await s.from('customers').select('id, name, email').eq('company_id', company.id).limit(1).maybeSingle();
  if (!cust.data) throw new Error('No customer available.');
  console.log(`customer: ${cust.data.name}`);

  const num = await invoke(s, 'quotes', { method: 'GET_NEXT_QUOTE_NUMBER', company_id: company.id });
  const quoteNumber = (num.body as { quote_number?: string })?.quote_number ?? `Q-EMAIL-${Date.now()}`;

  console.log(NL + '=== 1. CREATE A REAL QUOTATION ===');
  const created = await invoke(s, 'quotes', {
    method: 'POST',
    company_id: company.id,
    quoteData: {
      customer_id: cust.data.id,
      quote_number: quoteNumber,
      quote_date: '2026-08-22',
      expiry_date: '2026-09-22',
      status: 'draft',
      description: 'Release closure verification quotation',
      terms: 'Valid 30 days. E&OE. Payment 30 days from invoice date.',
      items: [{ description: 'Release closure verification item', quantity: 1, unit_price: 1000 }],
    },
  });
  console.log(`  status=${created.status} ok=${created.ok} body=${JSON.stringify(created.body)}`);
  if (!created.ok) throw new Error('Quote creation failed.');
  const quoteId = (created.body as { id: string }).id;

  const back = await s.from('quotes').select('id, quote_number, terms, status').eq('id', quoteId).maybeSingle();
  console.log(`  persisted: ${JSON.stringify(back.data)}`);

  console.log(NL + '=== 2. NEGATIVE PATHS (previously masked by the config guard) ===');
  const missing = await invoke(s, 'send-quote-email', { quoteId });
  console.log(`  missing params -> ${missing.status} ${(missing.body as { technicalMessage?: string })?.technicalMessage}`);

  const unknown = await invoke(s, 'send-quote-email', {
    quoteId: '00000000-0000-0000-0000-000000000000',
    to: RECIPIENT,
    subject: 'x',
    body: 'x',
  });
  console.log(`  unknown quote  -> ${unknown.status} ${(unknown.body as { technicalMessage?: string })?.technicalMessage}`);

  console.log(NL + '=== 3. REAL SEND ATTEMPT ===');
  const sent = await invoke(s, 'send-quote-email', {
    quoteId,
    to: RECIPIENT,
    subject: `Quotation ${quoteNumber} from ${company.name}`,
    body: 'Please find our quotation attached below. Thank you for the opportunity.',
  });
  console.log(`  status=${sent.status} ok=${sent.ok}`);
  console.log('  body: ' + JSON.stringify(sent.body, null, 2).split(NL).join(NL + '  '));

  if (sent.ok) {
    console.log(NL + '  RESULT: EMAIL SENT. providerMessageId=' +
      ((sent.body as { providerMessageId?: string })?.providerMessageId ?? 'n/a'));
  } else {
    const t = (sent.body as { technicalMessage?: string })?.technicalMessage ?? '';
    console.log(NL + '  RESULT: NOT SENT. Blocker: ' + t);
  }

  console.log(NL + '=== 4. CLEANUP ===');
  await s.from('quote_items').delete().eq('quote_id', quoteId);
  const del = await s.from('quotes').delete().eq('id', quoteId);
  console.log('  probe quotation removed: ' + (del.error ? del.error.message : 'yes'));
}
main().catch((e) => { console.error(e); process.exit(1); });
