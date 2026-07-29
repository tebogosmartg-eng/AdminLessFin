/**
 * Employee Number Root Cause Forensics — V3.2.18
 * Traces live database state and insert pipeline without modifying data (read-only by default).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const email = process.env.E2E_EMAIL!;
const password = process.env.E2E_PASSWORD!;

const supabase = createClient(url, anonKey);

async function main() {
  const dryRun = !process.argv.includes('--create-test');
  console.log('=== EMPLOYEE NUMBER FORENSICS ===');
  console.log('Mode:', dryRun ? 'READ-ONLY' : 'WILL CREATE TEST EMPLOYEE');

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) throw new Error(`AUTH: ${authErr.message}`);
  console.log('\n[AUTH] OK user:', auth.user?.id);

  const { data: memberships, error: memErr } = await supabase
    .from('company_users')
    .select('company_id, role, companies(id, name)')
    .eq('user_id', auth.user!.id);
  if (memErr) throw new Error(`COMPANY: ${memErr.message}`);

  for (const m of memberships ?? []) {
    const companyId = m.company_id;
    const companyName = (m.companies as { name?: string } | null)?.name ?? companyId;
    console.log(`\n========== COMPANY: ${companyName} (${companyId}) role=${m.role} ==========`);

    // Phase 1 proxy: direct column probe
    const { data: directEmps, error: directErr } = await supabase
      .from('employees')
      .select('id, employee_number, first_name, last_name, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    if (directErr) {
      console.log('[PHASE 1/3 DIRECT DB] BLOCKED:', directErr.message, directErr.code);
    } else {
      const total = directEmps?.length ?? 0;
      const withNum = directEmps?.filter((e) => e.employee_number).length ?? 0;
      const nullNum = directEmps?.filter((e) => e.employee_number === null).length ?? 0;
      const blankNum = directEmps?.filter((e) => e.employee_number === '').length ?? 0;
      const numbers = directEmps?.map((e) => e.employee_number).filter(Boolean) ?? [];
      const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
      console.log('[PHASE 3 DIRECT DB]', { total, withNum, nullNum, blankNum, duplicates: [...new Set(dupes)] });
      console.log('[PHASE 3 SAMPLE]', directEmps?.slice(0, 5));
    }

    // Edge function GET
    const { data: edgeEmps, error: edgeErr } = await supabase.functions.invoke('employees', {
      body: { method: 'GET', company_id: companyId },
    });
    if (edgeErr) {
      console.log('[EDGE GET] TRANSPORT ERROR:', edgeErr.message);
    } else if (edgeEmps && typeof edgeEmps === 'object' && 'error' in edgeEmps) {
      console.log('[EDGE GET] FUNCTION ERROR:', (edgeEmps as { error: string }).error);
    } else if (Array.isArray(edgeEmps)) {
      const withNum = edgeEmps.filter((e) => e.employee_number).length;
      const withoutNum = edgeEmps.filter((e) => !e.employee_number).length;
      console.log('[EDGE GET]', { total: edgeEmps.length, withNum, withoutNum });
      console.log('[EDGE GET SAMPLE]', edgeEmps.slice(0, 3).map((e) => ({
        id: e.id,
        employee_number: e.employee_number,
        name: `${e.first_name} ${e.last_name}`,
      })));
    } else {
      console.log('[EDGE GET] UNEXPECTED:', edgeEmps);
    }

    // RPC test (consumes sequence if allowed!)
    const { data: rpcNum, error: rpcErr } = await supabase.rpc('generate_employee_number', {
      p_company_id: companyId,
    });
    console.log('[RPC generate_employee_number]', {
      error: rpcErr?.message ?? null,
      code: rpcErr?.code ?? null,
      result: rpcNum,
    });

    // Numbering policy
    const { data: policy, error: policyErr } = await supabase.functions.invoke('employees', {
      body: { method: 'GET_NUMBERING_POLICY', company_id: companyId },
    });
    console.log('[NUMBERING POLICY]', policyErr?.message ?? policy);

    if (!dryRun && ['owner', 'admin'].includes(m.role)) {
      console.log('\n[PHASE 2 CREATE TEST] Invoking POST...');
      const testPayload = {
        first_name: 'Forensic',
        last_name: `Test${Date.now()}`,
        employment_type: 'permanent',
        start_date: new Date().toISOString().split('T')[0],
      };
      const { data: created, error: createErr } = await supabase.functions.invoke('employees', {
        body: { method: 'POST', company_id: companyId, employeeData: testPayload },
      });
      console.log('[POST] transport error:', createErr?.message ?? null);
      console.log('[POST] response:', JSON.stringify(created, null, 2));

      if (created && typeof created === 'object' && 'id' in created) {
        const { data: verify } = await supabase
          .from('employees')
          .select('id, employee_number')
          .eq('id', (created as { id: string }).id)
          .single();
        console.log('[POST DB VERIFY]', verify);
      }
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
