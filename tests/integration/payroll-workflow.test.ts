/**
 * Payroll workflow integration — real platform services (no business-layer mocks).
 */

import { describe, expect, it } from 'vitest';
import { executePayrollRules, buildEffectiveCompanyRules } from '@/lib/payrollRulesEngine';
import { executeStatutoryPipeline } from '@/lib/statutoryPayrollEngine/pipeline';
import { RULE_SET_2025_2026 } from '@/lib/statutoryPayrollEngine/registry';
import { buildCalculationSnapshot, validateAuditSnapshot } from '@/lib/statutoryPayrollEngine/audit';
import { dispatchBusinessCommandOrThrow } from '@/lib/boe/dispatchers/commandDispatcher';
import { getSubscribers } from '@/lib/boe/subscribers/registry';
import { runFailureInjectionSuite } from '@/lib/platform/failureInjection';
import {
  buildBankPaymentFileContent,
  computeBankFileIntegrity,
  buildPayslipHtml,
  extractPayslipCertificationFromSnapshot,
} from '@/lib/payrollDocuments';
import {
  buildConsolidatedJournalPosting,
  verifyJournalIntegrity,
} from '@/lib/payrollJournal';
import { previewEmployeeNumber } from '@/lib/employeeIdentity';

const taxYearConfig = {
  taxYearLabel: '2025/2026',
  effectiveFrom: '2025-03-01',
  effectiveTo: '2026-02-28',
  countryCode: 'ZA',
  brackets: RULE_SET_2025_2026.brackets,
  rebates: RULE_SET_2025_2026.rebates,
  medicalCredits: RULE_SET_2025_2026.medicalCredits,
  uifCeilingMonthly: RULE_SET_2025_2026.uifCeilingMonthly,
  sdlRate: RULE_SET_2025_2026.sdlRate,
  uifRate: RULE_SET_2025_2026.uifRate,
};

describe('Payroll workflow integration (in-process)', () => {
  it('Employee number → payroll rules → statutory pipeline → audit snapshot', () => {
    const employeeNumber = previewEmployeeNumber({
      format_template: 'EMP-{SEQ}',
      sequence_padding: 6,
      next_sequence: 1001,
    });
    expect(employeeNumber).toBe('EMP-001001');

    const catalog = [
      {
        id: 'paye',
        enabled_by_default: true,
        name: 'PAYE',
        category: 'statutory',
        company_configurable: true,
        employee_configurable: false,
        calculation_order: 10,
        payslip_label: 'PAYE',
        description: 'PAYE',
      },
      {
        id: 'uif',
        enabled_by_default: true,
        name: 'UIF',
        category: 'statutory',
        company_configurable: true,
        employee_configurable: false,
        calculation_order: 20,
        payslip_label: 'UIF',
        description: 'UIF',
      },
    ];

    const companyRules = buildEffectiveCompanyRules(catalog, []);
    const rulesResult = executePayrollRules({
      employee: {
        id: 'emp-int-1',
        firstName: 'Integration',
        lastName: 'Employee',
        salaryAmount: 30000,
        salaryPeriod: 'monthly',
        employmentType: 'permanent',
      },
      period: {
        payPeriodStart: '2025-04-01',
        payPeriodEnd: '2025-04-30',
        payDate: '2025-04-25',
      },
      taxYearConfig,
      companyRuleSettings: companyRules,
      employeeRuleSettings: {},
      runRuleOverrides: {},
    });

    const statutory = executeStatutoryPipeline({
      employee: {
        id: 'emp-int-1',
        employeeNumber,
        firstName: 'Integration',
        lastName: 'Employee',
        age: 32,
      },
      period: {
        payPeriodStart: '2025-04-01',
        payPeriodEnd: '2025-04-30',
        payDate: '2025-04-25',
      },
      grossEarnings: rulesResult.grossPay,
      enabledEngines: { paye: true, uif: true, uif_employer: true, sdl: true, medical_tax_credit: true },
      engineConfig: {},
      ruleSet: RULE_SET_2025_2026,
      companyAnnualRemuneration: 720000,
      audit: {
        employeeNumber,
        employeeName: 'Integration Employee',
        companyId: 'company-int',
        payrollRunId: 'run-int',
        commandId: 'cmd-int',
        correlationId: 'corr-int',
        auditReference: 'AUD-INT-001',
      },
    });

    const snapshot = buildCalculationSnapshot(statutory, {
      generatedBy: 'integration-test',
      employeeNumber,
      employeeName: 'Integration Employee',
      companyId: 'company-int',
      payrollRunId: 'run-int',
    });
    snapshot.rules_engine_result = rulesResult;

    expect(validateAuditSnapshot(snapshot)).toHaveLength(0);
    expect(statutory.netPay).toBeLessThan(rulesResult.grossPay);

    const consolidated = buildConsolidatedJournalPosting(
      rulesResult.grossPay,
      rulesResult.netPay,
      rulesResult.totalEmployeeDeductions
    );
    const journalCheck = verifyJournalIntegrity(statutory.journalLines, consolidated);
    expect(journalCheck.balanced).toBe(true);

    const certMeta = extractPayslipCertificationFromSnapshot(snapshot);
    const html = buildPayslipHtml({
      companyName: 'Integration Co',
      employee: {
        first_name: 'Integration',
        last_name: 'Employee',
        employee_number: employeeNumber,
        department: 'Finance',
      },
      payPeriodStart: '2025-04-01',
      payPeriodEnd: '2025-04-30',
      payDate: '2025-04-25',
      items: rulesResult.lineItems,
      total_earnings: rulesResult.grossPay,
      total_deductions: rulesResult.totalEmployeeDeductions,
      net_pay: rulesResult.netPay,
      audit_reference: 'AUD-INT-001',
      ...certMeta,
    });
    expect(html).toContain('Tax Year: 2025/2026');
    expect(html).toContain('Rule Version:');
    expect(html).toContain('Calculation Version:');

    const bankRows = [
      {
        employee_name: 'Integration Employee',
        bank_account_number: '1234567890',
        bank_branch_code: '250655',
        net_pay: rulesResult.netPay,
      },
    ];
    const bankFile = buildBankPaymentFileContent(bankRows, 'INT-APR', '2025-04-25', 'eft');
    const bankIntegrity = computeBankFileIntegrity(bankRows);
    expect(bankFile).toContain(bankIntegrity.control_hash);
    expect(bankIntegrity.verified).toBe(true);
  });

  it('BOE command dispatcher executes subscribers without bypass', async () => {
    const subscribers = getSubscribers();
    expect(subscribers.length).toBeGreaterThanOrEqual(7);

    const result = await dispatchBusinessCommandOrThrow({
      commandId: crypto.randomUUID(),
      commandName: 'INTEGRATION_TEST',
      commandVersion: '1.0',
      timestamp: new Date().toISOString(),
      companyId: 'company-int',
      userId: 'user-int',
      outcomeEventId: 'payroll.payslips_generated',
      entityType: 'payroll_run',
      entityId: 'run-int',
      payload: {},
      executor: async () => ({ ok: true, payrollRunId: 'run-int' }),
    });

    expect(result.status).toBe('success');
    expect(result.event?.metadata?.commandId).toBeDefined();
    expect(getSubscribers().length).toBeGreaterThanOrEqual(7);
  });

  it('failure injection envelope suite recovers gracefully', async () => {
    const results = await runFailureInjectionSuite();
    expect(results.every((r) => r.recovered)).toBe(true);
  });
});
