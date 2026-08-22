import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const quotes = await invoke(s, 'quotes', { method: 'GET_ALL', company_id });
  const quote = (quotes.body as Array<Record<string, unknown>>)?.[0];
  const pos = await invoke(s, 'purchase-orders', { method: 'GET_ALL', company_id });
  const po = (pos.body as Array<Record<string, unknown>>)?.[0];

  console.log(`quotes available: ${(quotes.body as unknown[])?.length ?? 0}, POs: ${(pos.body as unknown[])?.length ?? 0}\n`);

  const cases: Array<[string, string, Record<string, unknown>]> = [
    ['3  send-quote-email', 'send-quote-email', { quoteId: quote?.id, to: 'nobody@example.invalid', subject: 'probe', body: 'probe' }],
    ['17 send-statement-email', 'send-statement-email', { vendorId: null, customerId: null, to: 'nobody@example.invalid', subject: 'probe', body: 'probe' }],
    ['-  send-po-email', 'send-po-email', { poId: po?.id, to: 'nobody@example.invalid', subject: 'probe', body: 'probe' }],
    ['-  send-invoice-email (control)', 'send-invoice-email', { invoiceId: null, to: 'nobody@example.invalid', subject: 'probe', body: 'probe' }],
  ];
  for (const [label, fn, body] of cases) {
    const r = await invoke(s, fn, body);
    const t = tech(r);
    const authBlocked = /not authenticated/i.test(t);
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${String(r.status).padEnd(4)} ${label.padEnd(32)} ${authBlocked ? '<-- AUTH BLOCKED (service-role required from browser)' : t.slice(0, 90)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
