import { describe, expect, it, beforeEach } from 'vitest';
import {
  generateEmp201,
  generateEmp501,
  generateIrp5,
  generateStatutoryReturn,
  listStatutoryReturnPackages,
  resolvePaye,
  resolveCountryCapabilities,
  runStatutoryReturnPipeline,
  exportStatutoryReturn,
  assertCanRegenerate,
  markReturnSubmitted,
  clearSubmissionLedgerForTests,
  listSubmissionLedgerEvents,
  getStatutoryReturnPlugin,
  type FinalizedPayrollRunSource,
} from '@/lib/statutoryReturns';
import { isRunFinalized } from '@/lib/payrollWorkflow';

function makeFinalizedRun(overrides?: Partial<FinalizedPayrollRunSource>): FinalizedPayrollRunSource {
  return {
    id: 'run-1',
    companyId: 'co-1',
    status: 'finalized',
    payPeriodStart: '2025-04-01',
    payPeriodEnd: '2025-04-30',
    payDate: '2025-04-25',
    taxYear: '2025-2026',
    payslips: [
      {
        payslipId: 'ps-1',
        employeeId: 'emp-1',
        employeeNumber: 'E001',
        employeeName: 'Ada Lovelace',
        taxReference: '1234567890',
        idNumber: '9001015800080',
        grossPay: 25000,
        totalDeductions: 3500,
        netPay: 21500,
        calculationSnapshot: {
          tax_year: '2025-2026',
          gross_earnings: 25000,
          engine_results: [
            { engine_id: 'paye', employee_amount: 3119.08, employer_amount: 0 },
            { engine_id: 'uif', employee_amount: 177.12, employer_amount: 0 },
            { engine_id: 'uif_employer', employee_amount: 0, employer_amount: 177.12 },
            { engine_id: 'sdl', employee_amount: 0, employer_amount: 250 },
          ],
        },
        payslipItems: [
          { description: 'Basic Salary', type: 'earning', amount: 25000 },
          { description: 'PAYE', type: 'deduction', amount: 3119.08 },
          { description: 'UIF', type: 'deduction', amount: 177.12 },
          { description: 'UIF Employer', type: 'employer_contribution', amount: 177.12 },
          { description: 'SDL', type: 'employer_contribution', amount: 250 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Statutory Returns architecture', () => {
  beforeEach(() => {
    clearSubmissionLedgerForTests();
  });

  it('registers ZA EMP201, EMP501, IRP5, and Tax Certificate packages', () => {
    const pkgs = listStatutoryReturnPackages('ZA');
    expect(pkgs.map((p) => p.returnType).sort()).toEqual(
      ['EMP201', 'EMP501', 'IRP5', 'TAX_CERTIFICATE'].sort()
    );
  });

  it('rejects non-finalized payroll as source', () => {
    const draft = makeFinalizedRun({ status: 'draft' });
    expect(isRunFinalized(draft.status)).toBe(false);
    const result = generateEmp201({
      country: 'ZA',
      taxYear: '2025-2026',
      runs: [draft],
      periodStart: '2025-04-01',
      periodEnd: '2025-04-30',
    });
    expect(result.validationResult.ok).toBe(false);
    expect(result.validationResult.issues.some((i) => i.code === 'RUN_NOT_FINALIZED')).toBe(true);
  });

  it('EMP201 reads PAYE/UIF/SDL from finalized calculation_snapshot only', () => {
    const run = makeFinalizedRun();
    const result = generateEmp201({
      country: 'ZA',
      taxYear: '2025-2026',
      runs: [run],
      periodStart: '2025-04-01',
      periodEnd: '2025-04-30',
    });
    expect(result.returnType).toBe('EMP201');
    expect(result.sourcePayrollRuns).toEqual(['run-1']);
    expect(result.validationResult.ok).toBe(true);
    const totals = result.declarationData.totals as {
      paye: number;
      uifTotal: number;
      sdl: number;
    };
    expect(totals.paye).toBe(3119.08);
    expect(totals.uifTotal).toBe(354.24);
    expect(totals.sdl).toBe(250);
    expect(result.declarationData).not.toHaveProperty('recalculated');
  });

  it('EMP501 reconciles monthly PAYE to annual total', () => {
    const run = makeFinalizedRun();
    const result = generateEmp501({
      country: 'ZA',
      taxYear: '2025-2026',
      runs: [run],
    });
    expect(result.returnType).toBe('EMP501');
    expect(result.validationResult.ok).toBe(true);
    const recon = result.declarationData.reconciliation as { payeDeclared: number };
    expect(recon.payeDeclared).toBe(3119.08);
  });

  it('IRP5 maps snapshot amounts onto legislation IRP5 codes', () => {
    const run = makeFinalizedRun();
    const result = generateIrp5({
      country: 'ZA',
      taxYear: '2025-2026',
      runs: [run],
    });
    expect(result.returnType).toBe('IRP5');
    expect(result.validationResult.ok).toBe(true);
    const certs = result.declarationData.certificates as Array<{
      amounts: Array<{ code: string; field: string; amount: number }>;
    }>;
    expect(certs).toHaveLength(1);
    const paye = certs[0].amounts.find((a) => a.field === 'paye');
    expect(paye?.code).toBe('4102');
    expect(paye?.amount).toBe(3119.08);
  });

  it('generateStatutoryReturn dispatches via registry without payroll engine imports', () => {
    const run = makeFinalizedRun();
    const result = generateStatutoryReturn('ZA', 'EMP201', {
      taxYear: '2025-2026',
      runs: [run],
      periodStart: '2025-04-01',
      periodEnd: '2025-04-30',
    });
    expect(result.country).toBe('ZA');
    expect(resolvePaye(run.payslips)).toBe(3119.08);
  });
});

describe('V3.6.1 enterprise hardening', () => {
  beforeEach(() => {
    clearSubmissionLedgerForTests();
  });

  it('resolves country capabilities: legislation, returns, validators, exporters, transmission, certificates', () => {
    const caps = resolveCountryCapabilities('ZA');
    expect(caps.legislation.length).toBeGreaterThan(0);
    expect(caps.payrollRules.length).toBe(caps.legislation.length);
    expect(caps.statutoryReturns.map((r) => r.returnType).sort()).toEqual(
      ['EMP201', 'EMP501', 'IRP5', 'TAX_CERTIFICATE'].sort()
    );
    expect(caps.validators.length).toBeGreaterThan(0);
    expect(caps.exporters.length).toBeGreaterThan(0);
    expect(caps.transmissionProviders.map((p) => p.id)).toContain('manual');
    expect(caps.certificates.some((c) => c.returnType === 'IRP5')).toBe(true);
  });

  it('isolates generate → validate → export pipeline stages', () => {
    const plugin = getStatutoryReturnPlugin('ZA', 'EMP201');
    expect(plugin).toBeTruthy();
    const result = runStatutoryReturnPipeline({
      plugin: plugin!,
      input: {
        country: 'ZA',
        taxYear: '2025-2026',
        runs: [makeFinalizedRun()],
        periodStart: '2025-04-01',
        periodEnd: '2025-04-30',
      },
      stages: ['generate', 'validate', 'export'],
      companyId: 'co-1',
    });
    expect(result.stagesCompleted).toEqual(['generate', 'validate', 'export']);
    expect(result.validation.ok).toBe(true);
    expect(result.returnRecord.immutable).toBe(true);
    expect(result.returnRecord.contentHash).toBeTruthy();
    expect(result.artifact?.format).toBe('json');
    expect(result.transmission).toBeNull();
  });

  it('blocks regeneration of submitted immutable returns', () => {
    const generated = generateEmp201({
      country: 'ZA',
      taxYear: '2025-2026',
      runs: [makeFinalizedRun()],
      periodStart: '2025-04-01',
      periodEnd: '2025-04-30',
    });
    const submitted = markReturnSubmitted(generated, 'REF-TEST-1');
    expect(submitted.immutable).toBe(true);
    expect(() => assertCanRegenerate(submitted)).toThrow(/REGENERATION_BLOCKED/);

    const plugin = getStatutoryReturnPlugin('ZA', 'EMP201')!;
    const blocked = runStatutoryReturnPipeline({
      plugin,
      input: {
        country: 'ZA',
        taxYear: '2025-2026',
        runs: [makeFinalizedRun()],
        periodStart: '2025-04-01',
        periodEnd: '2025-04-30',
      },
      existingReturn: submitted,
      stages: ['generate'],
    });
    expect(blocked.stagesCompleted).toEqual([]);
    expect(listSubmissionLedgerEvents(submitted.id).some((e) => e.eventType === 'regeneration_blocked')).toBe(
      true
    );
  });

  it('export framework is usable independently of transmission', () => {
    const ret = generateEmp501({
      country: 'ZA',
      taxYear: '2025-2026',
      runs: [makeFinalizedRun()],
    });
    const artifact = exportStatutoryReturn(ret, 'csv');
    expect(artifact.format).toBe('csv');
    expect(artifact.payload).toContain('EMP501');
  });
});
