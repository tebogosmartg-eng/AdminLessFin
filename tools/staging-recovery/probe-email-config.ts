import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const inv = await invoke(s, 'invoices', { method: 'GET', company_id });
  const invoice = (inv.body as Array<Record<string, unknown>>)?.[0];
  console.log(`invoices: ${(inv.body as unknown[])?.length ?? 0}`);
  if (!invoice) { console.log('no invoice to test with'); return; }
  const r = await invoke(s, 'send-invoice-email', {
    invoiceId: invoice.id, to: 'nobody@example.invalid', subject: 'probe', body: 'probe',
  });
  console.log(`send-invoice-email (full params): ${r.status} ${tech(r)}`);
  const secretsMissing = /not configured|RESEND/i.test(tech(r));
  console.log(secretsMissing
    ? '\n=> Resend secrets are NOT configured for this project. NO email function can send.'
    : '\n=> Invoice email reached the provider; the quote/statement/PO failures were auth-only.');
}
main().catch((e) => { console.error(e); process.exit(1); });
