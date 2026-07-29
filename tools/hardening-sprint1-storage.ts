import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const results: { name: string; ok: boolean; error?: string; evidence?: unknown }[] = [];

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const evidence = await fn();
    results.push({ name, ok: true, evidence });
  } catch (e) {
    results.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: env.E2E_EMAIL,
  password: env.E2E_PASSWORD,
});
if (authErr || !auth.session) throw new Error(authErr?.message ?? 'login failed');

const { data: memberships } = await supabase
  .from('company_users')
  .select('company_id')
  .eq('user_id', auth.user!.id)
  .limit(1);
const companyId = memberships?.[0]?.company_id ?? env.EAM_CERT_COMPANY_ID;
if (!companyId) throw new Error('No company for storage tests');

await check('Bucket list includes attachments', async () => {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  const names = (data ?? []).map((b) => b.name);
  if (!names.includes('attachments')) throw new Error(`Missing attachments; got ${names.join(',')}`);
  return { buckets: names };
});

const payload = new Blob(['%PDF-1.4 hardening sprint 1'], { type: 'application/pdf' });
const testFile = `${companyId}/hardening-sprint1-${Date.now()}.pdf`;

await check('Upload attachment', async () => {
  const { error } = await supabase.storage.from('attachments').upload(testFile, payload, { upsert: true });
  if (error) throw error;
  return { path: testFile };
});

await check('Download attachment', async () => {
  const { data, error } = await supabase.storage.from('attachments').download(testFile);
  if (error) throw error;
  const text = await data!.text();
  if (!text.includes('hardening sprint 1')) throw new Error('Content mismatch');
  return { bytes: text.length };
});

await check('Public URL resolves', async () => {
  const { data } = supabase.storage.from('attachments').getPublicUrl(testFile);
  const r = await fetch(data.publicUrl);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { url: data.publicUrl, status: r.status };
});

await check('Signed URL works', async () => {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(testFile, 120);
  if (error) throw error;
  const r = await fetch(data!.signedUrl);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { signed: true, status: r.status };
});

await check('RLS blocks foreign company path upload', async () => {
  const foreign = '00000000-0000-0000-0000-000000000001/evil.txt';
  const { error } = await supabase.storage.from('attachments').upload(foreign, payload, { upsert: true });
  if (!error) throw new Error('Expected RLS denial');
  return { blocked: error.message };
});

await check('Delete attachment', async () => {
  const { error } = await supabase.storage.from('attachments').remove([testFile]);
  if (error) throw error;
  return { removed: testFile };
});

await check('New edge functions HEALTH', async () => {
  const out: Record<string, unknown> = {};
  const { data: health, error: hErr } = await supabase.functions.invoke('accounting-health', {
    body: { method: 'GET_HEALTH', company_id: companyId },
  });
  if (hErr) throw new Error(`accounting-health: ${hErr.message}`);
  out['accounting-health'] = health;
  for (const fn of ['seed-data', 'year-end-close']) {
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { method: 'HEALTH', company_id: companyId },
    });
    if (error) throw new Error(`${fn}: ${error.message}`);
    out[fn] = data;
  }
  return out;
});

const outPath = 'docs/ux/evidence/hardening-sprint1-storage.json';
fs.mkdirSync('docs/ux/evidence', { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), companyId, results }, null, 2));
console.log(JSON.stringify({ companyId, results, outPath }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
