import { describe, expect, it } from 'vitest';
import { runCertificationProgramme, certificationGatePassed } from '@/lib/statutoryPayrollEngine/certificationRunner';
import { runPayeEngine } from '@/lib/statutoryPayrollEngine/engines/payeEngine';
import { runUifEmployeeEngine } from '@/lib/statutoryPayrollEngine/engines/uifEngine';
import { runSdlEngine } from '@/lib/statutoryPayrollEngine/engines/sdlEngine';
import { resolveMonthlyMedicalCredits } from '@/lib/statutoryPayrollEngine/engines/medicalTaxCreditEngine';
import { runTravelAllowanceEngine } from '@/lib/statutoryPayrollEngine/engines/travelAllowanceEngine';
import { runFringeBenefitEngine } from '@/lib/statutoryPayrollEngine/engines/fringeBenefitEngine';
import { runTerminationTaxEngine } from '@/lib/statutoryPayrollEngine/engines/terminationTaxEngine';
import { runDirectorsPayeEngine } from '@/lib/statutoryPayrollEngine/engines/directorsPayeEngine';
import { executeStatutoryPipeline, buildJournalLines } from '@/lib/statutoryPayrollEngine/pipeline';
import { RULE_SET_2025_2026 } from '@/lib/statutoryPayrollEngine/registry';
import { calculatePaye } from '@/lib/payrollRulesEngine/paye';
import { previewEmployeeNumber } from '@/lib/employeeIdentity';
import {
  buildBankPaymentFileContent,
  computeBankFileIntegrity,
  extractEmployeeBankFields,
  extractPayslipCertificationFromSnapshot,
  formatPayslipPaymentLine,
  maskBankAccountNumber,
} from '@/lib/payrollDocuments';
import {
  buildConsolidatedJournalPosting,
  verifyJournalIntegrity,
  verifyTrialBalanceLines,
} from '@/lib/payrollJournal';

const baseCtx = {
  employee: { id: 'emp-1', age: 30 },
  period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
  grossEarnings: 25000,
  enabledEngines: {
    paye: true,
    uif: true,
    uif_employer: true,
    sdl: true,
    medical_tax_credit: true,
  },
  engineConfig: {},
  components: { medicalDependants: 0 },
  companyAnnualRemuneration: 600000,
  ruleSet: RULE_SET_2025_2026,
};

describe('Statutory PAYE Engine', () => {
  it('calculates certified monthly PAYE on R25,000', () => {
    const medical = resolveMonthlyMedicalCredits(0, RULE_SET_2025_2026.medicalCredits, true);
    const result = runPayeEngine({ ...baseCtx, taxableEarnings: 25000 }, medical);
    expect(result.employeeAmount).toBe(3119.08);
  });
});

describe('UIF Engine', () => {
  it('caps employee UIF at ceiling', () => {
    const result = runUifEmployeeEngine({ ...baseCtx, grossEarnings: 20000 });
    expect(result.employeeAmount).toBe(177.12);
  });
});

describe('SDL Engine', () => {
  it('applies 1% SDL levy', () => {
    const result = runSdlEngine({ ...baseCtx, grossEarnings: 30000 });
    expect(result.employerAmount).toBe(300);
  });
});

describe('Medical Credits', () => {
  it('resolves main + two dependant credits (certified)', () => {
    expect(resolveMonthlyMedicalCredits(2, RULE_SET_2025_2026.medicalCredits, true)).toBe(974);
  });
});

describe('Travel Allowance Engine', () => {
  it('is skipped when travel allowance not enabled', () => {
    const result = runTravelAllowanceEngine({
      ...baseCtx,
      components: { travelAllowance: { amount: 5000, hasLogbook: true, businessKm: 1000 } },
    });
    expect(result.skipped).toBe(true);
  });
});

describe('Fringe Benefits Engine', () => {
  it('runs company car fringe path', () => {
    const result = runFringeBenefitEngine({
      ...baseCtx,
      enabledEngines: { ...baseCtx.enabledEngines, fringe_benefit: true },
      components: { fringeBenefits: [{ type: 'company_car', determinedValue: 100000 }] },
    });
    expect(result.skipped).toBe(false);
  });
});

