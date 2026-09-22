/** Read-only: the staging user's active company and how many customers it has. */
import { connect, invoke } from './edgeProbe';
async function main() {
  const { supabase } = await connect();
  const s = await invoke(supabase, 'user-session', { method: 'GET' });
  const active = (s.body as any)?.activeCompany;
  const cust = await invoke(supabase, 'customers', { method: 'GET', company_id: active.id });
  const rows = Array.isArray(cust.body) ? cust.body : (cust.body as any)?.data ?? [];
  console.log(JSON.stringify({ active: { id: active.id, name: active.name }, customers: rows.length, status: cust.status }));
}
main().catch((e) => { console.error(e); process.exit(1); });
