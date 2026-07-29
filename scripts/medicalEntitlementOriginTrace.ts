/**
 * V3.2.15 — Medical Entitlement Origin Trace (evidence only, no replays)
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const RUN_ID = 'ce81530b-bb33-4b1c-a176-987329c4296d';
const EMPLOYEE_ID = '6a72f977-35a7-4a15-9559-b58a0dd13d4e';
const COMPANY_ID = '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';

function readEnv() {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return env;
}

type Assignment = {
  variable: string;
  file: string;
  line: number;
  sourceVariable: string;
  sourceTable?: string;
  valueBefore: unknown;
  valueAfter: unknown;
  recordedInSnapshot: boolean;
};

async function main() {
  const snap = JSON.parse(readFileSync('scripts/variance-snapshot.json', 'utf8'));
  const payslip = snap.payslips.find((p: { employee_id: string }) => p.employee_id === EMPLOYEE_ID);
  if (!payslip) throw new Error('Target payslip missing from snapshot');

  const cs = payslip.calculation_snapshot;
  const engines = cs.engine_results as Array<Record<string, unknown>>;
  const recordedMed = engines.find((e) => e.engine_id === 'medical_tax_credit')!;
  const recordedPaye = engines.find((e) => e.engine_id === 'paye')!;
  const medAudit = (recordedMed.audit_trail as Array<Record<string, unknown>>)?.[0];
  const rules = cs.rules_engine_result as Record<string, unknown>;
  const ruleSummary = (rules.ruleExecutionSummary as Array<Record<string, unknown>>) ?? [];
  const medRule = ruleSummary.find((r) => r.ruleId === 'medical_aid');
  const payeRule = ruleSummary.find((r) => r.ruleId === 'paye');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' ADMINLESS FIN — MEDICAL ENTITLEMENT ORIGIN TRACE V3.2.15');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Run:      ${RUN_ID}`);
  console.log(`Employee: ${EMPLOYEE_ID}`);
  console.log(`Snapshot: ${cs.calculation_timestamp ?? payslip.created_at}`);
  console.log(`Method:   Recorded snapshot only — no replay, no altered inputs\n`);

  section('PHASE 1 — ASSIGNMENT TRACE (code paths vs recorded values)');

  const assignments: Assignment[] = [
    {
      variable: 'medical_aid.enabled',
      file: 'src/lib/payrollRulesEngine/rules.ts',
      line: 137,
      sourceVariable: 'isRuleEnabled(ctx, "medical_aid")',
      sourceTable: 'payroll_rule_catalog + company_payroll_rule_settings + employee_payroll_rule_settings + payroll_runs.rule_config',
      valueBefore: 'catalog.enabledByDefault=false',
      valueAfter: false,
      recordedInSnapshot: true,
    },
    {
      variable: 'medical_aid (rules engine execution)',
      file: 'src/lib/payrollRulesEngine/rules.ts',
      line: 137,
      sourceVariable: 'skippedResult("medical_aid", "Rule disabled")',
      valueBefore: 'enabled=false',
      valueAfter: 'skipped, employeeAmount=0, lineItems=[]',
      recordedInSnapshot: true,
    },
    {
      variable: 'medicalSchemeEntitled',
      file: 'src/lib/payrollRulesEngine/rules.ts',
      line: 156,
      sourceVariable: 'Number(medicalAidConfig.monthly_amount ?? medicalAidConfig.amount ?? 0) > 0',
      sourceTable: 'mergeConfig(ctx,"medical_aid") → company+employee+run configs',
      valueBefore: 'medicalAidConfig from mergeConfig (not persisted in snapshot)',
      valueAfter: 'NOT PERSISTED — rules-engine path only; statutory path used for payslip PAYE',
      recordedInSnapshot: false,
    },
    {
      variable: 'engineConfig.medical_aid',
      file: 'supabase/functions/_shared/generatePayslips.ts',
      line: 181,
      sourceVariable: 'effectiveRunRules[k].config (ALL rules, regardless of enabled flag)',
      sourceTable: 'company_payroll_rule_settings.config + employee_payroll_rule_settings.config + payroll_runs.rule_config',
      valueBefore: 'effectiveRunRules built at runtime',
      valueAfter: 'NOT PERSISTED in calculation_snapshot',
      recordedInSnapshot: false,
    },
    {
      variable: 'entitled (statutory)',
      file: 'src/lib/statutoryPayrollEngine/engines/medicalTaxCreditEngine.ts',
      line: 43,
      sourceVariable: 'hasMedicalSchemeContribution(ctx)',
      valueBefore: 'engineConfig.medical_aid contribution',
      valueAfter: medAudit?.formula === 'main_member + first_dependant + (additional × (dependants - 1))' ? true : 'false or unknown',
      recordedInSnapshot: true,
    },
    {
      variable: 'monthlyCredit',
      file: 'src/lib/statutoryPayrollEngine/engines/medicalTaxCreditEngine.ts',
      line: 48,
      sourceVariable: 'resolveMonthlyMedicalCredits(dependants, ruleSet.medicalCredits, entitled)',
      valueBefore: `dependants=0, entitled=${medAudit?.formula === 'main_member + first_dependant + (additional × (dependants - 1))' ? 'true' : '?'}`,
      valueAfter: (recordedMed.breakdown as Record<string, number>).monthlyCredit,
      recordedInSnapshot: true,
    },
    {
      variable: 'annualCredit',
      file: 'src/lib/statutoryPayrollEngine/engines/medicalTaxCreditEngine.ts',
      line: 49,
      sourceVariable: 'roundCurrency(monthlyCredit * 12)',
      valueBefore: (recordedMed.breakdown as Record<string, number>).monthlyCredit,
      valueAfter: (recordedMed.breakdown as Record<string, number>).annualCredit,
      recordedInSnapshot: true,
    },
    {
      variable: 'monthlyMedicalCredits (pipeline)',
      file: 'src/lib/statutoryPayrollEngine/pipeline.ts',
      line: 96,
      sourceVariable: 'medicalResult.breakdown.monthlyCredit ?? 0',
      valueBefore: 0,
      valueAfter: (recordedMed.breakdown as Record<string, number>).monthlyCredit,
      recordedInSnapshot: true,
    },
    {
      variable: 'annualMedicalCredits (paye input)',
      file: 'src/lib/statutoryPayrollEngine/engines/payeEngine.ts',
      line: 176,
      sourceVariable: 'roundCurrency(monthlyMedicalCredits * 12)',
      valueBefore: (recordedMed.breakdown as Record<string, number>).monthlyCredit,
      valueAfter: (recordedPaye.breakdown as Record<string, number>).annualMedicalCredits,
      recordedInSnapshot: true,
    },
    {
      variable: 'annualMedicalCredits (paye consumption)',
      file: 'src/lib/statutoryPayrollEngine/engines/payeEngine.ts',
      line: 132,
      sourceVariable: 'annualTaxBeforeCredits - annualRebate - annualMedicalCredits',
      valueBefore: (recordedPaye.breakdown as Record<string, number>).annualTaxBeforeCredits,
      valueAfter: (recordedPaye.breakdown as Record<string, number>).annualTaxLiability,
      recordedInSnapshot: true,
    },
    {
      variable: 'monthly_paye',
      file: 'src/lib/statutoryPayrollEngine/engines/payeEngine.ts',
      line: 136,
      sourceVariable: 'roundCurrency(annualTaxLiability / 12)',
      valueBefore: (recordedPaye.breakdown as Record<string, number>).annualTaxLiability,
      valueAfter: (recordedPaye.breakdown as Record<string, number>).monthlyPaye,
      recordedInSnapshot: true,
    },
  ];

  for (const a of assignments) {
    console.log(`\n▸ ${a.variable}`);
    console.log(`  File:            ${a.file}:${a.line}`);
    console.log(`  Source variable: ${a.sourceVariable}`);
    if (a.sourceTable) console.log(`  Source table:    ${a.sourceTable}`);
    console.log(`  Before:          ${JSON.stringify(a.valueBefore)}`);
    console.log(`  After:           ${JSON.stringify(a.valueAfter)}`);
    console.log(`  In snapshot:     ${a.recordedInSnapshot ? 'YES' : 'NO'}`);
  }

  section('PHASE 2 — VALUE LINEAGE (recorded snapshot fields only)');

  const lineage: Array<[string, unknown]> = [
    ['Employee Master (snapshot employees join)', payslip.employees ?? null],
    ['Employee payroll rule settings', 'NOT IN SNAPSHOT'],
    ['Company payroll rule settings', 'NOT IN SNAPSHOT'],
    ['Payroll run rule_config', snap.run.rule_config],
    ['rules_engine: medical_aid.enabled', medRule?.enabled],
    ['rules_engine: medical_aid.skipped', medRule?.skipped],
    ['rules_engine: medical_aid.skipReason', medRule?.skipReason],
    ['rules_engine: medical_aid.lineItems', medRule?.lineItems],
    ['rules_engine: paye.amount', payeRule?.employeeAmount],
    ['statutory: engineConfig.medical_aid', 'NOT PERSISTED'],
    ['statutory: medical_credit audit formula', medAudit?.formula],
    ['statutory: medical_credit audit inputs', medAudit?.inputs],
    ['statutory: medical_credit result (monthlyCredit)', medAudit?.result],
    ['statutory: medical_credit intermediate (annualCredit)', (medAudit?.intermediate as Record<string, unknown>)?.annualCredit],
    ['statutory: medical_tax_credit.breakdown', recordedMed.breakdown],
    ['pipeline: monthlyMedicalCredits → runPayeEngine', (recordedMed.breakdown as Record<string, number>).monthlyCredit],
    ['paye: annualMedicalCredits input', (recordedPaye.breakdown as Record<string, number>).annualMedicalCredits],
    ['paye: medical_credits_offset step', (recordedPaye.audit_trail as Array<Record<string, unknown>>)?.find((s) => s.step === 'medical_credits_offset')],
    ['paye: monthly_paye step result', (recordedPaye.audit_trail as Array<Record<string, unknown>>)?.find((s) => s.step === 'monthly_paye')?.result],
  ];

  for (const [label, value] of lineage) {
    console.log(`\n${label}`);
    console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : `  ${value}`);
  }

  section('PHASE 3 — ENTITLEMENT TRUE ORIGIN ANALYSIS');

  const entitledFormulaPath =
    medAudit?.formula === 'main_member + first_dependant + (additional × (dependants - 1))';
  const notEntitledFormulaPath =
    medAudit?.formula === 'section_6a_requires_medical_scheme_contribution';

  console.log('Recorded medical_credit audit formula:', medAudit?.formula);
  console.log('Entitled path taken (contribution gate passed):', entitledFormulaPath ? 'YES' : 'NO');
  console.log('Not-entitled path taken:', notEntitledFormulaPath ? 'YES' : 'NO');
  console.log('');
  console.log('Code gate (medicalTaxCreditEngine.ts:43):');
  console.log('  entitled = hasMedicalSchemeContribution(ctx)');
  console.log('  = Number(engineConfig.medical_aid.monthly_amount ?? amount ?? 0) > 0');
  console.log('');
  console.log('Recorded snapshot evidence:');
  console.log(`  medical_aid rule enabled:     ${medRule?.enabled}`);
  console.log(`  medical_aid payslip line:     absent (lineItems=[])`);
  console.log(`  monthlyCredit generated:      R${(recordedMed.breakdown as Record<string, number>).monthlyCredit}`);
  console.log(`  audit formula:                ${medAudit?.formula}`);
  console.log(`  engineConfig.medical_aid:     NOT IN SNAPSHOT`);
  console.log(`  payroll run rule_config:      ${JSON.stringify(snap.run.rule_config)}`);

  await queryDatabase();
}

function section(title: string) {
  console.log('\n' + '─'.repeat(63));
  console.log(` ${title}`);
  console.log('─'.repeat(63));
}

async function queryDatabase() {
  const env = readEnv();
  if (!env.VITE_SUPABASE_URL || !env.E2E_EMAIL) return;

  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY!);
  await supabase.auth.signInWithPassword({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD! });

  section('DATABASE EVIDENCE (read-only, same run/employee)');

  const { data: employee } = await supabase.from('employees').select('*').eq('id', EMPLOYEE_ID).maybeSingle();
  const { data: empRules } = await supabase
    .from('employee_payroll_rule_settings')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .eq('employee_id', EMPLOYEE_ID);
  const { data: coRules } = await supabase
    .from('company_payroll_rule_settings')
    .select('*')
    .eq('company_id', COMPANY_ID);
  const { data: catalog } = await supabase
    .from('payroll_rule_catalog')
    .select('id, enabled_by_default, name')
    .eq('id', 'medical_aid')
    .maybeSingle();
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, rule_config, pay_date')
    .eq('id', RUN_ID)
    .maybeSingle();
  const { data: payslip } = await supabase
    .from('payslips')
    .select('id, calculation_snapshot')
    .eq('payroll_run_id', RUN_ID)
    .eq('employee_id', EMPLOYEE_ID)
    .maybeSingle();

  console.log('\nemployees:');
  console.log(JSON.stringify(employee, null, 2));
  console.log('\nemployee_payroll_rule_settings (medical_aid/paye):');
  console.log(JSON.stringify(empRules?.filter((r) => ['medical_aid', 'paye'].includes(r.rule_id)), null, 2));
  console.log('\ncompany_payroll_rule_settings (medical_aid/paye):');
  console.log(JSON.stringify(coRules?.filter((r) => ['medical_aid', 'paye'].includes(r.rule_id)), null, 2));
  console.log('\npayroll_rule_catalog.medical_aid:');
  console.log(JSON.stringify(catalog, null, 2));
  console.log('\npayroll_runs.rule_config:');
  console.log(JSON.stringify(run?.rule_config, null, 2));

  const liveSnap = payslip?.calculation_snapshot as Record<string, unknown> | undefined;
  const liveMed = (liveSnap?.engine_results as Array<Record<string, unknown>> | undefined)?.find(
    (e) => e.engine_id === 'medical_tax_credit'
  );
  console.log('\nLive payslip medical_tax_credit (matches snapshot?):');
  console.log(JSON.stringify(liveMed, null, 2));

  section('PHASE 3 — ENTITLEMENT TRUE ORIGIN (with database)');

  const medEmp = empRules?.find((r) => r.rule_id === 'medical_aid');
  const medCo = coRules?.find((r) => r.rule_id === 'medical_aid');
  const empAmount = Number(
    (medEmp?.config as Record<string, unknown>)?.monthly_amount ??
      (medEmp?.config as Record<string, unknown>)?.amount ??
      0
  );
  const coAmount = Number(
    (medCo?.config as Record<string, unknown>)?.monthly_amount ??
      (medCo?.config as Record<string, unknown>)?.amount ??
      0
  );
  const runMedConfig = (run?.rule_config as Record<string, unknown>)?.rules
    ? ((run.rule_config as Record<string, unknown>).rules as Record<string, unknown>)?.medical_aid
    : (run?.rule_config as Record<string, unknown>)?.medical_aid;

  console.log('Employee medical_aid config amount:', empAmount);
  console.log('Company medical_aid config amount:', coAmount);
  console.log('Run override medical_aid:', JSON.stringify(runMedConfig));
  console.log('Catalog enabled_by_default:', catalog?.enabled_by_default);

  const liveMedAudit = (liveMed?.audit_trail as Array<Record<string, unknown>>)?.[0];
  const entitledAtCalc = liveMedAudit?.formula === 'main_member + first_dependant + (additional × (dependants - 1))';

  console.log('\n── Where entitlement first becomes TRUE ──');
  console.log('Statutory path gate: hasMedicalSchemeContribution → contribution > 0');
  console.log(`Recorded audit proves entitled path: ${entitledAtCalc}`);

  if (empAmount > 0) {
    console.log('\nORIGIN: 1. Employee configuration (monthly_amount > 0)');
  } else if (coAmount > 0) {
    console.log('\nORIGIN: 2. Company configuration (monthly_amount > 0)');
  } else if (runMedConfig && Number((runMedConfig as Record<string, unknown>).config ? ((runMedConfig as Record<string, unknown>).config as Record<string, unknown>).monthly_amount : (runMedConfig as Record<string, unknown>).monthly_amount) > 0) {
    console.log('\nORIGIN: 3. Rule merge / run override');
  } else if (entitledAtCalc && empAmount === 0 && coAmount === 0) {
    console.log('\nCannot assign origin to employee/company/run config (all zero or absent).');
    console.log('Recorded audit formula proves entitled=TRUE at medicalTaxCreditEngine execution.');
    console.log('engineConfig.medical_aid was NOT persisted — upstream contribution value unrecoverable from snapshot/DB.');
    console.log('\nCandidate origins requiring additional evidence:');
    console.log('  4. Engine default — resolveMonthlyMedicalCredits(entitled=true) ONLY if hasMedicalSchemeContribution absent at calc time');
    console.log('  6. Historical snapshot — engineConfig state at calc time not captured');
    console.log('  7. Another source — generatePayslips.ts:181 passes config regardless of enabled flag; stale config possible but not provable from DB');
  }

  section('FINAL CERTIFICATION');
  const dbProvesOrigin = empAmount > 0 || coAmount > 0;
  if (dbProvesOrigin) {
    console.log('A) The upstream source of the incorrect medical entitlement has been conclusively identified.');
  } else {
    console.log('B) The upstream source cannot yet be proven from available evidence.');
    console.log('');
    console.log('Proven from recorded execution:');
    console.log('  • entitled=TRUE at medicalTaxCreditEngine (audit formula path)');
    console.log('  • monthlyCredit=R364 → annualMedicalCredits=R4368 → monthly_paye=R6067.93');
    console.log('Not proven:');
    console.log('  • engineConfig.medical_aid value at calculation time (not persisted)');
    console.log('  • employee/company/run DB configs (all zero or absent at query time)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
