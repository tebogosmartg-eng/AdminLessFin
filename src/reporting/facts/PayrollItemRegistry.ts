/**
 * Payroll Item Registry — dynamic report component catalogue (V3.6.4)
 *
 * Reports consume this registry. Adding an item must not require report code changes.
 */

export type PayrollItemCategory =
  | 'earning'
  | 'deduction'
  | 'employer_contribution'
  | 'statutory'
  | 'benefit'
  | 'total';

export type PayrollItemDefinition = {
  code: string;
  description: string;
  category: PayrollItemCategory;
  displayOrder: number;
  reportGroup: 'earnings' | 'deductions' | 'employer' | 'totals' | 'statutory';
  isEarning: boolean;
  isDeduction: boolean;
  isEmployerContribution: boolean;
  /** Keywords matched against finalized line descriptions (lowercase). */
  matchKeywords: string[];
  /** Prefer these calculation_snapshot engine_ids when present. */
  engineIds?: string[];
  engineSide?: 'employee' | 'employer';
  /** Synthetic totals derived from fact headers / sums — not from line items. */
  synthetic?: 'net_pay' | 'cost_to_company' | 'gross_pay';
};

const REGISTRY: PayrollItemDefinition[] = [
  {
    code: 'basic_salary',
    description: 'Basic Salary',
    category: 'earning',
    displayOrder: 10,
    reportGroup: 'earnings',
    isEarning: true,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: ['basic salary', 'basic pay'],
  },
  {
    code: 'overtime',
    description: 'Overtime',
    category: 'earning',
    displayOrder: 20,
    reportGroup: 'earnings',
    isEarning: true,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: ['overtime', 'ot '],
  },
  {
    code: 'bonus',
    description: 'Bonus',
    category: 'earning',
    displayOrder: 30,
    reportGroup: 'earnings',
    isEarning: true,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: ['bonus', 'incentive', '13th'],
  },
  {
    code: 'commission',
    description: 'Commission',
    category: 'earning',
    displayOrder: 40,
    reportGroup: 'earnings',
    isEarning: true,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: ['commission'],
  },
  {
    code: 'travel_allowance',
    description: 'Travel Allowance',
    category: 'earning',
    displayOrder: 50,
    reportGroup: 'earnings',
    isEarning: true,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: ['travel allowance', 'travel'],
  },
  {
    code: 'housing_allowance',
    description: 'Housing Allowance',
    category: 'earning',
    displayOrder: 60,
    reportGroup: 'earnings',
    isEarning: true,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: ['housing allowance', 'housing'],
  },
  {
    code: 'allowances',
    description: 'Allowances',
    category: 'earning',
    displayOrder: 70,
    reportGroup: 'earnings',
    isEarning: true,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: ['allowance'],
  },
  {
    code: 'fringe_benefits',
    description: 'Fringe Benefits',
    category: 'earning',
    displayOrder: 80,
    reportGroup: 'earnings',
    isEarning: true,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: ['fringe', 'taxable benefit', 'company car', 'housing benefit'],
  },
  {
    code: 'retirement',
    description: 'Retirement Contributions',
    category: 'benefit',
    displayOrder: 90,
    reportGroup: 'deductions',
    isEarning: false,
    isDeduction: true,
    isEmployerContribution: false,
    matchKeywords: ['pension', 'provident', 'retirement'],
  },
  {
    code: 'medical_aid',
    description: 'Medical Aid',
    category: 'benefit',
    displayOrder: 100,
    reportGroup: 'deductions',
    isEarning: false,
    isDeduction: true,
    isEmployerContribution: false,
    matchKeywords: ['medical aid', 'medical'],
  },
  {
    code: 'paye',
    description: 'PAYE',
    category: 'statutory',
    displayOrder: 110,
    reportGroup: 'statutory',
    isEarning: false,
    isDeduction: true,
    isEmployerContribution: false,
    matchKeywords: ['paye'],
    engineIds: ['paye', 'directors_paye', 'bonus_tax', 'termination_tax'],
    engineSide: 'employee',
  },
  {
    code: 'uif_employee',
    description: 'UIF Employee',
    category: 'statutory',
    displayOrder: 120,
    reportGroup: 'statutory',
    isEarning: false,
    isDeduction: true,
    isEmployerContribution: false,
    matchKeywords: ['uif'],
    engineIds: ['uif'],
    engineSide: 'employee',
  },
  {
    code: 'uif_employer',
    description: 'UIF Employer',
    category: 'employer_contribution',
    displayOrder: 130,
    reportGroup: 'employer',
    isEarning: false,
    isDeduction: false,
    isEmployerContribution: true,
    matchKeywords: ['uif employer'],
    engineIds: ['uif_employer'],
    engineSide: 'employer',
  },
  {
    code: 'sdl',
    description: 'SDL',
    category: 'employer_contribution',
    displayOrder: 140,
    reportGroup: 'employer',
    isEarning: false,
    isDeduction: false,
    isEmployerContribution: true,
    matchKeywords: ['sdl', 'skills development'],
    engineIds: ['sdl'],
    engineSide: 'employer',
  },
  {
    code: 'net_pay',
    description: 'Net Pay',
    category: 'total',
    displayOrder: 900,
    reportGroup: 'totals',
    isEarning: false,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: [],
    synthetic: 'net_pay',
  },
  {
    code: 'cost_to_company',
    description: 'Cost To Company',
    category: 'total',
    displayOrder: 910,
    reportGroup: 'totals',
    isEarning: false,
    isDeduction: false,
    isEmployerContribution: false,
    matchKeywords: [],
    synthetic: 'cost_to_company',
  },
];

