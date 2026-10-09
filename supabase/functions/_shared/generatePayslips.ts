/**
 * Server-side payslip generation using the Payroll Rules Engine.
 */

import {
  executePayrollRules,
  buildEffectiveCompanyRules,
  mergeRunRuleConfig,
  buildStatutoryEngineConfig,
  mapTaxYearFromDb,
  resolveTaxYearForDate,
} from './payrollRulesEngine/index.ts';
import { periodsPerYearFor, salaryForPayPeriod } from './payrollRulesEngine/paye.ts';
import {
  executeStatutoryPipeline,
  mapRulesToStatutoryEngines,
} from './statutoryPayrollEngine/pipeline.ts';
import { buildCalculationSnapshot } from './statutoryPayrollEngine/audit.ts';
import { taxYearConfigToRuleSet } from './statutoryPayrollEngine/adapter.ts';
import {
  assemblePayComponents,
  isComponentEffective,
  mergePayComponents,
} from './payrollRulesEngine/payComponents.ts';
import {
  aggregateCompanyRemunerationYtd,
  aggregateEmployeeYtd,
  applyProRata,
  coveredDays,
  employmentProRataFactor,
  estimateCompanyAnnualRemuneration,
  isEmployeeActiveInPeriod,
  packageConfigForPayPeriod,
  proRataMethodOf,
  proRatePackageConfig,
  resolveEmployeeAgeDetail,
  uifRemunerationMonthToDate,
} from './payrollRulesEngine/periodEmployment.ts';

const STATUTORY_RULE_IDS = new Set([
  'paye',
  'uif',
  'uif_employer',
  'sdl',
  'bonus_tax',
  'termination_tax',
  'medical_tax_credit',
  'directors_paye',
]);

const FINALIZED_RUN_STATUSES = ['finalized', 'paid'];
/** PostgREST returns at most this many rows per request; prior payslips are read in pages. */
const PAGE_SIZE = 1000;

/**
 * Prior finalised runs that count towards this run's year to date: same tax year,
 * paid on or before this run's pay date, not this run, and not reversed without
 * being reopened (reverse_payroll_run_atomic leaves those 'finalized' with
 * output_metadata.cancelled = true).
 */
async function loadPriorRunPayslips(supabaseAdmin, companyId, run, taxYearConfig) {
  const { data: runs, error } = await supabaseAdmin
    .from('payroll_runs')
    .select('id, status, pay_date, pay_period_start, pay_period_end, output_metadata')
    .eq('company_id', companyId)
    .in('status', FINALIZED_RUN_STATUSES)
    .neq('id', run.id)
    .gte('pay_date', taxYearConfig.effectiveFrom)
    .lte('pay_date', run.pay_date);
  if (error) throw error;
  const priorRuns = (runs ?? []).filter((r) => r.output_metadata?.cancelled !== true);
  if (!priorRuns.length) return { priorRuns, payslips: [] };

  const payDateByRun = new Map(priorRuns.map((r) => [r.id, r.pay_date]));
  const payslips = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: pageError } = await supabaseAdmin
      .from('payslips')
      .select(
        'id, employee_id, payroll_run_id, ' +
          'taxable_earnings:calculation_snapshot->taxable_earnings, ' +
          'gross_earnings:calculation_snapshot->gross_earnings, ' +
          'engine_results:calculation_snapshot->engine_results, ' +
          'period_employment:calculation_snapshot->period_employment'
      )
      .eq('company_id', companyId)
      .in('payroll_run_id', priorRuns.map((r) => r.id))
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (pageError) throw pageError;
    for (const row of data ?? []) {
      payslips.push({
        employee_id: row.employee_id,
        payroll_run_id: row.payroll_run_id,
        pay_date: payDateByRun.get(row.payroll_run_id) ?? null,
        calculation_snapshot: {
          taxable_earnings: row.taxable_earnings,
          gross_earnings: row.gross_earnings,
          engine_results: row.engine_results,
          period_employment: row.period_employment,
        },
      });
    }
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return { priorRuns, payslips };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function fetchPayrollRun(supabaseAdmin, runId, companyId) {
  const { data, error } = await supabaseAdmin
    .from('payroll_runs')
    .select('id, status, rule_config, pay_period_start, pay_period_end, pay_date, journal_entry_id, pay_frequency')
    .eq('id', runId)
    .eq('company_id', companyId)
    .single();

  if (error) throw error;
  return { ...data, rule_config: data.rule_config ?? {}, pay_frequency: data.pay_frequency ?? 'monthly' };
}

