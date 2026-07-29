/**
 * Tax Year Resolution Forensics V3.2.10
 * Loads live payroll run and compares statutory constants across all sources.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import {
  RULE_SET_2025_2026,
  getRuleSetByLabel,
  mapDbRowToRuleSet,
  resolveRuleSetForDate,
  resolveRuleSetForPayroll,
} from '../src/lib/statutoryPayrollEngine/registry';
import { resolveTaxYearForDate, mapTaxYearFromDb } from '../src/lib/payrollRulesEngine';
import { taxYearConfigToRuleSet } from '../src/lib/statutoryPayrollEngine/adapter';

function readEnvFile(path: string) {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
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

/** SARS published 2026/2027 tax year (SARS "2027" year) — Budget 25 Feb 2026 */
const SARS_2027 = {
  taxYearLabel: '2026/2027',
  ruleVersion: '2026.2.0',
  effectiveFrom: '2026-03-01',
  effectiveTo: '2027-02-28',
  brackets: [
    { from: 0, to: 245100, rate: 0.18, base: 0 },
    { from: 245100, to: 383100, rate: 0.26, base: 44118 },
    { from: 383100, to: 530200, rate: 0.31, base: 79998 },
    { from: 530200, to: 695800, rate: 0.36, base: 125599 },
    { from: 695800, to: 887000, rate: 0.39, base: 185215 },
    { from: 887000, to: 1878600, rate: 0.41, base: 259783 },
    { from: 1878600, to: null, rate: 0.45, base: 666339 },
  ],
  rebates: { primary: 17820, secondary: 9765, tertiary: 3249 },
  medicalCredits: { mainMember: 376, firstDependant: 376, additionalDependant: 254 },
  uifCeilingMonthly: 17712,
  uifRate: 0.01,
  sdlRate: 0.01,
  sdlExemptionAnnualRemuneration: 500000,
  retirementDeductionCapAnnual: 350000,
  retirementDeductionMaxRate: 0.275,
};

const DEFAULT_TAX_YEAR = {
  taxYearLabel: '2025/2026',
  effectiveFrom: '2025-03-01',
  effectiveTo: '2026-02-28',
};

type ConstantCheck = {
  name: string;
  db: unknown;
  registry: unknown;
  snapshot: unknown;
  engineInput: unknown;
  expected: unknown;
};

function bracketsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function extractSnapshotConstants(snapshot: Record<string, unknown> | undefined) {
  if (!snapshot) return {};
  const payeEngine = (snapshot.engine_results as Array<Record<string, unknown>> | undefined)?.find(
    (e) => e.engine_id === 'paye'
  );
  const bracketStep = (payeEngine?.audit_trail as Array<Record<string, unknown>> | undefined)?.find(
    (s) => s.step === 'bracket_tax'
  );
  const rebateStep = (payeEngine?.audit_trail as Array<Record<string, unknown>> | undefined)?.find(
    (s) => s.step === 'rebate'
  );
  const pipelineStart = (snapshot.audit_trail as Array<Record<string, unknown>> | undefined)?.find(
    (s) => s.step === 'pipeline_start'
  );
  const uifEngine = (snapshot.engine_results as Array<Record<string, unknown>> | undefined)?.find(
    (e) => e.engine_id === 'uif' || e.engine_id === 'uif_employee'
  );
  const sdlEngine = (snapshot.engine_results as Array<Record<string, unknown>> | undefined)?.find(
    (e) => e.engine_id === 'sdl'
  );
  const retirementEngine = (snapshot.engine_results as Array<Record<string, unknown>> | undefined)?.find(
    (e) => e.engine_id === 'retirement_deduction'
  );

  return {
    taxYearLabel: snapshot.tax_year,
    ruleVersion: snapshot.rule_version,
    brackets: bracketStep?.inputs ? (bracketStep.inputs as Record<string, unknown>) : null,
    primaryRebate: (rebateStep?.inputs as Record<string, unknown> | undefined)?.primary,
    uifCeiling: (uifEngine?.audit_trail as Array<Record<string, unknown>> | undefined)?.[0]?.inputs,
    sdlRules: (sdlEngine?.audit_trail as Array<Record<string, unknown>> | undefined)?.[0]?.inputs,
    retirementLimits: (retirementEngine?.audit_trail as Array<Record<string, unknown>> | undefined)?.[0]?.inputs,
    pipelineTaxYear: (pipelineStart?.inputs as Record<string, unknown> | undefined)?.taxYear,
    pipelineRuleVersion: (pipelineStart?.inputs as Record<string, unknown> | undefined)?.ruleVersion,
  };
}

