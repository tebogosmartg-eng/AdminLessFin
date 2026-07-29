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
import { normalizeSalaryToMonthly } from './payrollRulesEngine/paye.ts';
import {
  executeStatutoryPipeline,
  mapRulesToStatutoryEngines,
} from './statutoryPayrollEngine/pipeline.ts';
import { buildCalculationSnapshot } from './statutoryPayrollEngine/audit.ts';
import { taxYearConfigToRuleSet } from './statutoryPayrollEngine/adapter.ts';

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

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function fetchPayrollRun(supabaseAdmin, runId, companyId) {
  const { data, error } = await supabaseAdmin
    .from('payroll_runs')
    .select('id, status, rule_config, pay_period_start, pay_period_end, pay_date, journal_entry_id')
    .eq('id', runId)
    .eq('company_id', companyId)
    .single();

  if (error) throw error;
  return { ...data, rule_config: data.rule_config ?? {} };
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

  const today = new Date().toISOString().split('T')[0];
  const activeEmployees = (employeesResult.data ?? []).filter(
    (e) => !e.end_date || e.end_date >= today
  );

  return {
    companyRules,
    runOverrides,
    effectiveRunRules,
    taxYearConfig,
    employeeSettingsMap,
    activeEmployees,
    catalogRows,
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

    const calculation = executePayrollRules({
      employee: {
        id: employee.id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        salaryAmount: employee.salary_amount,
        salaryPeriod: employee.salary_period ?? 'monthly',
        employmentType: employee.employment_type ?? 'permanent',
        taxNumber: employee.tax_number,
        startDate: employee.start_date,
        endDate: employee.end_date,
      },
      period: {
        payPeriodStart: run.pay_period_start,
        payPeriodEnd: run.pay_period_end,
        payDate: run.pay_date,
      },
      taxYearConfig: ctx.taxYearConfig,
      companyRuleSettings: ctx.companyRules,
      employeeRuleSettings: ctx.employeeSettingsMap[employee.id] ?? {},
      runRuleOverrides: ctx.runOverrides,
    });

    const statutoryResult = executeStatutoryPipeline({
      employee: {
        id: employee.id,
        employeeNumber: employee.employee_number ?? employee.id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        age: employee.age,
        employmentType: employee.employment_type,
        isDirector: employee.employment_type === 'director',
      },
      period: {
        payPeriodStart: run.pay_period_start,
        payPeriodEnd: run.pay_period_end,
        payDate: run.pay_date,
      },
      grossEarnings: calculation.grossPay,
      enabledEngines: mapRulesToStatutoryEngines(ctx.effectiveRunRules),
      engineConfig: buildStatutoryEngineConfig(
        ctx.companyRules,
        ctx.employeeSettingsMap[employee.id] ?? {},
        ctx.runOverrides
      ),
      ruleSet: taxYearConfigToRuleSet(ctx.taxYearConfig),
      companyAnnualRemuneration: ctx.companyAnnualRemuneration ?? 600000,
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

    const basicSalary =
      calculation.lineItems.find((item) => item.ruleId === 'basic_salary')?.amount ??
      normalizeSalaryToMonthly(employee.salary_amount, employee.salary_period ?? 'monthly');

    const nonStatutoryItems = calculation.lineItems.filter(
      (item) => !STATUTORY_RULE_IDS.has(item.ruleId)
    );
    const statutoryItems = statutoryResult.payslipLines.map((line) => ({
      ruleId: line.engineId,
      description: line.description,
      type: line.type,
      amount: line.amount,
    }));
    const persistedItems = [...nonStatutoryItems, ...statutoryItems];
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