export async function loadPayrollRulesContext(supabaseAdmin, companyId, run) {
  const payDate = run.pay_date;

  const [
    catalogResult,
    companySettingsResult,
    employeeSettingsResult,
    taxYearsResult,
    employeesResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('payroll_rule_catalog')
      .select('id, enabled_by_default, name, category, company_configurable, employee_configurable, calculation_order, payslip_label, description')
      .order('calculation_order'),
    supabaseAdmin.from('company_payroll_rule_settings').select('rule_id, enabled, config').eq('company_id', companyId),
    supabaseAdmin.from('employee_payroll_rule_settings').select('employee_id, rule_id, enabled, config').eq('company_id', companyId),
    supabaseAdmin.from('payroll_tax_year_config').select('*').eq('country_code', 'ZA').eq('is_active', true),
    supabaseAdmin.from('employees').select('*').eq('company_id', companyId),
  ]);

  if (catalogResult.error) throw catalogResult.error;
  if (companySettingsResult.error) throw companySettingsResult.error;
  if (employeeSettingsResult.error) throw employeeSettingsResult.error;
  if (taxYearsResult.error) throw taxYearsResult.error;
  if (employeesResult.error) throw employeesResult.error;

  const catalogRows = catalogResult.data ?? [];
  const companyRules = buildEffectiveCompanyRules(
    catalogRows,
    (companySettingsResult.data ?? []).map((s) => ({ rule_id: s.rule_id, enabled: s.enabled, config: s.config ?? {} }))
  );

  const runOverrides = run.rule_config?.rules ?? run.rule_config ?? {};
  const effectiveRunRules = mergeRunRuleConfig(companyRules, runOverrides);

  const taxYearRows = (taxYearsResult.data ?? []).map(mapTaxYearFromDb);
  const taxYearConfig = resolveTaxYearForDate(payDate, taxYearRows);
  if (!taxYearConfig) {
    throw new Error(
      `No payroll_tax_year_config row matches pay date ${payDate}. Cannot resolve SARS tax year.`
    );
  }

  const employeeSettingsMap = {};
  for (const row of employeeSettingsResult.data ?? []) {
    if (!employeeSettingsMap[row.employee_id]) employeeSettingsMap[row.employee_id] = {};
    employeeSettingsMap[row.employee_id][row.rule_id] = {
      enabled: row.enabled,
      config: row.config ?? {},
    };
  }

  const periodStart = run.pay_period_start;
  const periodEnd = run.pay_period_end;
  // A run pays the employees on its pay frequency (monthly, fortnightly or weekly).
  const payFrequency = run.pay_frequency ?? 'monthly';
  const periodsPerYear = periodsPerYearFor(payFrequency);
  // Company setting on the basic-salary rule: calendar days (default) or working days.
  const proRataMethod = proRataMethodOf(companyRules.basic_salary?.config?.pro_rata_method);
  const activeEmployees = (employeesResult.data ?? []).filter((e) =>
    (e.salary_period ?? 'monthly') === payFrequency &&
    isEmployeeActiveInPeriod(e, periodStart, periodEnd)
  );

  const [recurringResult, periodResult, prior] = await Promise.all([
    supabaseAdmin
      .from('employee_pay_components')
      .select('employee_id, component_code, config, effective_from, effective_to, active')
      .eq('company_id', companyId)
      .eq('active', true),
    supabaseAdmin
      .from('payroll_period_inputs')
      .select('employee_id, component_code, config')
      .eq('company_id', companyId)
      .eq('payroll_run_id', run.id),
    // Prior finalised payslips in the tax year: year-to-date PAYE and the SDL estimate.
    loadPriorRunPayslips(supabaseAdmin, companyId, run, taxYearConfig),
  ]);
  if (recurringResult.error) throw recurringResult.error;
  if (periodResult.error) throw periodResult.error;

  const ytdPayslips = prior.payslips;
  const currentPeriodEstimatedGross = activeEmployees.reduce((sum, employee) => {
    if (!employee.salary_amount) return sum;
    const factor = employmentProRataFactor(employee, periodStart, periodEnd, proRataMethod);
    return (
      sum +
      applyProRata(
        salaryForPayPeriod(employee.salary_amount, employee.salary_period ?? 'monthly', periodsPerYear),
        factor
      )
    );
  }, 0);

  const companyAnnualRemuneration = estimateCompanyAnnualRemuneration({
    priorRemuneration: aggregateCompanyRemunerationYtd(ytdPayslips),
    currentRemuneration: currentPeriodEstimatedGross,
    coveredDays: coveredDays([
      ...prior.priorRuns,
      { pay_period_start: periodStart, pay_period_end: periodEnd },
    ]),
  });

  return {
    companyRules,
    runOverrides,
    effectiveRunRules,
    taxYearConfig,
    employeeSettingsMap,
    activeEmployees,
    catalogRows,
    recurringComponents: recurringResult.data ?? [],
    periodInputs: periodResult.data ?? [],
    ytdPayslips,
    companyAnnualRemuneration,
    payFrequency,
    periodsPerYear,
    proRataMethod,
  };
}

