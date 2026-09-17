/**
 * The statement email may only describe a party in the caller's own company.
 *
 * It used to look the customer or supplier up by id alone, so a member of one
 * company could request a statement for another company's party by passing
 * its id. Every check here is rejected BEFORE anything is computed or sent --
 * none of them can deliver an email, which is what makes them safe to run
 * against production.
 */
import { connect, invoke } from './edgeProbe';

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}
const message = (p: { body: unknown }) =>
  String((p.body as { message?: string; technicalMessage?: string })?.technicalMessage
    ?? (p.body as { message?: string })?.message ?? JSON.stringify(p.body)).slice(0, 110);

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const home = companies.find((x) => x.name === 'Spaceman')!;
  const other = companies.find((x) => x.id !== home.id)!;

  const cust = await api.from('customers').select('id, name').eq('company_id', home.id).limit(1).maybeSingle();
  if (!cust.data) throw new Error('No customer in the home company.');

  const base = {
    type: 'customer', entityId: cust.data.id, date_from: '2026-03-01', date_to: '2026-09-30',
    to: 'nobody@invalid.example', subject: 'scoping probe', body: 'probe',
  };

  console.log('======== ANOTHER COMPANY\'S CUSTOMER ========');
  const cross = await invoke(api, 'send-statement-email', { ...base, method: 'SEND', company_id: other.id });
  check('is refused', !cross.ok, 'status ' + cross.status);
  check('as not found in this company, not as a sending failure',
    /not found in this company/i.test(message(cross)), message(cross));

  console.log('\n======== MALFORMED REQUESTS ARE REFUSED BEFORE ANY WORK ========');
  const badType = await invoke(api, 'send-statement-email', { ...base, company_id: home.id, type: 'employee' });
  check('an unknown party type', !badType.ok && /type must be/i.test(message(badType)), message(badType));
  const badDate = await invoke(api, 'send-statement-email', { ...base, company_id: home.id, date_from: '01/03/2026' });
  check('a date that is not YYYY-MM-DD', !badDate.ok && /YYYY-MM-DD/i.test(message(badDate)), message(badDate));
  const reversed = await invoke(api, 'send-statement-email', { ...base, company_id: home.id, date_from: '2026-10-01', date_to: '2026-09-01' });
  check('a period that ends before it starts', !reversed.ok && /must not be after/i.test(message(reversed)), message(reversed));

  console.log('\nPASS ' + pass + '  FAIL ' + fail);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
