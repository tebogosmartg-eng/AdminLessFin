/**
 * Pay-component catalogue.
 * Cash amounts become payslip earnings. Tax engines add only the taxable slice,
 * so a travel allowance is not taxed twice and a company car never enters net pay.
 *
 * UIF and SDL are levied on Fourth Schedule remuneration: 80% (or 20%) of a travel
 * allowance and of a company car, the subsistence excess, bonuses, taxable cash and
 * taxable fringe benefits. remunerationAddition carries exactly that.
 */

import { calculateFringeBenefitLine } from '../statutoryPayrollEngine/registry/seventhSchedule.ts';
import { calculateSubsistence } from '../statutoryPayrollEngine/registry/subsistence.ts';
import { calculateTravelAllowance } from '../statutoryPayrollEngine/registry/travelAllowance.ts';
import type {
  FringeBenefitInput,
  StatutoryComponents,
  StatutoryEngineId,
  StatutoryRuleSet,
} from '../statutoryPayrollEngine/types.ts';
import { roundCurrency } from '../statutoryPayrollEngine/utils.ts';

export const PAY_COMPONENT_CODES = [
  'travel_allowance',
  'subsistence',
  'bonus',
  'other_cash',
  'fringe_company_car',
  'fringe_employer_insurance',
  'fringe_low_interest_loan',
  'fringe_accommodation',
  'fringe_asset',
  'fringe_other',
] as const;

export type PayComponentCode = (typeof PAY_COMPONENT_CODES)[number];

export type PayComponentDefinition = {
  code: PayComponentCode;
  payslipLabel: string;
  cash: boolean;
  irp5Code: string;
  engineId: StatutoryEngineId | null;
  /**
   * What enters Fourth Schedule remuneration (PAYE base, UIF, SDL):
   * full = whole cash amount; taxable_portion = 80%/20% slice; excess = subsistence above
   * the deemed amount; benefit = fringe value (80%/20% for a car); when_taxable = other cash flagged taxable.
   */
  remuneration: 'full' | 'taxable_portion' | 'excess' | 'benefit' | 'when_taxable';
};

export const PAY_COMPONENT_CATALOG: PayComponentDefinition[] = [
  { code: 'travel_allowance', payslipLabel: 'Travel Allowance', cash: true, irp5Code: '3701', engineId: 'travel_allowance', remuneration: 'taxable_portion' },
  { code: 'subsistence', payslipLabel: 'Subsistence Allowance', cash: true, irp5Code: '3704', engineId: 'subsistence', remuneration: 'excess' },
  { code: 'bonus', payslipLabel: 'Bonus', cash: true, irp5Code: '3605', engineId: 'bonus_tax', remuneration: 'full' },
  { code: 'other_cash', payslipLabel: 'Other Allowance', cash: true, irp5Code: '3713', engineId: null, remuneration: 'when_taxable' },
  { code: 'fringe_company_car', payslipLabel: 'Company Car', cash: false, irp5Code: '3802', engineId: 'fringe_benefit', remuneration: 'benefit' },
  { code: 'fringe_employer_insurance', payslipLabel: 'Employer Insurance', cash: false, irp5Code: '3801', engineId: 'fringe_benefit', remuneration: 'benefit' },
  { code: 'fringe_low_interest_loan', payslipLabel: 'Low Interest Loan', cash: false, irp5Code: '3807', engineId: 'fringe_benefit', remuneration: 'benefit' },
  { code: 'fringe_accommodation', payslipLabel: 'Employer Accommodation', cash: false, irp5Code: '3805', engineId: 'fringe_benefit', remuneration: 'benefit' },
  { code: 'fringe_asset', payslipLabel: 'Use of Employer Asset', cash: false, irp5Code: '3803', engineId: 'fringe_benefit', remuneration: 'benefit' },
  { code: 'fringe_other', payslipLabel: 'Other Taxable Benefit', cash: false, irp5Code: '3801', engineId: 'fringe_benefit', remuneration: 'benefit' },
];

/** Non-taxable other allowance (local). */
const IRP5_NON_TAXABLE_ALLOWANCE = '3714';

/** Most days a subsistence claim can cover in one monthly run. */
const MAX_SUBSISTENCE_DAYS = 31;

