import { connect, invoke, tech } from './edgeProbe';
async function main() {
  const { supabase: s } = await connect('Spaceman');
  const r = await invoke(s, 'send-payslip-email', { payslipId: '00000000-0000-0000-0000-000000000000', to: 'x@example.com', subject: 's', body: 'b' });
  const b = r.body as { category?: string; businessMessage?: string; technicalMessage?: string };
  console.log(`status=${r.status} category=${b?.category}`);
  console.log(`business : ${b?.businessMessage}`);
  console.log(`technical: ${(b?.technicalMessage ?? tech(r)).slice(0, 120)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