describe('Termination Engine', () => {
  it('handles severance exemption path', () => {
    const result = runTerminationTaxEngine({
      ...baseCtx,
      enabledEngines: { ...baseCtx.enabledEngines, termination_tax: true },
      components: { termination: { severanceAmount: 500000, priorSeveranceExempt: 0 } },
    });
    expect(result.skipped).toBe(false);
  });
});

describe('Directors PAYE Engine', () => {
  it('runs directors path when enabled (certified suite)', () => {
    const result = runDirectorsPayeEngine({
      ...baseCtx,
      employee: { ...baseCtx.employee, isDirector: true },
      enabledEngines: { ...baseCtx.enabledEngines, directors_paye: true },
      components: {
        directors: {
          remunerationType: 'monthly_fixed',
          fixedMonthlyAmount: 25000,
        },
      },
    });
    expect(result.skipped).toBe(false);
  });
});

describe('Payroll Rules Engine PAYE adapter', () => {
  it('delegates to statutory engine', () => {
    const result = calculatePaye({
      monthlyTaxableIncome: 25000,
      taxYearConfig: {
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
      },
      medicalDependants: 0,
      medicalSchemeEntitled: true,
    });
    expect(result.monthlyPaye).toBe(3119.08);
  });
});

describe('Employee Number Engine', () => {
  it('formats sequence with padding and tokens', () => {
    const number = previewEmployeeNumber({
      format_template: 'EMP-{YEAR}-{SEQ}',
      sequence_padding: 6,
      next_sequence: 42,
    });
    expect(number).toMatch(/^EMP-\d{4}-000042$/);
  });
});

describe('Calculation Pipeline + Journal Builder', () => {
  it('produces balanced granular journal lines', () => {
    const result = executeStatutoryPipeline(baseCtx);
    const integrity = verifyJournalIntegrity(result.journalLines);
    expect(integrity.granularBalanced).toBe(true);
    expect(result.netPay).toBeGreaterThan(0);
  });

  it('maps granular lines to consolidated GL posting', () => {
    const result = executeStatutoryPipeline(baseCtx);
    const consolidated = buildConsolidatedJournalPosting(
      result.grossEarnings,
      result.netPay,
      result.totalEmployeeDeductions
    );
    const integrity = verifyJournalIntegrity(result.journalLines, consolidated);
    expect(integrity.consolidatedMatchesGranular).toBe(true);
    expect(integrity.balanced).toBe(true);
  });

  it('exports buildJournalLines for audit reconciliation', () => {
    const result = executeStatutoryPipeline(baseCtx);
    const lines = buildJournalLines(result.grossEarnings, result.engineResults, result.netPay);
    expect(lines.some((l) => l.accountRole === 'paye_liability')).toBe(true);
    const trial = verifyTrialBalanceLines(lines);
    expect(trial.balanced).toBe(true);
  });
});

describe('Payslip certification metadata', () => {
  it('extracts tax year and versions from snapshot', () => {
    const meta = extractPayslipCertificationFromSnapshot({
      tax_year: '2025/2026',
      rule_version: '2025.2.0',
      calculation_version: '3.0.2',
      gross_earnings: 25000,
      taxable_earnings: 25000,
      net_pay: 21000,
    });
    expect(meta.tax_year).toBe('2025/2026');
    expect(meta.rule_version).toBe('2025.2.0');
    expect(meta.calculation_version).toBe('3.0.2');
    expect(meta.ytd?.gross_earnings).toBe(25000);
  });
});

