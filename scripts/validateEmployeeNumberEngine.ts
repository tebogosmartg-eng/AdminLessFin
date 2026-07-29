/**
 * Employee Number Engine — post-implementation validation (V3.2.18).
 * Run after migrations are applied and employees edge function is deployed.
 *
 * Usage:
 *   E2E_EMAIL=... E2E_PASSWORD=... npx tsx scripts/validateEmployeeNumberEngine.ts
 *   npx tsx scripts/validateEmployeeNumberEngine.ts --concurrency=10
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch { /* optional */ }
  }
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;
const concurrency = Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 10);

const supabase = createClient(url, anonKey);

type Employee = { id: string; employee_number?: string; first_name: string; last_name: string };

async function main() {
  const failures: string[] = [];
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) throw authErr;

  const { data: memberships } = await supabase
    .from('company_users')
    .select('company_id, role')
    .eq('user_id', auth.user!.id)
    .in('role', ['owner', 'admin']);

  const companyId = memberships?.[0]?.company_id;
  if (!companyId) throw new Error('No admin company membership');

  // Schema probes
  const { error: colErr } = await supabase.from('employees').select('employee_number').limit(1);
  if (colErr) failures.push(`SCHEMA: employee_number column missing — ${colErr.message}`);

  const { error: rpcErr } = await supabase.rpc('preview_employee_number', { p_company_id: companyId });
  if (rpcErr) failures.push(`SCHEMA: preview_employee_number RPC missing — ${rpcErr.message}`);

  // Existing employees
  const { data: existing, error: getErr } = await supabase.functions.invoke('employees', {
    body: { method: 'GET', company_id: companyId },
  });
  if (getErr) failures.push(`GET: ${getErr.message}`);
  else if (!Array.isArray(existing)) failures.push('GET: unexpected response');
  else {
    const unnumbered = existing.filter((e: Employee) => !e.employee_number?.trim());
    const numbers = existing.map((e: Employee) => e.employee_number).filter(Boolean);
    const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    if (unnumbered.length) failures.push(`EXISTING: ${unnumbered.length} employees without numbers`);
    if (dupes.length) failures.push(`EXISTING: duplicate numbers: ${[...new Set(dupes)].join(', ')}`);
    console.log('Existing employees:', { total: existing.length, unnumbered: unnumbered.length, duplicates: dupes.length });
  }

  // Concurrent creates
  console.log(`Creating ${concurrency} employees concurrently...`);
  const stamp = Date.now();
  const creates = await Promise.all(
    Array.from({ length: concurrency }, (_, i) =>
      supabase.functions.invoke('employees', {
        body: {
          method: 'POST',
          company_id: companyId,
          employeeData: {
            first_name: 'Val',
            last_name: `Concurrent${stamp}_${i}`,
            employment_type: 'permanent',
            start_date: new Date().toISOString().split('T')[0],
          },
        },
      }),
    ),
  );

  const created: Employee[] = [];
  for (const [i, res] of creates.entries()) {
    if (res.error) failures.push(`CREATE[${i}]: ${res.error.message}`);
    else if (res.data && typeof res.data === 'object' && 'error' in res.data) {
      failures.push(`CREATE[${i}]: ${(res.data as { error: string }).error}`);
    } else if (res.data && typeof res.data === 'object' && 'id' in res.data) {
      created.push(res.data as Employee);
    } else {
      failures.push(`CREATE[${i}]: unexpected response`);
    }
  }

  const createdNumbers = created.map((e) => e.employee_number).filter(Boolean);
  const createdDupes = createdNumbers.filter((n, i) => createdNumbers.indexOf(n) !== i);
  const createdMissing = created.filter((e) => !e.employee_number?.trim());

  if (createdMissing.length) failures.push(`CREATE: ${createdMissing.length} created without employee_number`);
  if (createdDupes.length) failures.push(`CREATE: duplicate numbers in batch: ${[...new Set(createdDupes)].join(', ')}`);

  console.log('Concurrent create:', {
    requested: concurrency,
    succeeded: created.length,
    numbered: createdNumbers.length,
    unique: new Set(createdNumbers).size,
  });

  // Cleanup test employees
  for (const emp of created) {
    await supabase.functions.invoke('employees', {
      body: { method: 'DELETE', company_id: companyId, employeeId: emp.id },
    });
  }

  console.log('\n=== VALIDATION RESULT ===');
  if (failures.length) {
    console.error('FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log('PASSED — employee number engine certified for this environment');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
