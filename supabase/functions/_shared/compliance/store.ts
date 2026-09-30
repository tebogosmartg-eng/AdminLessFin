/**
 * Compliance data access (service role). Every query is filtered by the
 * company taken from the verified request, and every error is surfaced:
 * a failed read must never look like "no obligations".
 */
// deno-lint-ignore-file no-explicit-any
import type { RawCompanyRecords } from './facts.ts';
import type { CompanyMember } from './access.ts';
import type { CycleRow, ObligationRow, RuleVersion } from './types.ts';

type Admin = any;

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not read ${what}: ${res.error.message}`);
  return res.data;
}

export type ComplianceProfileRow = {
  id: string;
  company_id: string;
  status: 'draft' | 'completed';
  questionnaire_version: number;
  revision: number;
  answers: Record<string, unknown>;
  fact_snapshot: Record<string, unknown>;
  completed_at: string | null;
  completed_by: string | null;
  updated_by: string | null;
  last_evaluated_at: string | null;
  state_version: number;
};

export type ComplianceState = {
  profile: ComplianceProfileRow | null;
  obligations: ObligationRow[];
  cycles: CycleRow[];
};

const OBLIGATION_COLS =
  'id, company_id, rule_code, rule_version_id, applicability, evaluated_applicability, missing_facts, ' +
  'override_not_applicable, override_reason, override_by, override_at, override_facts_hash, override_conflict, ' +
  'responsible_user_id, reminder_offsets, tracking_from, retired, why, created_at, updated_at';

const CYCLE_COLS =
  'id, company_id, obligation_id, kind, period_key, opens_on, due_date, valid_from, expiry_date, status, ' +
  'time_signal, rule_version_id, completed_at, completed_by, completion_note, why, created_at, updated_at';

export async function loadState(admin: Admin, companyId: string): Promise<ComplianceState> {
  const [profile, obligations, cycles] = await Promise.all([
    admin.from('compliance_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    admin.from('compliance_obligations').select(OBLIGATION_COLS).eq('company_id', companyId),
    admin.from('compliance_obligation_cycles').select(CYCLE_COLS).eq('company_id', companyId),
  ]);
  return {
    profile: must(profile, 'the compliance profile') as ComplianceProfileRow | null,
    obligations: (must(obligations, 'obligations') ?? []) as ObligationRow[],
    cycles: (must(cycles, 'obligation periods') ?? []) as CycleRow[],
  };
}

/**
 * The newest version of every rule for a country that is already in effect.
 * A rule whose newest version is retired is returned as retired.
 */
export async function loadRules(admin: Admin, country: string, today: string): Promise<RuleVersion[]> {
  const res = await admin
    .from('compliance_rule_versions')
    .select(
      'id, rule_code, version, status, reviewed, country_code, category_code, industry_code, authority_code, ' +
        'title, summary, condition, schedule, evidence, priority, reminder_offsets, effective_from, effective_to',
    )
    .eq('country_code', country)
    .lte('effective_from', today)
    .order('rule_code', { ascending: true })
    .order('version', { ascending: false });
  const rows = (must(res, 'compliance rules') ?? []) as RuleVersion[];
  const latest = new Map<string, RuleVersion>();
  for (const r of rows) if (!latest.has(r.rule_code)) latest.set(r.rule_code, r);
  return [...latest.values()];
}

export async function loadRuleVersionsById(admin: Admin, ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const res = await admin
    .from('compliance_rule_versions')
    .select('id, rule_code, version, status, reviewed, category_code, industry_code, authority_code, title, summary, schedule, evidence, priority, provenance, review_due')
    .in('id', ids);
  return new Map<string, any>((must<any[] | null>(res, 'rule details') ?? []).map((r: any) => [r.id, r]));
}

export async function loadHolidays(admin: Admin, country: string): Promise<Set<string>> {
  const res = await admin.from('compliance_public_holidays').select('holiday_date').eq('country_code', country);
  return new Set((must<Array<{ holiday_date: string }> | null>(res, 'public holidays') ?? []).map((r) => r.holiday_date));
}

export async function loadReference(admin: Admin) {
  const [industries, categories, authorities] = await Promise.all([
    admin.from('compliance_industries').select('code, name, active').order('name'),
    admin.from('compliance_categories').select('code, name, sort_order').order('sort_order'),
    admin.from('compliance_authorities').select('code, name, website'),
  ]);
  return {
    industries: (must(industries, 'industries') ?? []) as Array<{ code: string; name: string; active: boolean }>,
    categories: (must(categories, 'categories') ?? []) as Array<{ code: string; name: string; sort_order: number }>,
    authorities: (must(authorities, 'authorities') ?? []) as Array<{ code: string; name: string; website: string }>,
  };
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Counts and single rows only; never full lists. */
export async function loadRawRecords(admin: Admin, companyId: string, today: string): Promise<RawCompanyRecords> {
  const [master, employees, payrollRun, year] = await Promise.all([
    admin
      .from('efs_company_master_data')
      .select('company_profile, addresses, tax_registrations')
      .eq('company_id', companyId)
      .maybeSingle(),
    admin
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .or('employment_status.is.null,employment_status.eq.active')
      .or(`end_date.is.null,end_date.gte.${today}`),
    admin.from('payroll_runs').select('id').eq('company_id', companyId).limit(1),
    admin
      .from('financial_years')
      .select('end_date')
      .eq('company_id', companyId)
      .order('end_date', { ascending: false })
      .limit(1),
  ]);
  const m = must(master, 'company master data') as any;
  if (employees.error) throw new Error(`Could not count employees: ${employees.error.message}`);
  const runs = must(payrollRun, 'payroll runs') as any[];
  const years = must(year, 'financial years') as any[];
  const profile = m?.company_profile ?? {};
  const addresses = m?.addresses ?? {};
  const tax = m?.tax_registrations ?? {};
  return {
    registration_number: text(profile.registration_number),
    vat_number: text(tax.vat_number),
    master_entity_type: text(profile.entity_type),
    nature_of_business: text(profile.nature_of_business),
    address_on_file:
      text(addresses.physical_address) ?? text(addresses.business_address) ?? text(addresses.registered_office),
    paye_number: text(tax.paye_number),
    active_employee_count: employees.count ?? 0,
    has_payroll_runs: (runs ?? []).length > 0,
    financial_year_end_date: years?.[0]?.end_date ?? null,
  };
}

export async function loadMembers(admin: Admin, companyId: string): Promise<Array<CompanyMember & { name: string | null }>> {
  const res = await admin.from('company_users').select('user_id, role').eq('company_id', companyId);
  const members = (must(res, 'company members') ?? []) as CompanyMember[];
  const ids = members.map((m) => m.user_id);
  const names = new Map<string, string | null>();
  if (ids.length) {
    const p = await admin.from('profiles').select('id, full_name').in('id', ids);
    for (const row of must<Array<{ id: string; full_name: string | null }> | null>(p, 'member names') ?? []) {
      names.set(row.id, row.full_name ?? null);
    }
  }
  return members.map((m) => ({ ...m, name: names.get(m.user_id) ?? null }));
}

export async function callerMembership(admin: Admin, userId: string, companyId: string) {
  const res = await admin
    .from('company_users')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();
  return must(res, 'your company access') as { role: string } | null;
}

export class ComplianceStateChanged extends Error {}

export async function applyPlan(
  admin: Admin,
  companyId: string,
  expectedState: number,
  plan: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await admin.rpc('compliance_apply_plan', {
    p_company_id: companyId,
    p_expected_state: expectedState,
    p_plan: plan,
  });
  if (error) {
    if (/compliance_state_changed/.test(error.message)) throw new ComplianceStateChanged(error.message);
    throw new Error(`Could not save compliance changes: ${error.message}`);
  }
  return Number(data);
}