const RULE_LINE_LABELS = [
  'Basic Salary',
  'Pension',
  'Provident Fund',
  'Medical Aid',
  'PAYE',
  'UIF',
  'UIF Employer',
  'SDL',
  'Union Fees',
  'Garnishee Order',
  'Custom Deduction',
  'Custom Employer Contribution',
];

const LOCKED_DESCRIPTIONS = new Set<string>([
  ...RULE_LINE_LABELS,
  ...PAY_COMPONENT_CATALOG.map((item) => item.payslipLabel),
]);

export type StoredPayComponent = {
  componentCode: string;
  config: Record<string, unknown>;
  /** package = standing pay package; period = this run only. */
  source?: 'package' | 'period';
};

export type ComponentPayslipLine = {
  description: string;
  type: 'earning' | 'taxable_benefit';
  amount: number;
  componentCode: PayComponentCode;
  irp5Code: string;
};

export type PayComponentAssembly = {
  lines: ComponentPayslipLine[];
  /** Cash added on top of basic salary. This is part of total earnings and the wages debit. */
  cashGross: number;
  /**
   * Fully taxable cash that has no engine of its own (taxable other allowances).
   * Travel, subsistence, bonus, and fringe are left for their engines so they are not added twice.
   */
  taxableBaseAddition: number;
  /** Part of taxableBaseAddition that is a once-off (annual) payment, taxed by the SARS difference method. */
  nonPeriodicTaxable: number;
  /** UIF and SDL remuneration added on top of basic salary (Fourth Schedule inclusion). */
  remunerationAddition: number;
  components: StatutoryComponents;
  enabledEngines: Partial<Record<StatutoryEngineId, boolean>>;
};

/** A pay component that cannot be calculated as entered. The message is for the person entering it. */
export class PayComponentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayComponentError';
  }
}

export function getPayComponent(code: string): PayComponentDefinition | undefined {
  return PAY_COMPONENT_CATALOG.find((item) => item.code === code);
}

export function mergePayComponents(
  recurring: StoredPayComponent[],
  periodInputs: StoredPayComponent[]
): StoredPayComponent[] {
  const merged = new Map<string, StoredPayComponent>();
  for (const row of recurring) merged.set(row.componentCode, { ...row, source: 'package' });
  for (const row of periodInputs) merged.set(row.componentCode, { ...row, source: 'period' });
  return PAY_COMPONENT_CODES.flatMap((code) => {
    const row = merged.get(code);
    return row ? [row] : [];
  });
}

export function isComponentEffective(
  row: { active?: boolean | null; effective_from?: string | null; effective_to?: string | null },
  payDate: string
): boolean {
  if (row.active === false) return false;
  const date = payDate.slice(0, 10);
  if (row.effective_from && date < row.effective_from) return false;
  if (row.effective_to && date > row.effective_to) return false;
  return true;
}

/** Reads a money/number field. Blank is 0; negative or non-numeric is refused. */
function amountOf(config: Record<string, unknown>, keys: string[], what: string): number {
  for (const key of keys) {
    const raw = config[key];
    if (raw == null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new PayComponentError(`${what} must be a number.`);
    if (value < 0) throw new PayComponentError(`${what} cannot be negative.`);
    return value;
  }
  return 0;
}

function rateOf(config: Record<string, unknown>, keys: string[], what: string): number {
  const value = amountOf(config, keys, what);
  if (value > 1) throw new PayComponentError(`${what} is a fraction between 0 and 1 (e.g. 0.05 for 5%).`);
  return value;
}

function flag(config: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => config[key] === true);
}

function labelOf(config: Record<string, unknown>, fallback: string): string {
  const label = typeof config.label === 'string' ? config.label.trim() : '';
  return label || fallback;
}

