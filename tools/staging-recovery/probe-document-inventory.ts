/**
 * What every remaining customer-, supplier- and employee-facing document can
 * be built from.
 *
 * The same survey that preceded the invoice and the quotation: establish what
 * columns exist, and in particular whether tax is captured somewhere and
 * dropped somewhere else, which is the defect class both of those turned out
 * to have.
 */
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);

async function columns(api: ReturnType<typeof connect> extends Promise<infer T> ? (T extends { supabase: infer S } ? S : never) : never, table: string, companyId?: string) {
  let q = (api as any).from(table).select('*').limit(1);
  if (companyId) q = q.eq('company_id', companyId);
  const r = await q;
  if (r.error) return 'ERR ' + r.error.message;
  return Object.keys((r.data ?? [{}])[0] ?? {}).join(', ') || '(no rows)';
}

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  const TABLES: Array<[string, boolean]> = [
    ['purchase_orders', true],
    ['purchase_order_items', false],
    ['credit_notes', true],
    ['credit_note_items', false],
    ['bills', true],
    ['bill_items', false],
    ['payslips', false],
    ['payroll_runs', true],
    ['employees', true],
  ];

  for (const [table, byCompany] of TABLES) {
    console.log(NL + '======== ' + table + ' ========');
    console.log(await columns(api as never, table, byCompany ? co.id : undefined));
  }

  console.log(NL + '======== row counts in Spaceman ========');
  for (const [table, byCompany] of TABLES) {
    if (!byCompany) continue;
    const r = await api.from(table).select('id', { count: 'exact', head: true }).eq('company_id', co.id);
    console.log('  ' + table + ': ' + (r.error ? 'ERR ' + r.error.message : String(r.count)));
  }

  console.log(NL + '======== does a PO line carry tax? ========');
  const poi = await api.from('purchase_order_items').select('*').limit(2);
  console.log(poi.error ? 'ERR ' + poi.error.message : JSON.stringify(poi.data));

  console.log(NL + '======== does a credit note line carry tax? ========');
  const cni = await api.from('credit_note_items').select('*').limit(2);
  console.log(cni.error ? 'ERR ' + cni.error.message : JSON.stringify(cni.data));
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