export async function generatePayslipsWithRulesEngine(supabaseAdmin, {
  companyId,
  runId,
  run,
  createdBy,
}) {
  const ctx = await loadPayrollRulesContext(supabaseAdmin, companyId, run);

  const { data: existingPayslips } = await supabaseAdmin
    .from('payslips')
    .select('id')
    .eq('payroll_run_id', runId)
    .eq('company_id', companyId);

  if (existingPayslips?.length) {
    const ids = existingPayslips.map((p) => p.id);
    await supabaseAdmin.from('payslip_items').delete().in('payslip_id', ids);
    await supabaseAdmin.from('payslips').delete().in('id', ids);
  }

  const results = [];
  let generated = 0;

  for (const employee of ctx.activeEmployees) {
    if (!employee.salary_amount) continue;

    const proRataFactor = employmentProRataFactor(
      employee,
      run.pay_period_start,
      run.pay_period_end,
      ctx.proRataMethod
    );
    if (proRataFactor <= 0) continue;

    const ageDetail = resolveEmployeeAgeDetail(employee, run.pay_date);
    const employeeAge = ageDetail.age;
    const ytd = aggregateEmployeeYtd(ctx.ytdPayslips ?? [], employee.id, ctx.periodsPerYear);
    const uifMonthToDate = uifRemunerationMonthToDate(ctx.ytdPayslips ?? [], employee.id, run.pay_date);
    const proRatedSalaryAmount = applyProRata(Number(employee.salary_amount), proRataFactor);

    const calculation = executePayrollRules({
      employee: {
        id: employee.id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        salaryAmount: proRatedSalaryAmount,
        salaryPeriod: employee.salary_period ?? 'monthly',
        employmentType: employee.employment_type ?? 'permanent',
        taxNumber: employee.tax_number,
        startDate: employee.start_date,
        endDate: employee.end_date,
        age: employeeAge,
      },
      period: {
        payPeriodStart: run.pay_period_start,
        payPeriodEnd: run.pay_period_end,
        payDate: run.pay_date,
        periodsPerYear: ctx.periodsPerYear,
      },
      taxYearConfig: ctx.taxYearConfig,
      companyRuleSettings: ctx.companyRules,
      employeeRuleSettings: ctx.employeeSettingsMap[employee.id] ?? {},
      runRuleOverrides: ctx.runOverrides,
      ytdTaxableIncome: ytd.taxableIncome,
      ytdPayePaid: ytd.payePaid,
    });

    const ruleSet = taxYearConfigToRuleSet(ctx.taxYearConfig);
    const recurring = (ctx.recurringComponents ?? []).filter(
      (row) =>
        row.employee_id === employee.id &&
        isComponentEffective(row, run.pay_date)
    );
    const periodInputs = (ctx.periodInputs ?? []).filter((row) => row.employee_id === employee.id);
    let assembly;
    try {
      // Standing package amounts that accrue with time follow the employment fraction
      // of a partial period; once-off run inputs stay as entered.
      const packageComponents = recurring.map((row) => ({
        componentCode: row.component_code,
        config: proRatePackageConfig(
          row.component_code,
          packageConfigForPayPeriod(row.component_code, row.config ?? {}, ctx.periodsPerYear),
          proRataFactor
        ),
      }));
      assembly = assemblePayComponents(
        mergePayComponents(
          packageComponents,
          periodInputs.map((row) => ({ componentCode: row.component_code, config: row.config ?? {} }))
        ),
        ruleSet
      );
    } catch (err) {
      const name = [employee.first_name, employee.last_name].filter(Boolean).join(' ') || employee.id;
      throw new Error(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const cashGross = roundCurrency(calculation.grossPay + assembly.cashGross);
    const taxableEarnings = roundCurrency(calculation.grossPay + assembly.taxableBaseAddition);
    const remuneration = roundCurrency(calculation.grossPay + assembly.remunerationAddition);

    const statutoryResult = executeStatutoryPipeline({
      employee: {
        id: employee.id,
        employeeNumber: employee.employee_number ?? employee.id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        age: employeeAge,
        employmentType: employee.employment_type,
        isDirector: employee.employment_type === 'director',
      },
      period: {
        payPeriodStart: run.pay_period_start,
        payPeriodEnd: run.pay_period_end,
        payDate: run.pay_date,
      },
      grossEarnings: cashGross,
      taxableEarnings,
      nonPeriodicTaxable: assembly.nonPeriodicTaxable,
      uifRemuneration: remuneration,
      uifRemunerationMonthToDate: uifMonthToDate,
      periodsPerYear: ctx.periodsPerYear,
      sdlRemuneration: remuneration,
      enabledEngines: {
        ...mapRulesToStatutoryEngines(ctx.effectiveRunRules),
        ...assembly.enabledEngines,
      },
      engineConfig: buildStatutoryEngineConfig(
        ctx.companyRules,
        ctx.employeeSettingsMap[employee.id] ?? {},
        ctx.runOverrides
      ),
      components: assembly.components,
      ruleSet,
      ytd: {
        taxableIncome: ytd.taxableIncome,
        payePaid: ytd.payePaid,
        periodsProcessed: ytd.periodsProcessed,
      },
      companyAnnualRemuneration: ctx.companyAnnualRemuneration,
      audit: {
        employeeNumber: employee.employee_number ?? employee.id,
        employeeName: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
        companyId: companyId,
        payrollRunId: runId,
        commandId: `GENERATE_PAYSLIPS:${runId}`,
        correlationId: runId,
        auditReference: `PAYSLIP:${employee.id}:${runId}`,
        generatedBy: createdBy,
      },
    });

    const snapshot = buildCalculationSnapshot(statutoryResult, {
      generatedBy: createdBy,
      ...statutoryResult.audit,
    });
    snapshot.rules_engine_result = calculation;
    snapshot.engine_version = '3.0.2';
    snapshot.period_employment = {
      age: employeeAge ?? null,
      age_as_at: ageDetail.asAt,
      age_source: ageDetail.source,
      age_warning: ageDetail.warning ?? null,
      sdl_remuneration: remuneration,
      pay_frequency: ctx.payFrequency,
      periods_per_year: ctx.periodsPerYear,
      pro_rata_method: ctx.proRataMethod,
      uif_remuneration_month_to_date: uifMonthToDate,
      pro_rata_factor: proRataFactor,
      ytd_taxable_income: ytd.taxableIncome,
      ytd_paye_paid: ytd.payePaid,
      ytd_periods_processed: ytd.periodsProcessed,
      company_annual_remuneration: ctx.companyAnnualRemuneration,
    };
    snapshot.pay_components = {
      cashGross: assembly.cashGross,
      taxableBaseAddition: assembly.taxableBaseAddition,
      nonPeriodicTaxable: assembly.nonPeriodicTaxable,
      remunerationAddition: assembly.remunerationAddition,
      lines: assembly.lines,
    };

    const basicSalary =
      calculation.lineItems.find((item) => item.ruleId === 'basic_salary')?.amount ??
      salaryForPayPeriod(employee.salary_amount, employee.salary_period ?? 'monthly', ctx.periodsPerYear);

    const nonStatutoryItems = calculation.lineItems.filter(
      (item) => !STATUTORY_RULE_IDS.has(item.ruleId)
    );
    const statutoryItems = statutoryResult.payslipLines.map((line) => ({
      ruleId: line.engineId,
      description: line.description,
      type: line.type,
      amount: line.amount,
      componentCode: null,
      irp5Code: null,
    }));
    const componentItems = assembly.lines.map((line) => ({
      ruleId: line.componentCode,
      description: line.description,
      type: line.type,
      amount: line.amount,
      componentCode: line.componentCode,
      irp5Code: line.irp5Code,
    }));
    const persistedItems = [...nonStatutoryItems, ...componentItems, ...statutoryItems];
    const totalEarnings = roundCurrency(
      persistedItems
        .filter((item) => item.type === 'earning')
        .reduce((sum, item) => sum + item.amount, 0)
    );
    const totalDeductions = roundCurrency(
      persistedItems
        .filter((item) => item.type === 'deduction')
        .reduce((sum, item) => sum + item.amount, 0)
    );
    const netPay = roundCurrency(totalEarnings - totalDeductions);

    const { data: payslip, error: payslipError } = await supabaseAdmin
      .from('payslips')
      .insert({
        company_id: companyId,
        employee_id: employee.id,
        payroll_run_id: runId,
        basic_salary: basicSalary,
        total_earnings: totalEarnings,
        total_deductions: totalDeductions,
        net_pay: netPay,
        calculation_snapshot: snapshot,
      })
      .select('id')
      .single();

    if (payslipError) throw payslipError;

    const itemsToInsert = persistedItems.map((item) => ({
        payslip_id: payslip.id,
        description: item.description,
        type: item.type,
        amount: item.amount,
        component_code: item.componentCode ?? null,
        irp5_code: item.irp5Code ?? null,
      }));

    if (itemsToInsert.length) {
      const { error: itemsError } = await supabaseAdmin.from('payslip_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;
    }

    generated++;
    results.push({ employee_id: employee.id, payslip_id: payslip.id, calculation });
  }

  return {
    generated,
    results,
    engine: 'statutory_payroll_engine_v3',
    rules_applied: Object.keys(ctx.effectiveRunRules).filter((k) => ctx.effectiveRunRules[k]?.enabled !== false),
  };
}
