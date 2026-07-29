import { RULE_SET_2026_2027 } from '../src/lib/statutoryPayrollEngine/registry/taxYears.ts';
import { executeStatutoryPipeline } from '../src/lib/statutoryPayrollEngine/pipeline.ts';

const r = executeStatutoryPipeline({
  employee: { id: '6a72f977-35a7-4a15-9559-b58a0dd13d4e' },
  period: { payPeriodStart: '2026-08-01', payPeriodEnd: '2026-08-31', payDate: '2026-08-31' },
  grossEarnings: 35460,
  enabledEngines: { paye: true, medical_tax_credit: true, uif: false, sdl: false },
  engineConfig: { medical_aid: { monthly_amount: 0 } },
  ruleSet: RULE_SET_2026_2027,
});
const paye = r.engineResults.find((e) => e.engineId === 'paye')?.employeeAmount;
const med = r.engineResults.find((e) => e.engineId === 'medical_tax_credit')?.breakdown?.monthlyCredit;
const match = Math.abs(Number(paye) - 6277.35) < 0.01;
console.log(`PAYE: ${paye}`);
console.log(`Medical monthly credit: ${med}`);
console.log(`Expected PAYE: 6277.35`);
console.log(`Match: ${match ? 'PASS' : 'FAIL'}`);
process.exit(match ? 0 : 1);