function fringeInput(code: PayComponentCode, config: Record<string, unknown>): FringeBenefitInput | null {
  switch (code) {
    case 'fringe_company_car': {
      const determinedValue = amountOf(config, ['determinedValue', 'determined_value'], 'Determined value');
      if (determinedValue <= 0) return null;
      return {
        type: 'company_car',
        determinedValue,
        maintenancePlan: flag(config, 'maintenancePlan', 'maintenance_plan'),
        mainlyBusinessUse: flag(config, 'mainlyBusinessUse', 'mainly_business_use'),
      };
    }
    case 'fringe_employer_insurance': {
      const monthlyPremium = amountOf(config, ['monthlyPremium', 'monthly_premium'], 'Monthly premium');
      if (monthlyPremium <= 0) return null;
      return { type: 'employer_insurance', monthlyPremium };
    }
    case 'fringe_low_interest_loan': {
      const loanBalance = amountOf(config, ['loanBalance', 'loan_balance'], 'Loan balance');
      if (loanBalance <= 0) return null;
      return {
        type: 'low_interest_loan',
        loanBalance,
        actualInterestRateAnnual: rateOf(config, ['actualInterestRateAnnual', 'actual_interest_rate_annual'], 'Interest rate charged'),
      };
    }
    case 'fringe_accommodation': {
      const monthlyRentalValue = amountOf(config, ['monthlyRentalValue', 'monthly_rental_value'], 'Monthly rental value');
      if (monthlyRentalValue <= 0) return null;
      return { type: 'employer_accommodation', monthlyRentalValue, furnished: config.furnished === true };
    }
    case 'fringe_asset': {
      const monthlyValueOfUse = amountOf(config, ['monthlyValueOfUse', 'monthly_value_of_use'], 'Monthly value of use');
      if (monthlyValueOfUse <= 0) return null;
      return { type: 'employer_asset', monthlyValueOfUse };
    }
    case 'fringe_other': {
      const monthlyValue = amountOf(config, ['monthlyValue', 'monthly_value', 'amount'], 'Monthly value');
      if (monthlyValue <= 0) return null;
      return { type: 'other', monthlyValue };
    }
    default:
      return null;
  }
}

