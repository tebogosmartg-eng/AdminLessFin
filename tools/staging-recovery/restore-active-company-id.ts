/**
 * Sets the staging user's active company back to a given id (after a test
 * run left it elsewhere). Uses the same checked SWITCH_COMPANY the app uses.
 *   npx tsx tools/staging-recovery/restore-active-company-id.ts <company-id>
 */
import { connect, invoke } from './edgeProbe';
async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Pass the company id.');
  const { supabase } = await connect();
  const r = await invoke(supabase, 'settings', { method: 'SWITCH_COMPANY', company_id: id, target_company_id: id });
  const s = await invoke(supabase, 'user-session', { method: 'GET' });
  console.log(JSON.stringify({ switched: r.ok, active: (s.body as any)?.activeCompany?.name }));
}
main().catch((e) => { console.error(e); process.exit(1); });
