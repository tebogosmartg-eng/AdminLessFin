/**
 * PAYE Variance Forensic Reconciliation V3.2.12
 * Target: Gross R35,460 / PAYE R6,067.93 / Variance R209.42
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ─── Official SARS tables (no AdminLess engine code) ─────────────────────────

const SARS_2025_2026 = {
  taxYearLabel: '2025/2026',
  ruleVersion: '2025.2.0',
  brackets: [
    { from: 0, to: 237100, rate: 0.18, base: 0 },
    { from: 237100, to: 370500, rate: 0.26, base: 42678 },
    { from: 370500, to: 512800, rate: 0.31, base: 77362 },
    { from: 512800, to: 673000, rate: 0.36, base: 121475 },
    { from: 673000, to: 857900, rate: 0.39, base: 179147 },
    { from: 857900, to: 1817000, rate: 0.41, base: 251258 },
    { from: 1817000, to: null, rate: 0.45, base: 644489 },
  ],
  rebates: { primary: 17235, secondary: 9444, tertiary: 3145 },
  medical: { main: 364, first: 364, additional: 246 },
};

const SARS_2026_2027 = {
  taxYearLabel: '2026/2027',
  ruleVersion: '2026.2.0',
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
  medical: { main: 376, first: 376, additional: 254 },
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function sarsBracketTax(
  annual: number,
  brackets: typeof SARS_2025_2026.brackets
): { tax: number; bracketFrom: number; bracketRate: number; bracketBase: number } {
  let bracket = brackets[0];
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (annual >= brackets[i].from) {
      bracket = brackets[i];
      break;
    }
  }
  const tax = round2(bracket.base + (annual - bracket.from) * bracket.rate);
  return { tax, bracketFrom: bracket.from, bracketRate: bracket.rate, bracketBase: bracket.base };
}

function sarsRebate(
  rebates: typeof SARS_2025_2026.rebates,
  age?: number | null
): number {
  let r = rebates.primary;
  if (age != null && age >= 65) r += rebates.secondary;
  if (age != null && age >= 75) r += rebates.tertiary;
  return r;
}

function sarsMedicalMonthly(dependants: number, med: typeof SARS_2025_2026.medical): number {
  if (dependants <= 0) return med.main; // engine behaviour
  if (dependants === 1) return round2(med.main + med.first);
  return round2(med.main + med.first + (dependants - 1) * med.additional);
}

function sarsMedicalMonthlyStrict(dependants: number, med: typeof SARS_2025_2026.medical, hasMedicalAid: boolean): number {
  if (!hasMedicalAid) return 0;
  return sarsMedicalMonthly(dependants, med);
}

type PayeSteps = {
  annualTaxable: number;
  annualTaxBeforeCredits: number;
  bracketFrom: number;
  annualRebate: number;
  annualMedicalCredits: number;
  annualTaxLiability: number;
  monthlyPaye: number;
  taxYear: string;
};

function independentPaye(
  monthlyTaxable: number,
  age: number | null | undefined,
  dependants: number,
  taxYear: typeof SARS_2025_2026 | typeof SARS_2026_2027,
  opts: { applyMedicalCredit: boolean; hasMedicalAid: boolean }
): PayeSteps {
  const annualTaxable = round2(monthlyTaxable * 12);
  const { tax, bracketFrom } = sarsBracketTax(annualTaxable, taxYear.brackets);
  const annualRebate = sarsRebate(taxYear.rebates, age);
  const monthlyMed = opts.applyMedicalCredit
    ? opts.hasMedicalAid
      ? sarsMedicalMonthly(dependants, taxYear.medical)
      : sarsMedicalMonthlyStrict(dependants, taxYear.medical, false)
    : 0;
  const annualMedical = round2(monthlyMed * 12);
  const annualTaxLiability = Math.max(0, round2(tax - annualRebate - annualMedical));
  const monthlyPaye = round2(annualTaxLiability / 12);
  return {
    annualTaxable,
    annualTaxBeforeCredits: tax,
    bracketFrom,
    annualRebate,
    annualMedicalCredits: annualMedical,
    annualTaxLiability,
    monthlyPaye,
    taxYear: taxYear.taxYearLabel,
  };
}

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

const TARGET = { gross: 35460, paye: 6067.93, variance: 209.42 };
const TARGET_RUN = 'ce81530b-bb33-4b1c-a176-987329c4296d';

function extractEngineSteps(snapshot: Record<string, unknown>) {
  const paye = (snapshot.engine_results as Array<Record<string, unknown>>)?.find(
    (e) => e.engine_id === 'paye'
  );
  const trail = (paye?.audit_trail as Array<Record<string, unknown>>) ?? [];
  const breakdown = paye?.breakdown as Record<string, number> | undefined;
  const medical = (snapshot.engine_results as Array<Record<string, unknown>>)?.find(
    (e) => e.engine_id === 'medical_tax_credit'
  );
  const medTrail = (medical?.audit_trail as Array<Record<string, unknown>>)?.[0];

  return {
    payeAmount: paye?.employee_amount as number,
    breakdown,
    steps: {
      annualise: trail.find((s) => s.step === 'annualise'),
      bracket_tax: trail.find((s) => s.step === 'bracket_tax'),
      rebate: trail.find((s) => s.step === 'rebate'),
      medical_credits_offset: trail.find((s) => s.step === 'medical_credits_offset'),
      monthly_paye: trail.find((s) => s.step === 'monthly_paye'),
      ytd_adjustment: trail.find((s) => s.step === 'ytd_adjustment'),
    },
    medical: {
      dependants: (medTrail?.inputs as Record<string, unknown>)?.dependants ?? 0,
      monthlyCredit: medical?.breakdown
        ? (medical.breakdown as Record<string, number>).monthlyCredit
        : undefined,
    },
    pipelineStart: (snapshot.audit_trail as Array<Record<string, unknown>>)?.find(
      (s) => s.step === 'pipeline_start'
    ),
  };
}

async function main() {
  const useLocal = process.argv.includes('--local') || process.env.USE_LOCAL_SNAPSHOT === '1';
  let detail: {
    run?: Record<string, unknown>;
    payslips?: Array<{
      id: string;
      employee_id: string;
      basic_salary: number;
      calculation_snapshot?: Record<string, unknown>;
      employees?: { first_name?: string; last_name?: string };
    }>;
  };

  const runId = process.env.PAYROLL_RUN_ID ?? TARGET_RUN;
  if (runId !== TARGET_RUN) {
    console.error(`ABORT: Wrong run loaded (${runId}). Expected ${TARGET_RUN}`);
    process.exit(1);
  }

  if (useLocal) {
    detail = JSON.parse(readFileSync('scripts/variance-snapshot.json', 'utf8'));
  } else {
    const env = readEnv();
    const supabase = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!);
    await supabase.auth.signInWithPassword({ email: env.E2E_EMAIL!, password: env.E2E_PASSWORD! });
    const { data: m } = await supabase.from('company_users').select('company_id').limit(1).single();
    const companyId = m!.company_id;

    const { data, error } = await supabase.functions.invoke('payroll', {
      body: { method: 'GET_RUN_DETAIL', company_id: companyId, runId },
    });
    if (error) throw error;
    detail = data as typeof detail;
  }

  const payslip = detail.payslips?.find((p) => {
    const snap = p.calculation_snapshot;
    const paye = (snap?.engine_results as Array<{ engine_id: string; employee_amount: number }>)?.find(
      (e) => e.engine_id === 'paye'
    );
    return (
      Math.abs(Number(snap?.gross_earnings) - TARGET.gross) < 0.01 &&
      Math.abs(Number(paye?.employee_amount) - TARGET.paye) < 0.01
    );
  });

  if (!payslip?.calculation_snapshot) {
    console.error('ABORT: No payslip with Gross R35,460 and PAYE R6,067.93 found.');
    process.exit(1);
  }

  const snap = payslip.calculation_snapshot;
  const gross = Number(snap.gross_earnings);
  const paye = extractEngineSteps(snap).payeAmount;

  // PHASE 1
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' ADMINLESS FIN — PAYE VARIANCE FORENSIC RECONCILIATION V3.2.12');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('── PHASE 1: IDENTITY VERIFICATION ──');
  console.log(`Payroll Run ID:  ${runId}`);
  console.log(`Payslip ID:      ${payslip.id}`);
  console.log(`Employee ID:     ${payslip.employee_id}`);
  console.log(`Employee Number: ${snap.employee_number}`);
  console.log(`Employee Name:   ${payslip.employees?.first_name} ${payslip.employees?.last_name}`);
  console.log(`Gross Earnings:  R${gross.toFixed(2)} ${Math.abs(gross - TARGET.gross) < 0.01 ? '✓' : '✗ ABORT'}`);
  console.log(`PAYE:            R${Number(paye).toFixed(2)} ${Math.abs(Number(paye) - TARGET.paye) < 0.01 ? '✓' : '✗ ABORT'}`);

  if (Math.abs(gross - TARGET.gross) >= 0.01 || Math.abs(Number(paye) - TARGET.paye) >= 0.01) {
    console.error('\nSTOP: Wrong payroll run loaded.');
    process.exit(1);
  }
  console.log('✓ Correct payroll run and payslip verified.\n');

  const eng = extractEngineSteps(snap);
  const rulesResult = snap.rules_engine_result as Record<string, unknown> | undefined;
  const lineItems = (rulesResult?.lineItems as Array<Record<string, unknown>>) ?? [];
  const hasMedicalAidLine = lineItems.some((l) => l.ruleId === 'medical_aid');
  const age = (eng.steps.rebate?.inputs as Record<string, unknown> | undefined)?.age as number | null;

  // PHASE 2
  console.log('── PHASE 2: ALL PAYE ENGINE INPUTS ──');
  const inputs = {
    grossRemuneration: gross,
    taxableRemuneration: Number(snap.taxable_earnings),
    cashRemuneration: gross,
    annualBonus: 0,
    bonusFrequency: null,
    commission: 0,
    overtime: 0,
    fringeBenefits: 'disabled',
    travelAllowance: 'disabled',
    retirementDeduction: 0,
    medicalDependants: eng.medical.dependants,
    medicalCreditsMonthly: eng.medical.monthlyCredit,
    medicalCreditsAnnual: eng.steps.medical_credits_offset?.result,
    medicalAidContributionsOnPayslip: hasMedicalAidLine,
    taxYear: snap.tax_year,
    ruleVersion: snap.rule_version,
    age: age ?? null,
    uifRemuneration: gross,
    sdlRemuneration: gross,
    ytdTaxableIncome: 0,
    ytdPayePaid: 0,
    previousPayrollPeriods: 0,
    annualisationMethod: 'monthly_taxable_income × 12',
    payeMode: (eng.steps.annualise?.inputs as Record<string, unknown>)?.payeMode ?? 'standard',
    payDate: (eng.pipelineStart?.inputs as Record<string, unknown>)?.payDate,
    payPeriodStart: detail.run?.pay_period_start,
    payPeriodEnd: detail.run?.pay_period_end,
  };
  console.log(JSON.stringify(inputs, null, 2));
  console.log('');

  // PHASE 3 — Independent SARS (correct tax year for pay date 2026-08-31)
  const monthlyTaxable = Number((eng.steps.annualise?.inputs as Record<string, unknown>)?.monthlyTaxableIncome);
  const dependants = Number(eng.medical.dependants);

  const indepCorrectYearWithEngineMedical = independentPaye(
    monthlyTaxable,
    age,
    dependants,
    SARS_2026_2027,
    { applyMedicalCredit: true, hasMedicalAid: true }
  );
  const indepCorrectYearNoMedical = independentPaye(
    monthlyTaxable,
    age,
    dependants,
    SARS_2026_2027,
    { applyMedicalCredit: true, hasMedicalAid: false }
  );
  const indepWrongYearEnginePath = independentPaye(
    monthlyTaxable,
    age,
    dependants,
    SARS_2025_2026,
    { applyMedicalCredit: true, hasMedicalAid: true }
  );

  console.log('── PHASE 3: INDEPENDENT SARS CALCULATION (2026/2027 — correct for pay date) ──');
  console.log('Scenario A: Correct year, no medical aid contributions (SARS-compliant):');
  console.log(JSON.stringify(indepCorrectYearNoMedical, null, 2));
  console.log(`\nExpected monthly PAYE (SARS 2026/2027, no medical credit): R${indepCorrectYearNoMedical.monthlyPaye.toFixed(2)}`);
  console.log(`Variance vs engine: R${round2(indepCorrectYearNoMedical.monthlyPaye - Number(paye)).toFixed(2)}`);
  console.log('');

  // Engine actual intermediate values
  const engineActual = {
    annualTaxable: eng.breakdown?.annualTaxableIncome ?? eng.steps.annualise?.result,
    annualTaxBeforeCredits: eng.breakdown?.annualTaxBeforeCredits ?? eng.steps.bracket_tax?.result,
    bracketFrom: (eng.steps.bracket_tax?.inputs as Record<string, unknown>)?.bracketFrom,
    annualRebate: eng.breakdown?.annualRebate ?? eng.steps.rebate?.result,
    annualMedicalCredits: eng.breakdown?.annualMedicalCredits ?? eng.steps.medical_credits_offset?.result,
    annualTaxLiability: eng.breakdown?.annualTaxLiability ?? (eng.steps.monthly_paye?.intermediate as Record<string, number>)?.annualTaxLiability,
    monthlyPaye: Number(paye),
    taxYear: snap.tax_year,
  };

  // PHASE 4 — Line by line compare (independent correct SARS vs engine)
  console.log('── PHASE 4: LINE-BY-LINE COMPARISON (Engine vs Independent SARS 2026/2027) ──');

  const comparisons: Array<{
    step: string;
    expected: number;
    actual: number;
    file?: string;
    function?: string;
    variable?: string;
    line?: number;
  }> = [
    {
      step: 'annualTaxableIncome',
      expected: indepCorrectYearNoMedical.annualTaxable,
      actual: Number(engineActual.annualTaxable),
    },
    {
      step: 'annualTaxBeforeCredits (bracket_tax)',
      expected: indepCorrectYearNoMedical.annualTaxBeforeCredits,
      actual: Number(engineActual.annualTaxBeforeCredits),
      file: 'supabase/functions/_shared/generatePayslips.ts',
      function: 'resolveTaxYearForDate',
      variable: 'taxYearConfig.brackets',
      line: 104,
    },
    {
      step: 'annualRebate',
      expected: indepCorrectYearNoMedical.annualRebate,
      actual: Number(engineActual.annualRebate),
    },
    {
      step: 'annualMedicalCredits',
      expected: indepCorrectYearNoMedical.annualMedicalCredits,
      actual: Number(engineActual.annualMedicalCredits),
    },
    {
      step: 'annualTaxLiability',
      expected: indepCorrectYearNoMedical.annualTaxLiability,
      actual: Number(engineActual.annualTaxLiability),
    },
    {
      step: 'monthlyPaye',
      expected: indepCorrectYearNoMedical.monthlyPaye,
      actual: Number(engineActual.monthlyPaye),
    },
  ];

  for (const c of comparisons) {
    const diff = round2(c.actual - c.expected);
    const match = Math.abs(diff) < 0.01 ? '✓' : '✗';
    console.log(`${match} ${c.step}`);
    console.log(`   Expected: R${Number(c.expected).toFixed(2)}`);
    console.log(`   Actual:   R${Number(c.actual).toFixed(2)}`);
    console.log(`   Diff:     R${diff.toFixed(2)}`);

    if (Math.abs(diff) >= 0.01) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log(' FIRST MATHEMATICAL DIVERGENCE — INVESTIGATION STOPPED');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log('── PHASE 5: ROOT CAUSE REPORT ──');
      const report = {
        file: c.file ?? 'src/lib/statutoryPayrollEngine/engines/payeEngine.ts',
        function: c.function ?? 'calculatePayeAmount',
        variable: c.variable ?? c.step,
        lineNumber: c.line ?? (c.step.includes('bracket') ? 63 : 130),
        currentValue: c.actual,
        expectedValue: c.expected,
        businessImpact: `Monthly PAYE under-deducted by R${TARGET.variance.toFixed(2)} (engine R${Number(paye).toFixed(2)} vs SARS-correct R${indepCorrectYearNoMedical.monthlyPaye.toFixed(2)}). Employee tax liability understated; EMP201 filing non-compliant.`,
        rootCause:
          c.step === 'annualTaxBeforeCredits (bracket_tax)'
            ? `Pay date ${inputs.payDate} falls in SARS 2026/2027 tax year but resolveTaxYearForDate returned no match; DEFAULT_TAX_YEAR fallback applied 2025/2026 brackets (base R77,362 @ 31% from R370,500) instead of 2026/2027 brackets (base R79,998 @ 31% from R383,100). Annual bracket tax overstated by R${round2(Number(engineActual.annualTaxBeforeCredits) - indepCorrectYearNoMedical.annualTaxBeforeCredits).toFixed(2)} before downstream offsets.`
            : c.step === 'annualMedicalCredits'
              ? 'Medical tax credit of R364/month applied with 0 dependants and no medical aid contribution on payslip. SARS §6A requires contributions to a registered medical scheme; credit should be R0.'
              : `Divergence at ${c.step}`,
      };
      console.log(JSON.stringify(report, null, 2));

      console.log('\n── VARIANCE RECONCILIATION ──');
      console.log(`Engine PAYE (actual):              R${Number(paye).toFixed(2)}`);
      console.log(`Independent SARS (2026/2027):      R${indepCorrectYearNoMedical.monthlyPaye.toFixed(2)}`);
      console.log(`Documented variance:               R${TARGET.variance.toFixed(2)}`);
      console.log(`Calculated variance:               R${round2(indepCorrectYearNoMedical.monthlyPaye - Number(paye)).toFixed(2)}`);
      console.log(`Variance match:                    ${Math.abs(round2(indepCorrectYearNoMedical.monthlyPaye - Number(paye)) - TARGET.variance) < 0.01 ? '✓' : '✗'}`);

      console.log('\n── SUPPLEMENTARY: Engine path verification (2025/2026 replay) ──');
      console.log(`Independent 2025/2026 (engine tax year): R${indepWrongYearEnginePath.monthlyPaye.toFixed(2)}`);
      console.log(`Matches engine: ${Math.abs(indepWrongYearEnginePath.monthlyPaye - Number(paye)) < 0.01 ? '✓' : '✗'}`);
      process.exit(0);
    }
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
