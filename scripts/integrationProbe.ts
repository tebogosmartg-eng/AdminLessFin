/**
 * V3.2.20 — Downstream integration probe (read-only diagnostics).
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

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  const { data: auth } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  const companyId = auth!.user!.id;

  // Global search
  for (const q of ['EMP-000001', 'Tebogo', 'EMP-000005']) {
    const { data, error } = await supabase.functions.invoke('global-search', {
      body: { company_id: companyId, query: q },
    });
    const empHits = Array.isArray(data) ? data.filter((r: { type?: string }) => r.type === 'Employee') : [];
    console.log(`GLOBAL-SEARCH "${q}":`, error?.message ?? `employees=${empHits.length}`, empHits.map((e: { title: string }) => e.title));
  }

  // Employees SEARCH (control)
  const { data: es } = await supabase.functions.invoke('employees', {
    body: { method: 'SEARCH', company_id: companyId, query: 'EMP-000001' },
  });
  console.log('EMPLOYEES SEARCH EMP-000001:', Array.isArray(es) ? es.length : es);

  // Payroll period reports via client path
  const start = '2026-01-01';
  const end = '2026-12-31';
  const { data: runs } = await supabase.functions.invoke('payroll', {
    body: { method: 'GET_RUNS', company_id: companyId },
  });
  const finalized = (runs as { id: string; status: string; pay_date: string }[] | null)?.filter(
    (r) => ['finalized', 'paid'].includes(r.status),
  ) ?? [];
  console.log('Finalized runs:', finalized.length);

  const { data: periodReports, error: prErr } = await supabase.functions.invoke('payroll', {
    body: { method: 'GET_PERIOD_REPORTS', company_id: companyId, start_date: start, end_date: end },
  });
  if (prErr) console.log('GET_PERIOD_REPORTS error:', prErr.message);
  else {
    const slips = (periodReports as { payslips?: { employee_number?: string; employee: string }[] })?.payslips ?? [];
    console.log('GET_PERIOD_REPORTS payslips:', slips.length);
    const nums = slips.map((p) => p.employee_number);
    const allEmpFormat = nums.every((n) => /^EMP-\d+$/i.test(n ?? ''));
    console.log('Sample numbers:', slips.slice(0, 3).map((p) => ({ employee: p.employee, employee_number: p.employee_number })));
    console.log('All employee_number values EMP-format:', allEmpFormat, nums);
  }

  // Validation cleanup candidates
  const { data: testEmps } = await supabase
    .from('employees')
    .select('id, employee_number, first_name, last_name')
    .eq('company_id', companyId)
    .or('first_name.eq.ProdVal,first_name.eq.Forensic,last_name.ilike.%Concurrent%,last_name.ilike.%CreateA%,last_name.ilike.%CreateB%,last_name.ilike.%Test%');
  console.log('Cleanup candidates:', testEmps);

  for (const emp of testEmps ?? []) {
    const { data, error } = await supabase.functions.invoke('employees', {
      body: { method: 'DELETE', company_id: companyId, employeeId: emp.id },
    });
    console.log(`DELETE ${emp.employee_number}:`, error?.message ?? (data && typeof data === 'object' && 'error' in data ? (data as { error: string }).error : 'ok'));
  }
}

main().catch(console.error);