export function assemblePayComponents(
  rows: StoredPayComponent[],
  ruleSet: StatutoryRuleSet
): PayComponentAssembly {
  const lines: ComponentPayslipLine[] = [];
  let cashGross = 0;
  let taxableBaseAddition = 0;
  let nonPeriodicTaxable = 0;
  let remunerationAddition = 0;
  const components: StatutoryComponents = {};
  const enabledEngines: Partial<Record<StatutoryEngineId, boolean>> = {};
  const fringeBenefits: FringeBenefitInput[] = [];

  for (const row of rows) {
    const definition = getPayComponent(row.componentCode);
    if (!definition) {
      throw new PayComponentError(`Unknown pay component "${row.componentCode}".`);
    }
    const config = row.config ?? {};

    if (definition.code === 'travel_allowance') {
      const monthlyAllowance = amountOf(config, ['monthlyAllowance', 'monthly_allowance', 'amount'], 'Travel allowance');
      if (monthlyAllowance <= 0) continue;
      if (config.method === 'logbook') {
        throw new PayComponentError(
          'PAYE on a travel allowance uses 80%, or 20% for mainly business use. A logbook is applied on assessment, not in payroll.'
        );
      }
      const method = config.method === 'deemed_20' ? 'deemed_20' : 'deemed_80';
      components.travelAllowance = { monthlyAllowance, method };
      const { taxablePortion } = calculateTravelAllowance(components.travelAllowance, ruleSet);
      enabledEngines.travel_allowance = true;
      cashGross += monthlyAllowance;
      remunerationAddition += taxablePortion;
      lines.push({
        description: definition.payslipLabel,
        type: 'earning',
        amount: roundCurrency(monthlyAllowance),
        componentCode: definition.code,
        irp5Code: definition.irp5Code,
      });
      continue;
    }

    if (definition.code === 'subsistence') {
      if (config.domestic === false) {
        throw new PayComponentError('Foreign subsistence is not calculated until a SARS country rate table is loaded.');
      }
      const days = amountOf(config, ['days'], 'Days away');
      const amountPaid = amountOf(config, ['amountPaid', 'amount_paid', 'amount'], 'Subsistence paid');
      if (days <= 0 && amountPaid <= 0) continue;
      if (!Number.isInteger(days) || days < 1 || days > MAX_SUBSISTENCE_DAYS) {
        throw new PayComponentError(`Days away must be a whole number from 1 to ${MAX_SUBSISTENCE_DAYS}.`);
      }
      if (amountPaid <= 0) throw new PayComponentError('Enter the subsistence amount paid.');
      const incidentalOnly = flag(config, 'incidentalOnly', 'incidental_only');
      const rate = incidentalOnly ? ruleSet.subsistenceIncidentalDaily : ruleSet.subsistenceDomesticDaily;
      if (!rate || rate <= 0) {
        throw new PayComponentError(`The SARS subsistence rate for ${ruleSet.taxYearLabel} is not loaded.`);
      }
      const input = { days, amountPaid, domestic: true, incidentalOnly };
      const result = calculateSubsistence(input, ruleSet);
      components.subsistence = input;
      enabledEngines.subsistence = true;
      cashGross += amountPaid;
      remunerationAddition += result.excess;
      lines.push({
        description: definition.payslipLabel,
        type: 'earning',
        amount: roundCurrency(amountPaid),
        componentCode: definition.code,
        irp5Code: definition.irp5Code,
      });
      continue;
    }

    if (definition.code === 'bonus') {
      const amount = amountOf(config, ['amount'], 'Bonus');
      if (amount <= 0) continue;
      components.bonus = { amount, method: 'aggregate' };
      enabledEngines.bonus_tax = true;
      cashGross += amount;
      remunerationAddition += amount;
      lines.push({
        description: definition.payslipLabel,
        type: 'earning',
        amount: roundCurrency(amount),
        componentCode: definition.code,
        irp5Code: definition.irp5Code,
      });
      continue;
    }

    if (definition.code === 'other_cash') {
      const amount = amountOf(config, ['amount'], 'Allowance');
      if (amount <= 0) continue;
      const taxable = config.taxable !== false;
      // A run-level input is once-off unless marked recurring; a package line recurs.
      const onceOff = typeof config.onceOff === 'boolean' ? config.onceOff : row.source === 'period';
      cashGross += amount;
      if (taxable) {
        taxableBaseAddition += amount;
        remunerationAddition += amount;
        if (onceOff) nonPeriodicTaxable += amount;
      }
      lines.push({
        description: labelOf(config, definition.payslipLabel),
        type: 'earning',
        amount: roundCurrency(amount),
        componentCode: definition.code,
        irp5Code: taxable ? definition.irp5Code : IRP5_NON_TAXABLE_ALLOWANCE,
      });
      continue;
    }

    const benefit = fringeInput(definition.code, config);
    if (!benefit) continue;
    const valued = calculateFringeBenefitLine(benefit, ruleSet);
    if (valued.taxableValue <= 0) continue;
    fringeBenefits.push(benefit);
    enabledEngines.fringe_benefit = true;
    remunerationAddition += valued.remunerationValue;
    lines.push({
      description: labelOf(config, definition.payslipLabel),
      type: 'taxable_benefit',
      amount: valued.taxableValue,
      componentCode: definition.code,
      irp5Code: definition.irp5Code,
    });
  }

  if (fringeBenefits.length) components.fringeBenefits = fringeBenefits;

  return {
    lines,
    cashGross: roundCurrency(cashGross),
    taxableBaseAddition: roundCurrency(taxableBaseAddition),
    nonPeriodicTaxable: roundCurrency(nonPeriodicTaxable),
    remunerationAddition: roundCurrency(remunerationAddition),
    components,
    enabledEngines,
  };
}

export type PayslipLineIdentity = {
  description: string;
  type: string;
  amount: number;
  component_code?: string | null;
};

export function isCalculatedPayslipLine(line: PayslipLineIdentity): boolean {
  if (line.component_code) return true;
  if (line.type === 'taxable_benefit' || line.type === 'employer_contribution') return true;
  return LOCKED_DESCRIPTIONS.has(line.description);
}

/**
 * Calculated lines (package, statutory, basic salary) cannot be rewritten on the payslip.
 * Amounts change through the package or the period-input grid, then regenerate.
 */
export function payslipEditError(
  existing: PayslipLineIdentity[],
  incoming: PayslipLineIdentity[]
): string | null {
  for (const line of existing) {
    if (!isCalculatedPayslipLine(line)) continue;
    const match = incoming.find(
      (item) => item.description === line.description && item.type === line.type
    );
    if (!match) {
      return `Calculated line "${line.description}" cannot be removed. Change the pay package or period inputs and regenerate.`;
    }
    if (roundCurrency(match.amount) !== roundCurrency(line.amount)) {
      return `Calculated line "${line.description}" is read-only. Change the pay package or period inputs and regenerate.`;
    }
  }

  for (const line of incoming) {
    const known = existing.some(
      (item) => item.description === line.description && item.type === line.type
    );
    if (!known) {
      return 'Add once-off amounts as period inputs, then regenerate the payslip.';
    }
  }

  return null;
}