const byCode = new Map(REGISTRY.map((i) => [i.code, i]));

export function listPayrollItems(): readonly PayrollItemDefinition[] {
  return [...REGISTRY].sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getPayrollItem(code: string): PayrollItemDefinition | undefined {
  return byCode.get(code);
}

export function registerPayrollItem(item: PayrollItemDefinition): void {
  const idx = REGISTRY.findIndex((r) => r.code === item.code);
  if (idx >= 0) REGISTRY[idx] = item;
  else REGISTRY.push(item);
  byCode.set(item.code, item);
}

/** Classify a finalized line description to a registry code (first keyword match by displayOrder). */
export function classifyPayrollItemDescription(
  description: string,
  itemType?: string
): PayrollItemDefinition | undefined {
  const lower = description.toLowerCase();
  const candidates = listPayrollItems().filter((i) => !i.synthetic && i.matchKeywords.length > 0);

  for (const item of candidates) {
    if (item.code === 'uif_employee') {
      if (lower.includes('uif') && !lower.includes('employer')) return item;
      continue;
    }
    if (item.code === 'uif_employer') {
      if (lower.includes('uif') && lower.includes('employer')) return item;
      continue;
    }
    if (item.code === 'paye') {
      if (lower.includes('paye')) return item;
      if (lower.includes('tax') && !lower.includes('medical tax') && !lower.includes('tax credit')) return item;
      continue;
    }
    if (item.code === 'allowances') {
      // Prefer specific allowance codes first (already ordered earlier)
      if (
        lower.includes('allowance') &&
        !lower.includes('travel') &&
        !lower.includes('housing')
      ) {
        return item;
      }
      continue;
    }
    if (item.matchKeywords.some((k) => lower.includes(k))) {
      if (itemType === 'earning' && !item.isEarning && item.code !== 'fringe_benefits') continue;
      return item;
    }
  }
  return undefined;
}

/** VIP / audit working-paper item order (subset of registry + synthetic). */
export const VIP_ITEM_CODES: readonly string[] = [
  'basic_salary',
  'overtime',
  'bonus',
  'commission',
  'allowances',
  'fringe_benefits',
  'paye',
  'uif_employee',
  'uif_employer',
  'sdl',
  'retirement',
  'medical_aid',
  'net_pay',
  'cost_to_company',
] as const;
