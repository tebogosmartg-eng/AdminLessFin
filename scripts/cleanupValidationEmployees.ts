/**
 * V3.2.20 — Validation artifact cleanup.
 * Removes test employees created during certification probes.
 * Employees with payslip history cannot be deleted (FK); those are reported.
 *
 * Usage: E2E_EMAIL=... E2E_PASSWORD=... npx tsx scripts/cleanupValidationEmployees.ts
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

const VALIDATION_PATTERNS = [
  { first_name: 'ProdVal' },
  { first_name: 'Forensic' },
  { first_name: 'Val' },
];

async function invokeEmployees(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('employees', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const json = await ctx.json();
        if (json?.error) throw new Error(json.error);
      } catch { /* fall through */ }
    }
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data) throw new Error((data as { error: string }).error);
  return data;
}

async function main() {
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (authErr) throw authErr;
  const companyId = auth.user!.id;

  const { data: all } = await supabase
    .from('employees')
    .select('id, employee_number, first_name, last_name, created_at')
    .eq('company_id', companyId)
    .order('employee_number');

  const candidates = (all ?? []).filter((e) =>
    VALIDATION_PATTERNS.some((p) => e.first_name === p.first_name)
    || /^(CreateA|CreateB|Concurrent|Test)\d*/i.test(e.last_name)
    || e.last_name.includes('Test')
  );

  console.log(`Found ${candidates.length} validation candidate(s).`);
  const results: { employee_number: string; status: string; detail?: string }[] = [];

  for (const emp of candidates) {
    const blockers: string[] = [];
    for (const table of ['expense_claims'] as const) {
      const col = table === 'expense_claims' ? 'employee_id' : 'assigned_to_employee_id';
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(col, emp.id);
      if (error) blockers.push(`${table}:query-error`);
      else if (count && count > 0) blockers.push(`${table}(${count})`);
    }

    const { count: assetCount, error: assetErr } = await supabase
      .from('fixed_assets')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to_employee_id', emp.id);
    if (assetErr) blockers.push('fixed_assets:query-error');
    else if (assetCount && assetCount > 0) blockers.push(`fixed_assets(${assetCount})`);

    const { data: payrollHist } = await supabase.functions.invoke('payroll', {
      body: { method: 'GET_EMPLOYEE_PAYROLL_HISTORY', company_id: companyId, employeeId: emp.id },
    });
    if (Array.isArray(payrollHist) && payrollHist.length > 0) {
      blockers.push(`payslips(${payrollHist.length})`);
    }

    if (blockers.length) {
      results.push({
        employee_number: emp.employee_number,
        status: 'BLOCKED',
        detail: blockers.join(', '),
      });
      continue;
    }

    try {
      await invokeEmployees({ method: 'DELETE', company_id: companyId, employeeId: emp.id });
      results.push({ employee_number: emp.employee_number, status: 'DELETED' });
    } catch (err) {
      results.push({
        employee_number: emp.employee_number,
        status: 'FAILED',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log('\n=== CLEANUP RESULTS ===');
  for (const r of results) {
    console.log(`${r.status} | ${r.employee_number}${r.detail ? ` — ${r.detail}` : ''}`);
  }

  const failed = results.filter((r) => r.status !== 'DELETED');
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
