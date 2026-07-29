/**
 * Statutory Payroll Engine — Performance Benchmark (V3.0.1)
 */

import { executeStatutoryPipeline } from './pipeline';
import { RULE_SET_2025_2026 } from './registry';
import { ENGINE_VERSION } from './utils';

export type BenchmarkResult = {
  employeeCount: number;
  executionTimeMs: number;
  memoryDeltaMb: number;
  sampleNetPay: number;
  auditStepsTotal: number;
  passed: boolean;
};

export type BenchmarkReport = {
  runAt: string;
  engineVersion: string;
  results: BenchmarkResult[];
  allStable: boolean;
};

function runBatch(count: number): BenchmarkResult {
  const memBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  let sampleNetPay = 0;
  let auditStepsTotal = 0;

  for (let i = 0; i < count; i++) {
    const result = executeStatutoryPipeline({
      employee: { id: `bench-${i}`, age: 30 + (i % 40) },
      period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
      grossEarnings: 15000 + (i % 50) * 1000,
      enabledEngines: { paye: true, uif: true, uif_employer: true, sdl: true, medical_tax_credit: true },
      engineConfig: {},
      components: { medicalDependants: i % 4 },
      companyAnnualRemuneration: 600000,
      ruleSet: RULE_SET_2025_2026,
    });
    if (i === 0) sampleNetPay = result.netPay;
    auditStepsTotal += result.auditTrail.length;
  }

  const elapsed = performance.now() - start;
  const memAfter = process.memoryUsage().heapUsed;

  return {
    employeeCount: count,
    executionTimeMs: round2(elapsed),
    memoryDeltaMb: round2((memAfter - memBefore) / 1024 / 1024),
    sampleNetPay,
    auditStepsTotal,
    passed: sampleNetPay > 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Verify mathematical consistency: single employee result matches batch[0] pattern. */
export function runPerformanceBenchmark(): BenchmarkReport {
  const sizes = [100, 500, 1000, 5000, 10000];
  const results = sizes.map(runBatch);

  const baseline = executeStatutoryPipeline({
    employee: { id: 'bench-0', age: 30 },
    period: { payPeriodStart: '2025-04-01', payPeriodEnd: '2025-04-30', payDate: '2025-04-25' },
    grossEarnings: 15000,
    enabledEngines: { paye: true, uif: true, uif_employer: true, sdl: true },
    engineConfig: {},
    companyAnnualRemuneration: 600000,
    ruleSet: RULE_SET_2025_2026,
  });

  const allStable = results.every((r) => r.passed) && results[0].sampleNetPay === baseline.netPay;

  return {
    runAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    results,
    allStable,
  };
}
