/**
 * Payroll Rules Engine — core types (V3)
 */

export type RuleCategory =
  | 'earning'
  | 'statutory'
  | 'benefit'
  | 'deduction'
  | 'employer_contribution'
  | 'custom';

export type TaxableImpact =
  | 'none'
  | 'taxable'
  | 'pre_tax_deduction'
  | 'post_tax_deduction'
  | 'reduces_taxable';

export type AccountingImpact =
  | 'none'
  | 'wages'
  | 'employee_deduction'
  | 'employer_expense'
  | 'employer_liability';

export type PayslipItemType = 'earning' | 'deduction' | 'employer_contribution';

export type PayrollRuleDefinition = {
  id: string;
  name: string;
  category: RuleCategory;
  enabledByDefault: boolean;
  companyConfigurable: boolean;
  employeeConfigurable: boolean;
  calculationOrder: number;
  employeeContribution: boolean;
  employerContribution: boolean;
  taxableImpact: TaxableImpact;
  accountingImpact: AccountingImpact;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  payslipLabel: string;
  description?: string;
};

export type TaxBracket = {
  from: number;
  to: number | null;
  rate: number;
  base: number;
};

export type TaxYearConfig = {
  id?: string;
  taxYearLabel: string;
  effectiveFrom: string;
  effectiveTo: string;
  countryCode: string;
  brackets: TaxBracket[];
  rebates: {
    primary?: number;
    secondary?: number;
    tertiary?: number;
  };
  medicalCredits: {
    mainMember?: number;
    firstDependant?: number;
    additionalDependant?: number;
  };
  uifCeilingMonthly?: number;
  sdlRate?: number;
  uifRate?: number;
};

export type RuleConfigValue = {
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export type EmployeeInput = {
  id: string;
  firstName: string;
  lastName: string;
  salaryAmount: number;
  salaryPeriod: 'monthly' | 'weekly' | 'fortnightly';
  employmentType: string;
  taxNumber?: string | null;
  startDate: string;
  endDate?: string | null;
  age?: number;
};

export type PayrollPeriodInput = {
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
};

export type PayslipLineItem = {
  ruleId: string;
  description: string;
  type: PayslipItemType;
  amount: number;
  taxableImpact: TaxableImpact;
  accountingImpact: AccountingImpact;
};

export type RuleExecutionResult = {
  ruleId: string;
  ruleName: string;
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  employeeAmount: number;
  employerAmount: number;
  lineItems: PayslipLineItem[];
  taxableAdjustment: number;
};

export type PayrollCalculationResult = {
  grossPay: number;
  taxableIncome: number;
  employeeDeductions: Record<string, number>;
  employerContributions: Record<string, number>;
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
  netPay: number;
  costToCompany: number;
  lineItems: PayslipLineItem[];
  ruleExecutionSummary: RuleExecutionResult[];
};

export type PayrollRulesContext = {
  employee: EmployeeInput;
  period: PayrollPeriodInput;
  taxYearConfig: TaxYearConfig;
  companyRuleSettings: Record<string, RuleConfigValue>;
  employeeRuleSettings: Record<string, RuleConfigValue>;
  runRuleOverrides: Record<string, RuleConfigValue>;
  ytdTaxableIncome?: number;
  ytdPayePaid?: number;
};

export type RuleCalculator = {
  ruleId: string;
  calculate: (ctx: PayrollRulesContext, state: CalculationState) => RuleExecutionResult;
};

export type CalculationState = {
  grossPay: number;
  taxableIncome: number;
  lineItems: PayslipLineItem[];
  employeeDeductions: Record<string, number>;
  employerContributions: Record<string, number>;
};