async function main() {
  const env = { ...readEnvFile('.env'), ...process.env };
  const supabase = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!);
  const email = env.E2E_EMAIL;
  const password = env.E2E_PASSWORD;
  if (!email || !password) throw new Error('Missing E2E credentials');

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !auth.user) throw authError ?? new Error('Auth failed');

  const { data: membership } = await supabase
    .from('company_users')
    .select('company_id')
    .eq('user_id', auth.user.id)
    .limit(1)
    .single();
  const companyId = membership?.company_id;
  if (!companyId) throw new Error('No company membership');

  const runId = process.env.PAYROLL_RUN_ID ?? 'e2627366-641b-4635-8191-61f4b344cf57';

  const invoke = async <T>(body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('payroll', { body });
    if (error) throw error;
    if (data && typeof data === 'object' && 'error' in data) {
      throw new Error(String((data as { error?: string }).error));
    }
    return data as T;
  };

  const runDetail = await invoke<{
    run?: {
      id: string;
      pay_period_start: string;
      pay_period_end: string;
      pay_date: string;
      status: string;
    };
    payslips?: Array<{ calculation_snapshot?: Record<string, unknown> }>;
  }>({ method: 'GET_RUN_DETAIL', company_id: companyId, runId });

  const run = runDetail.run;
  if (!run) throw new Error('Payroll run not found');

  const { data: taxYearRows, error: taxErr } = await supabase
    .from('payroll_tax_year_config')
    .select('*')
    .eq('country_code', 'ZA')
    .eq('is_active', true);
  if (taxErr) throw taxErr;

  const dbRows = taxYearRows ?? [];
  const mappedDbConfigs = dbRows.map(mapTaxYearFromDb);
  const resolvedConfig = resolveTaxYearForDate(run.pay_date, mappedDbConfigs);
  const fallbackUsed = !resolvedConfig;
  const taxYearConfig = resolvedConfig ?? {
    ...mapTaxYearFromDb({}),
    ...DEFAULT_TAX_YEAR,
    countryCode: 'ZA',
    brackets: RULE_SET_2025_2026.brackets,
    rebates: RULE_SET_2025_2026.rebates,
    medicalCredits: RULE_SET_2025_2026.medicalCredits,
    uifCeilingMonthly: RULE_SET_2025_2026.uifCeilingMonthly,
    sdlRate: RULE_SET_2025_2026.sdlRate,
    uifRate: RULE_SET_2025_2026.uifRate,
  };

  const dbMatch = dbRows.find(
    (r) => run.pay_date >= r.effective_from && run.pay_date <= r.effective_to
  );
  const registryResolved = resolveRuleSetForPayroll(run.pay_date, dbRows);
  const registryBuiltin = resolveRuleSetForDate(run.pay_date);
  const engineRuleSet = taxYearConfigToRuleSet(taxYearConfig);

  const snapshot = runDetail.payslips?.[0]?.calculation_snapshot;
  const snap = extractSnapshotConstants(snapshot);

  const expectedForPayDate = run.pay_date >= SARS_2027.effectiveFrom ? SARS_2027 : getRuleSetByLabel('2025/2026')!;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' ADMINLESS FIN — TAX YEAR RESOLUTION FORENSICS V3.2.10');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('── LIVE PAYROLL RUN ──');
  console.log(`Run ID:          ${runId}`);
  console.log(`Status:          ${run.status}`);
  console.log(`Payroll Period:  ${run.pay_period_start} → ${run.pay_period_end}`);
  console.log(`Pay Date:        ${run.pay_date}`);
  console.log(`Fallback Used:   ${fallbackUsed ? 'YES — DEFAULT_TAX_YEAR (2025/2026)' : 'NO'}`);
  console.log(`Resolved SARS Tax Year (engine):  ${engineRuleSet.taxYearLabel}`);
  console.log(`Resolved Rule Version:          ${engineRuleSet.ruleVersion}`);
  console.log(`Snapshot tax_year:              ${snap.taxYearLabel ?? 'N/A'}`);
  console.log(`Snapshot rule_version:          ${snap.ruleVersion ?? 'N/A'}`);
  console.log(`DB rows available:              ${dbRows.map((r) => r.tax_year_label).join(', ') || 'none'}`);
  console.log(`DB match for pay date:          ${dbMatch?.tax_year_label ?? 'NONE'}`);
  console.log('');

  console.log('── EXPECTED vs ACTUAL (SARS 2027 / 2026/2027 tax year) ──');
  const summaryRows: [string, unknown, unknown][] = [
    ['Tax Year Label', SARS_2027.taxYearLabel, engineRuleSet.taxYearLabel],
    ['Rule Version', SARS_2027.ruleVersion, engineRuleSet.ruleVersion],
    ['Primary Rebate', SARS_2027.rebates.primary, engineRuleSet.rebates.primary],
    ['Secondary Rebate', SARS_2027.rebates.secondary, engineRuleSet.rebates.secondary],
    ['Tertiary Rebate', SARS_2027.rebates.tertiary, engineRuleSet.rebates.tertiary],
    ['Medical Main', SARS_2027.medicalCredits.mainMember, engineRuleSet.medicalCredits.mainMember],
    ['Medical First Dep', SARS_2027.medicalCredits.firstDependant, engineRuleSet.medicalCredits.firstDependant],
    ['Medical Add Dep', SARS_2027.medicalCredits.additionalDependant, engineRuleSet.medicalCredits.additionalDependant],
    ['UIF Ceiling', SARS_2027.uifCeilingMonthly, engineRuleSet.uifCeilingMonthly],
    ['UIF Rate', SARS_2027.uifRate, engineRuleSet.uifRate],
    ['SDL Rate', SARS_2027.sdlRate, engineRuleSet.sdlRate],
    ['SDL Exemption Annual', SARS_2027.sdlExemptionAnnualRemuneration, engineRuleSet.sdlExemptionAnnualRemuneration],
    ['Retirement Cap Annual', SARS_2027.retirementDeductionCapAnnual, engineRuleSet.retirementDeductionCapAnnual],
    ['Retirement Max Rate', SARS_2027.retirementDeductionMaxRate, engineRuleSet.retirementDeductionMaxRate],
    ['Tax Brackets', JSON.stringify(SARS_2027.brackets), JSON.stringify(engineRuleSet.brackets)],
  ];
  for (const [label, expected, actual] of summaryRows) {
    const match = JSON.stringify(expected) === JSON.stringify(actual) ? '✓' : '✗';
    console.log(`${match} ${label}`);
    console.log(`   Expected: ${typeof expected === 'string' && expected.length > 80 ? expected.slice(0, 80) + '...' : expected}`);
    console.log(`   Actual:   ${typeof actual === 'string' && String(actual).length > 80 ? String(actual).slice(0, 80) + '...' : actual}`);
  }
  console.log('');

  const dbRuleSet = dbMatch ? mapDbRowToRuleSet(dbMatch) : null;

  const checks: ConstantCheck[] = [
    {
      name: 'taxYearLabel',
      db: dbMatch?.tax_year_label ?? null,
      registry: registryResolved.taxYearLabel,
      snapshot: snap.taxYearLabel ?? snap.pipelineTaxYear,
      engineInput: engineRuleSet.taxYearLabel,
      expected: SARS_2027.taxYearLabel,
    },
    {
      name: 'ruleVersion',
      db: dbMatch ? mapDbRowToRuleSet(dbMatch).ruleVersion : null,
      registry: registryResolved.ruleVersion,
      snapshot: snap.ruleVersion ?? snap.pipelineRuleVersion,
      engineInput: engineRuleSet.ruleVersion,
      expected: SARS_2027.ruleVersion,
    },
    {
      name: 'brackets',
      db: dbRuleSet?.brackets ?? null,
      registry: registryResolved.brackets,
      snapshot: snap.brackets,
      engineInput: engineRuleSet.brackets,
      expected: SARS_2027.brackets,
    },
    {
      name: 'rebates.primary',
      db: dbRuleSet?.rebates.primary ?? null,
      registry: registryResolved.rebates.primary,
      snapshot: snap.primaryRebate,
      engineInput: engineRuleSet.rebates.primary,
      expected: SARS_2027.rebates.primary,
    },
    {
      name: 'rebates.secondary',
      db: dbRuleSet?.rebates.secondary ?? null,
      registry: registryResolved.rebates.secondary,
      snapshot: null,
      engineInput: engineRuleSet.rebates.secondary,
      expected: SARS_2027.rebates.secondary,
    },
    {
      name: 'rebates.tertiary',
      db: dbRuleSet?.rebates.tertiary ?? null,
      registry: registryResolved.rebates.tertiary,
      snapshot: null,
      engineInput: engineRuleSet.rebates.tertiary,
      expected: SARS_2027.rebates.tertiary,
    },
    {
      name: 'medicalCredits.mainMember',
      db: dbRuleSet?.medicalCredits.mainMember ?? null,
      registry: registryResolved.medicalCredits.mainMember,
      snapshot: null,
      engineInput: engineRuleSet.medicalCredits.mainMember,
      expected: SARS_2027.medicalCredits.mainMember,
    },
    {
      name: 'medicalCredits.firstDependant',
      db: dbRuleSet?.medicalCredits.firstDependant ?? null,
      registry: registryResolved.medicalCredits.firstDependant,
      snapshot: null,
      engineInput: engineRuleSet.medicalCredits.firstDependant,
      expected: SARS_2027.medicalCredits.firstDependant,
    },
    {
      name: 'medicalCredits.additionalDependant',
      db: dbRuleSet?.medicalCredits.additionalDependant ?? null,
      registry: registryResolved.medicalCredits.additionalDependant,
      snapshot: null,
      engineInput: engineRuleSet.medicalCredits.additionalDependant,
      expected: SARS_2027.medicalCredits.additionalDependant,
    },
    {
      name: 'uifCeilingMonthly',
      db: dbRuleSet?.uifCeilingMonthly ?? null,
      registry: registryResolved.uifCeilingMonthly,
      snapshot: snap.uifCeiling,
      engineInput: engineRuleSet.uifCeilingMonthly,
      expected: SARS_2027.uifCeilingMonthly,
    },
    {
      name: 'sdlRate',
      db: dbRuleSet?.sdlRate ?? null,
      registry: registryResolved.sdlRate,
      snapshot: snap.sdlRules,
      engineInput: engineRuleSet.sdlRate,
      expected: SARS_2027.sdlRate,
    },
    {
      name: 'sdlExemptionAnnualRemuneration',
      db: null,
      registry: registryResolved.sdlExemptionAnnualRemuneration,
      snapshot: null,
      engineInput: engineRuleSet.sdlExemptionAnnualRemuneration,
      expected: SARS_2027.sdlExemptionAnnualRemuneration,
    },
    {
      name: 'retirementDeductionCapAnnual',
      db: null,
      registry: registryResolved.retirementDeductionCapAnnual,
      snapshot: snap.retirementLimits,
      engineInput: engineRuleSet.retirementDeductionCapAnnual,
      expected: SARS_2027.retirementDeductionCapAnnual,
    },
  ];

  console.log('── CONSTANT VERIFICATION (stop at first divergence) ──\n');

  for (const check of checks) {
    const engineMatchesExpected =
      check.name === 'brackets'
        ? bracketsEqual(check.engineInput, check.expected)
        : check.engineInput === check.expected;

    console.log(`▸ ${check.name}`);
    console.log(`  Database:            ${JSON.stringify(check.db)}`);
    console.log(`  Rule Registry:       ${JSON.stringify(check.registry)}`);
    console.log(`  Calculation Snapshot:${JSON.stringify(check.snapshot)}`);
    console.log(`  Engine Input:        ${JSON.stringify(check.engineInput)}`);
    console.log(`  Expected SARS:       ${JSON.stringify(check.expected)}`);

    if (!engineMatchesExpected) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log(' FIRST DIVERGENCE DETECTED — INVESTIGATION STOPPED');
      console.log('═══════════════════════════════════════════════════════════════\n');
      const report = {
        file: check.name === 'taxYearLabel'
          ? 'supabase/functions/_shared/generatePayslips.ts'
          : check.name === 'ruleVersion'
            ? 'src/lib/statutoryPayrollEngine/registry/taxYears.ts'
            : check.name === 'brackets'
              ? 'src/lib/statutoryPayrollEngine/registry/taxYears.ts'
              : check.name.startsWith('rebates')
                ? 'src/lib/statutoryPayrollEngine/registry/taxYears.ts'
                : check.name.startsWith('medical')
                  ? 'src/lib/statutoryPayrollEngine/registry/taxYears.ts'
                  : 'src/lib/statutoryPayrollEngine/registry/taxYears.ts',
        function: check.name === 'taxYearLabel' ? 'resolveTaxYearForDate / DEFAULT_TAX_YEAR fallback' : 'mapDbRowToRuleSet / VERSIONED_RULE_SETS',
        variable: check.name,
        currentValue: check.engineInput,
        expectedValue: check.expected,
        reason: check.name === 'taxYearLabel'
          ? `Pay date ${run.pay_date} falls in SARS 2026/2027 tax year (1 Mar 2026 – 28 Feb 2027) but no matching payroll_tax_year_config row exists; engine falls back to hardcoded DEFAULT_TAX_YEAR 2025/2026`
          : `Stale ${check.name} from prior tax year rule set applied because tax year resolution failed`,
        businessImpact: 'All PAYE calculations for this payroll run use incorrect SARS statutory parameters — non-compliant with SARS PAYE-GEN-01-G21 (2027)',
        rootCause: 'Missing 2026/2027 row in payroll_tax_year_config and absent RULE_SET_2026_2027 in statutory rule registry; resolveTaxYearForDate returns undefined and DEFAULT_TAX_YEAR fallback applies 2025/2026 values',
      };
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    console.log('  ✓ Engine input matches expected SARS value\n');
  }

  console.log('All constants verified — no divergence detected.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