describe('Payslip payment display', () => {
  it('masks account numbers when masking is requested', () => {
    expect(maskBankAccountNumber('62000000001')).toBe('****0001');
    expect(maskBankAccountNumber('1234')).toBe('****');
  });

  it('formats payment line with full account and branch for verification', () => {
    const line = formatPayslipPaymentLine({
      payment_method: 'EFT',
      bank_reference: 'PAY-2026-04-25',
      employee: {
        first_name: 'Jane',
        last_name: 'Doe',
        bank_name: 'FNB',
        bank_account_number: '62000000001',
        bank_branch_code: '250655',
      },
    });
    expect(line).toContain('Payment Method: EFT');
    expect(line).toContain('Bank Name: FNB');
    expect(line).toContain('Account Number: 62000000001');
    expect(line).toContain('Branch Code: 250655');
    expect(line).toContain('Payment Reference: PAY-2026-04-25');
  });

  it('extracts bank fields from employee master shapes', () => {
    const fields = extractEmployeeBankFields({
      bank_name: 'Absa',
      bank_branch_code: '632005',
      bank_account_number: '1234567890',
    });
    expect(fields).toEqual({
      bank_name: 'Absa',
      bank_branch_code: '632005',
      bank_account_number: '1234567890',
    });
  });
});

describe('Bank File Generator', () => {
  const rows = [
    {
      employee_name: 'Jane Doe',
      bank_account_number: '62000000001',
      bank_branch_code: '250655',
      net_pay: 15000,
    },
    {
      employee_name: 'John Smith',
      bank_account_number: '62000000002',
      bank_branch_code: '250655',
      net_pay: 12000,
    },
  ];

  it('includes control hash in EFT trailer', () => {
    const content = buildBankPaymentFileContent(rows, '2026-04', '2026-04-25', 'eft');
    const integrity = computeBankFileIntegrity(rows);
    expect(content).toContain(integrity.control_hash);
    expect(content.split('\n').at(-1)).toMatch(/^T\|2\|/);
  });

  it('detects duplicate account numbers', () => {
    const dup = [...rows, { ...rows[0], employee_name: 'Duplicate' }];
    const integrity = computeBankFileIntegrity(dup);
    expect(integrity.duplicate_keys.length).toBeGreaterThan(0);
    expect(integrity.verified).toBe(false);
  });

  it('CSV includes bank name and branch code columns', () => {
    const fullRows = rows.map((r, i) => ({
      ...r,
      bank_name: i === 0 ? 'FNB' : 'Absa',
    }));
    const csv = buildBankPaymentFileContent(fullRows, '2026-04', '2026-04-25', 'csv');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Employee Name,Bank Name,Branch Code,Account Number,Amount,Reference,Payment Date');
    expect(lines[1]).toContain('"FNB"');
    expect(lines[1]).toContain('"250655"');
    expect(lines[1]).toContain('"62000000001"');
    expect(lines[2]).toContain('"Absa"');
  });

  it('server bank rows take precedence over blank client cache', () => {
    // Simulates the scenario where server returns authoritative bank_rows
    // and client-side cache has empty bank fields.
    const serverRows = [
      {
        employee_name: 'Jane Doe',
        bank_name: 'FNB',
        bank_branch_code: '250655',
        bank_account_number: '62000000001',
        net_pay: 15000,
        reference: 'PAY-2026-04-25',
      },
    ];
    // Client fallback rows with empty bank data (old broken state)
    const clientCacheRows = [
      {
        employee_name: 'Jane Doe',
        bank_name: null,
        bank_branch_code: null,
        bank_account_number: null,
        net_pay: 15000,
        reference: 'PAY-2026-04-25',
      },
    ];

    const preferServerRows = (
      server: typeof serverRows | undefined,
      clientCache: typeof clientCacheRows
    ) => (server?.length ? server : clientCache);

    const chosen = preferServerRows(serverRows, clientCacheRows);
    const csv = buildBankPaymentFileContent(chosen, '2026-04', '2026-04-25', 'csv');
    expect(csv).toContain('"FNB"');
    expect(csv).toContain('"250655"');
    expect(csv).toContain('"62000000001"');
    expect(csv).not.toContain('""');
  });
});

describe('Statutory certification programme', () => {
  it('passes full certification gate', () => {
    const report = runCertificationProgramme();
    expect(certificationGatePassed(report)).toBe(true);
  });
});
