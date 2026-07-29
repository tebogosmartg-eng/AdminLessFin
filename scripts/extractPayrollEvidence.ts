import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function readEnvFile(path: string) {
  const content = readFileSync(path, 'utf8');
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    env[key] = value;
  }
  return env;
}

async function main() {
  const env = readEnvFile('.env');
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error('Missing E2E credentials in process env');

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !auth.user) throw authError ?? new Error('Authentication failed');

  const { data: membership, error: memberError } = await supabase
    .from('company_users')
    .select('company_id')
    .eq('user_id', auth.user.id)
    .limit(1)
    .single();
  if (memberError || !membership?.company_id) throw memberError ?? new Error('Company membership not found');
  const companyId = membership.company_id;

  const runId = process.env.PAYROLL_RUN_ID ?? 'e2627366-641b-4635-8191-61f4b344cf57';
  const invoke = async <T>(fn: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) throw error;
    if (data && typeof data === 'object' && 'error' in data) {
      throw new Error(String((data as { error?: string }).error ?? 'Unknown function error'));
    }
    return data as T;
  };

  const runDetail = await invoke<{
    run?: { journal_entry_id?: string };
    payslips?: Array<{
      id: string;
      employee_id: string;
      calculation_snapshot?: Record<string, unknown>;
    }>;
    journal_entry?: { journal_entry_items?: Array<{ type: 'debit' | 'credit'; amount: number; chart_of_accounts?: { name?: string } }> };
    audit_events?: Array<{ event_type: string }>;
  }>('payroll', { method: 'GET_RUN_DETAIL', company_id: companyId, runId });
  const summary = await invoke<Record<string, unknown>>('payroll', { method: 'GET_RUN_SUMMARY', company_id: companyId, runId });
  const register = await invoke<{ register?: unknown[] }>('payroll', { method: 'GET_RUN_REGISTER', company_id: companyId, runId });

  const payslip = runDetail.payslips?.[0];
  const history = payslip
    ? await invoke<unknown[]>('payroll', { method: 'GET_EMPLOYEE_PAYROLL_HISTORY', company_id: companyId, employeeId: payslip.employee_id })
    : [];

  const journalLines = runDetail.journal_entry?.journal_entry_items ?? [];
  const totalDebits = journalLines.filter((i) => i.type === 'debit').reduce((s, i) => s + i.amount, 0);
  const totalCredits = journalLines.filter((i) => i.type === 'credit').reduce((s, i) => s + i.amount, 0);

  const report = {
    runId,
    journalEntryId: runDetail.run?.journal_entry_id ?? null,
    summary,
    registerRow: register.register?.[0] ?? null,
    payslip: {
      id: payslip?.id ?? null,
      employeeNumber: payslip?.calculation_snapshot?.employee_number ?? null,
      taxYear: payslip?.calculation_snapshot?.tax_year ?? null,
      ruleVersion: payslip?.calculation_snapshot?.rule_version ?? null,
      totalEmployerContributions: payslip?.calculation_snapshot?.total_employer_contributions ?? null,
    },
    journal: {
      lines: journalLines,
      totalDebits,
      totalCredits,
      balanced: Math.abs(totalDebits - totalCredits) < 0.01,
    },
    auditEventTypes: (runDetail.audit_events ?? []).map((e) => e.event_type),
    historyFirst: history[0] ?? null,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
