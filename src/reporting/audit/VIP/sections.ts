/**
 * VIP audit section catalogue — independent of Management Matrix (V3.6.6)
 */

import type { VipAuditBlockId } from './types';

export type VipSectionLineDef = {
  code: string;
  label: string;
  /** Registry / fact measure strategy — snapshot values only, never recalculated. */
  measure:
    | { kind: 'registry'; code: string }
    | { kind: 'total'; field: 'grossPay' | 'netPay' | 'costToCompany' }
    | { kind: 'residual'; bucket: 'earnings' | 'deductions' | 'employer' }
    | { kind: 'employer_keyword'; keywords: string[] };
  emphasis?: 'section_total' | 'grand_total';
};

export type VipSectionDef = {
  id: VipAuditBlockId;
  title: string;
  lines: VipSectionLineDef[];
};

/** Known registry codes claimed by named VIP lines (residuals exclude these). */
export const VIP_CLAIMED_EARNING_CODES = [
  'basic_salary',
  'overtime',
  'bonus',
  'commission',
  'allowances',
  'travel_allowance',
  'housing_allowance',
  'fringe_benefits',
] as const;

export const VIP_CLAIMED_DEDUCTION_CODES = [
  'paye',
  'uif_employee',
  'medical_aid',
  'retirement',
] as const;

export const VIP_CLAIMED_EMPLOYER_CODES = ['uif_employer', 'sdl'] as const;

/**
 * Canonical audit layout — Employee Information is identity-only (no amount lines).
 */
export const VIP_AUDIT_SECTIONS: readonly VipSectionDef[] = [
  {
    id: 'employee_information',
    title: 'EMPLOYEE INFORMATION',
    lines: [],
  },
  {
    id: 'earnings',
    title: 'EARNINGS',
    lines: [
      { code: 'basic_salary', label: 'Basic Salary', measure: { kind: 'registry', code: 'basic_salary' } },
      { code: 'overtime', label: 'Overtime', measure: { kind: 'registry', code: 'overtime' } },
      { code: 'bonus', label: 'Bonus', measure: { kind: 'registry', code: 'bonus' } },
      { code: 'commission', label: 'Commission', measure: { kind: 'registry', code: 'commission' } },
      { code: 'allowances', label: 'Allowances', measure: { kind: 'registry', code: 'allowances' } },
      {
        code: 'fringe_benefits',
        label: 'Fringe Benefits',
        measure: { kind: 'registry', code: 'fringe_benefits' },
      },
      {
        code: 'other_earnings',
        label: 'Other Earnings',
        measure: { kind: 'residual', bucket: 'earnings' },
      },
      {
        code: 'gross_earnings',
        label: 'Gross Earnings',
        measure: { kind: 'total', field: 'grossPay' },
        emphasis: 'section_total',
      },
    ],
  },
  {
    id: 'deductions',
    title: 'DEDUCTIONS',
    lines: [
      { code: 'paye', label: 'PAYE', measure: { kind: 'registry', code: 'paye' } },
      { code: 'uif_employee', label: 'UIF Employee', measure: { kind: 'registry', code: 'uif_employee' } },
      { code: 'medical_aid', label: 'Medical Aid', measure: { kind: 'registry', code: 'medical_aid' } },
      { code: 'retirement', label: 'Retirement', measure: { kind: 'registry', code: 'retirement' } },
      {
        code: 'other_deductions',
        label: 'Other Deductions',
        measure: { kind: 'residual', bucket: 'deductions' },
      },
    ],
  },
  {
    id: 'net_pay',
    title: 'NET PAY',
    lines: [
      {
        code: 'net_pay',
        label: 'Net Pay',
        measure: { kind: 'total', field: 'netPay' },
        emphasis: 'grand_total',
      },
    ],
  },
  {
    id: 'employer_contributions',
    title: 'EMPLOYER CONTRIBUTIONS',
    lines: [
      { code: 'uif_employer', label: 'UIF Employer', measure: { kind: 'registry', code: 'uif_employer' } },
      { code: 'sdl', label: 'SDL', measure: { kind: 'registry', code: 'sdl' } },
      {
        code: 'employer_pension',
        label: 'Employer Pension',
        measure: {
          kind: 'employer_keyword',
          keywords: ['pension', 'provident', 'retirement'],
        },
      },
      {
        code: 'employer_medical',
        label: 'Employer Medical',
        measure: { kind: 'employer_keyword', keywords: ['medical'] },
      },
      {
        code: 'other_employer_contributions',
        label: 'Other Employer Contributions',
        measure: { kind: 'residual', bucket: 'employer' },
      },
    ],
  },
  {
    id: 'cost_to_company',
    title: 'COST TO COMPANY',
    lines: [
      {
        code: 'cost_to_company',
        label: 'Cost to Company',
        measure: { kind: 'total', field: 'costToCompany' },
        emphasis: 'grand_total',
      },
    ],
  },
] as const;

/** Every named payroll component that must appear exactly once per employee. */
export function listVipComponentCodes(): string[] {
  const codes: string[] = [];
  for (const section of VIP_AUDIT_SECTIONS) {
    for (const line of section.lines) codes.push(line.code);
  }
  return codes;
}
