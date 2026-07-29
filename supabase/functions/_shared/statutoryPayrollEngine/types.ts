/**
 * South African Statutory Payroll Engine — core types (V3.0.2)
 */

export type StatutoryEngineId =
  | 'retirement_deduction'
  | 'fringe_benefit'
  | 'travel_allowance'
  | 'medical_tax_credit'
  | 'directors_paye'
  | 'paye'
  | 'uif'
  | 'uif_employer'
  | 'sdl'
  | 'bonus_tax'
  | 'leave_encashment'
  | 'termination_tax';

export type TaxBracket = {
  from: number;
  to: number | null;
  rate: number;
  base: number;
};

export type LumpSumTaxBracket = TaxBracket;

export type StatutoryRuleSet = {
  id?: string;
  taxYearLabel: string;
  ruleVersion: string;
  effectiveFrom: string;
  effectiveTo: string;
  countryCode: string;
  brackets: TaxBracket[];
  rebates: { primary: number; secondary: number; tertiary: number };
  medicalCredits: { mainMember: number; firstDependant: number; additionalDependant: number };
  uifCeilingMonthly: number;
  uifRate: number;
  sdlRate: number;
  sdlExemptionAnnualRemuneration: number;
  retirementDeductionCapAnnual: number;
  retirementDeductionMaxRate: number;
  travelPrescribedRatePerKm: number;
  travelDeemedTaxableNoLogbook: number;
  travelDeemedTaxableMainlyBusiness: number;
  severanceExemptionLifetime: number;
  officialInterestRateAnnual: number;
  vehicleFringeRateEmployerCosts: number;
  vehicleFringeRateEmployeeFuel: number;
  accommodationAbatementAnnual: number;
  furnishedAccommodationAbatementMultiplier: number;
  retirementLumpSumTable: LumpSumTaxBracket[];
  deathBenefitExemption: number;
  /** Secondary rebate qualifies from this age (from SouthAfricanLegislation.thresholds). */
  rebateSecondaryAge: number;
  /** Tertiary rebate qualifies from this age (from SouthAfricanLegislation.thresholds). */
  rebateTertiaryAge: number;
  legislationReference: string;
  /** @deprecated use travelDeemedTaxableMainlyBusiness */
  travelAllowanceTaxablePercent?: number;
};

export type AuditStep = {
  step: string;
  formula: string;
  legislativeReference?: string;
  inputs: Record<string, number | string | boolean | null>;
  intermediate?: Record<string, number>;
  result: number | string;
};

export type StatutoryEngineResult = {
  engineId: StatutoryEngineId;
  engineVersion: string;
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  employeeAmount: number;
  employerAmount: number;
  taxableAdjustment: number;
  breakdown: Record<string, number>;
  auditTrail: AuditStep[];
};

export type FringeBenefitInput =
  | { type: 'company_car'; determinedValue: number; employeePaysFuel?: boolean }
  | { type: 'employer_insurance'; monthlyPremium: number }
  | { type: 'low_interest_loan'; loanBalance: number; actualInterestRateAnnual: number }
  | { type: 'employer_accommodation'; monthlyRentalValue: number; furnished?: boolean }
  | { type: 'employer_asset'; monthlyValueOfUse: number }
  | { type: 'other'; monthlyValue: number; legislativeReference?: string };

export type TravelAllowanceMethod = 'logbook' | 'deemed_80' | 'deemed_20';

export type TravelAllowanceInput = {
  monthlyAllowance: number;
  method?: TravelAllowanceMethod;
  businessKilometres?: number;
  businessUsePercent?: number;
};

export type BonusInput = { amount: number; method?: 'aggregate' | 'annualise' };

export type LeaveEncashmentInput = { days: number; dailyRate: number };

export type TerminationBenefitType =
  | 'retrenchment'
  | 'severance'
  | 'retirement_lump_sum'
  | 'death'
  | 'disability';

export type TerminationInput = {
  benefitType: TerminationBenefitType;
  grossAmount: number;
  gratuityAmount?: number;
  lifetimeSeveranceClaimed?: number;
  lifetimeRetirementLumpSumClaimed?: number;
};

export type DirectorRemunerationType =
  | 'monthly_fixed'
  | 'monthly_variable'
  | 'annual_fee'
  | 'connected_person';

export type DirectorsRemunerationInput = {
  remunerationType: DirectorRemunerationType;
  fixedMonthlyAmount?: number;
  variablePaymentThisPeriod?: number;
  annualFeeAmount?: number;
  isConnectedPerson?: boolean;
  monthsSinceLastPayment?: number;
};

export type StatutoryComponents = {
  medicalDependants?: number;
  retirementContributions?: number;
  fringeBenefits?: FringeBenefitInput[];
  travelAllowance?: TravelAllowanceInput;
  bonus?: BonusInput;
  leaveEncashment?: LeaveEncashmentInput;
  termination?: TerminationInput;
  directors?: DirectorsRemunerationInput;
};

export type YtdContext = {
  taxableIncome?: number;
  payePaid?: number;
  bonusesPaid?: number;
  retirementContributions?: number;
  periodsProcessed?: number;
};

export type PayeCalculationMode = 'standard' | 'director_annual_fee' | 'director_variable';

export type StatutoryEmployeeInput = {
  id: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  employmentType?: string;
  isDirector?: boolean;
};

export type StatutoryPeriodInput = {
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
};

export type AuditMetadata = {
  employeeNumber?: string;
  employeeName?: string;
  companyId?: string;
  companyName?: string;
  payrollRunId?: string;
  commandId?: string;
  correlationId?: string;
  auditReference?: string;
  generatedBy?: string;
};

export type EnabledEngines = Partial<Record<StatutoryEngineId, boolean>>;

export type StatutoryCalculationContext = {
  employee: StatutoryEmployeeInput;
  period: StatutoryPeriodInput;
  ruleSet: StatutoryRuleSet;
  grossEarnings: number;
  taxableEarnings: number;
  enabledEngines: EnabledEngines;
  engineConfig: Record<string, Record<string, unknown>>;
  components?: StatutoryComponents;
  ytd?: YtdContext;
  companyAnnualRemuneration?: number;
  audit?: AuditMetadata;
  payeMode?: PayeCalculationMode;
  directorDeemedTaxable?: number;
};

export type JournalLine = {
  accountRole: 'wages' | 'paye_liability' | 'uif_liability' | 'sdl_expense' | 'bank' | 'other_deduction';
  description: string;
  debit: number;
  credit: number;
  sourceEngine?: StatutoryEngineId;
};

export type PayslipStatutoryLine = {
  engineId: StatutoryEngineId;
  description: string;
  type: 'deduction' | 'employer_contribution' | 'earning';
  amount: number;
};

export type StatutoryPipelineResult = {
  taxYear: string;
  ruleVersion: string;
  calculationVersion: string;
  grossEarnings: number;
  taxableEarnings: number;
  engineResults: StatutoryEngineResult[];
  totalEmployeeDeductions: number;
  totalEmployerContributions: number;
  netPay: number;
  costToCompany: number;
  journalLines: JournalLine[];
  payslipLines: PayslipStatutoryLine[];
  auditTrail: AuditStep[];
  audit?: AuditMetadata;
};
