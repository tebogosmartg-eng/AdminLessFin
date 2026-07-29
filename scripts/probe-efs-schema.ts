import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  const content = readFileSync(join(process.cwd(), '.env'), 'utf8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = v;
  }
}

loadEnv();
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
const auth = await sb.auth.signInWithPassword({
  email: process.env.E2E_EMAIL!,
  password: process.env.E2E_PASSWORD!,
});
if (auth.error) {
  console.log(JSON.stringify({ auth: 'FAIL', error: auth.error.message }));
  process.exit(1);
}

const colProbe = await sb.from('efs_reporting_periods').select('id,financial_year_id').limit(1);
const grapPacks = await sb.from('efs_framework_packs').select('id,framework_key,version_id,status').eq('framework_key', 'GRAP');

console.log(JSON.stringify({
  columnProbe: {
    error: colProbe.error?.message,
    code: colProbe.error?.code,
    sample: colProbe.data,
  },
  grapPacks: {
    error: grapPacks.error?.message,
    count: grapPacks.data?.length ?? 0,
    packs: grapPacks.data,
  },
}, null, 2));
