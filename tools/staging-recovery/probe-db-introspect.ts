import { connect } from './edgeProbe';

/**
 * Discovers the existing audit trigger function and its attached tables, so a
 * migration can extend the SAME mechanism instead of inventing a parallel one.
 * Uses an existing SECURITY DEFINER RPC if one is exposed; otherwise reports
 * what it could and could not determine.
 */
async function main() {
  const { supabase: s } = await connect(process.argv[2] || 'Spaceman');
  // Try the standard introspection RPCs projects commonly expose.
  for (const fn of ['exec_sql', 'run_sql', 'admin_query']) {
    const r = await s.rpc(fn, { query: 'select 1' } as never);
    console.log(`rpc ${fn}: ${r.error ? r.error.message.slice(0, 80) : 'AVAILABLE'}`);
  }
  // pg_catalog is not exposed through PostgREST by default; confirm.
  const t = await s.from('pg_trigger').select('tgname').limit(1);
  console.log(`pg_trigger via PostgREST: ${t.error ? t.error.message.slice(0, 90) : 'readable'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
