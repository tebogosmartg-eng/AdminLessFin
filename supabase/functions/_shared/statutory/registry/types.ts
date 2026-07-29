/**
 * Country-agnostic statutory types (V3.4.2)
 * Every constant must carry full provenance — no bare numbers.
 */

export type TaxBracket = {
  from: number;
  to: number | null;
  rate: number;
  base: number;
};

export type LumpSumTaxBracket = TaxBracket;

export type ProvenanceFields = {
  authority: string;
  sourceDocument: string;
  pageNumber: number | string;
  sectionReference: string;
  effectiveFrom: string;
  effectiveTo: string;
  legislationVersion: string;
};

/** Immutable statutory constant — value + complete provenance + checksum. */
export type StatutoryConstant<T> = ProvenanceFields & {
  readonly value: T;
  readonly checksum: string;
};

export type LegislationStatus = 'draft' | 'implemented' | 'certified';

export type DocumentCatalogueEntry = {
  id: string;
  title: string;
  filename: string;
  authority: string;
  required: true;
};

export type CountryCode = string;

export type LegislationPackageMetadata = {
  country: string;
  countryCode: CountryCode;
  taxYear: string;
  ruleVersion: string;
  effectiveFrom: string;
  effectiveTo: string;
  authority: string;
  status: LegislationStatus;
  certifiedDate: string | null;
  implementedBy: string;
  checksum: string;
  gazetteReference: string;
  budgetReference: string;
  documentCatalogue: DocumentCatalogueEntry[];
};

export type RebatesBlock = {
  primary: StatutoryConstant<number>;
  secondary: StatutoryConstant<number>;
  tertiary: StatutoryConstant<number>;
};

export type MedicalCreditsBlock = {
  mainMember: StatutoryConstant<number>;
  firstDependant: StatutoryConstant<number>;
  additionalDependant: StatutoryConstant<number>;
};

export type UifBlock = {
  ceilingMonthly: StatutoryConstant<number>;
  employeeRate: StatutoryConstant<number>;
  employerRate: StatutoryConstant<number>;
};

export type SdlBlock = {
  rate: StatutoryConstant<number>;
  exemptionAnnualRemuneration: StatutoryConstant<number>;
};

export type RetirementBlock = {
  deductionCapAnnual: StatutoryConstant<number>;
  deductionMaxRate: StatutoryConstant<number>;
  lumpSumTable: StatutoryConstant<LumpSumTaxBracket[]>;
  deathBenefitExemption: StatutoryConstant<number>;
  severanceExemptionLifetime: StatutoryConstant<number>;
};

export type TravelBlock = {
  prescribedRatePerKm: StatutoryConstant<number>;
  deemedTaxableNoLogbook: StatutoryConstant<number>;
  deemedTaxableMainlyBusiness: StatutoryConstant<number>;
};

export type FringeBenefitsBlock = {
  officialInterestRateAnnual: StatutoryConstant<number>;
  vehicleFringeRateEmployerCosts: StatutoryConstant<number>;
  vehicleFringeRateEmployeeFuel: StatutoryConstant<number>;
  accommodationAbatementAnnual: StatutoryConstant<number>;
  /** Seventh Schedule para 9 — furnished accommodation increases the abatement by this factor. */
  furnishedAccommodationAbatementMultiplier: StatutoryConstant<number>;
};

export type ThresholdsBlock = {
  secondaryRebateAge: StatutoryConstant<number>;
  tertiaryRebateAge: StatutoryConstant<number>;
  taxThresholdUnder65: StatutoryConstant<number>;
  taxThresholdAge65To74: StatutoryConstant<number>;
  taxThresholdAge75Plus: StatutoryConstant<number>;
};

export type AllowancesBlock = {
  subsistenceDomesticDaily: StatutoryConstant<number>;
  subsistenceForeignDaily: StatutoryConstant<number>;
};

export type DeductionsBlock = {
  donationDeductionMaxPercent: StatutoryConstant<number>;
};

export type Irp5Block = {
  income: StatutoryConstant<string>;
  annualPayment: StatutoryConstant<string>;
  travelAllowance: StatutoryConstant<string>;
  useOfMotorVehicle: StatutoryConstant<string>;
  medicalSchemeContributions: StatutoryConstant<string>;
  paye: StatutoryConstant<string>;
  uifEmployee: StatutoryConstant<string>;
  retirementFundEmployee: StatutoryConstant<string>;
  pensionProvidentCurrent: StatutoryConstant<string>;
};

export type Emp201Block = {
  paye: StatutoryConstant<string>;
  uif: StatutoryConstant<string>;
  sdl: StatutoryConstant<string>;
};

export type ValidationRulesBlock = {
  requireEmployeeTaxReference: StatutoryConstant<boolean>;
  requirePayeReconciliation: StatutoryConstant<boolean>;
  requireUifDeclaration: StatutoryConstant<boolean>;
  requireSdlDeclaration: StatutoryConstant<boolean>;
};

/** Country tax-year legislation package (flat composition of domains). */
export type CountryLegislationPackage = {
  readonly metadata: LegislationPackageMetadata;
  readonly taxBrackets: readonly StatutoryConstant<TaxBracket>[];
  readonly rebates: RebatesBlock;
  readonly medicalCredits: MedicalCreditsBlock;
  readonly uif: UifBlock;
  readonly sdl: SdlBlock;
  readonly retirement: RetirementBlock;
  readonly travel: TravelBlock;
  readonly fringeBenefits: FringeBenefitsBlock;
  readonly thresholds: ThresholdsBlock;
  readonly allowances: AllowancesBlock;
  readonly deductions: DeductionsBlock;
  readonly irp5: Irp5Block;
  readonly emp201: Emp201Block;
  readonly validationRules: ValidationRulesBlock;
};

/** @deprecated alias — SA consumers */
export type SouthAfricanLegislation = CountryLegislationPackage;

export class LegislationResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegislationResolutionError';
  }
}

export class LegislationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegislationValidationError';
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function computePayloadChecksum(payload: unknown): string {
  return fnv1a(stableStringify(payload));
}

export function statutoryConstant<T>(
  value: T,
  provenance: ProvenanceFields
): StatutoryConstant<T> {
  const checksum = fnv1a(stableStringify({ value, ...provenance }));
  return { value, ...provenance, checksum };
}

export function unwrap<T>(c: StatutoryConstant<T>): T {
  return c.value;
}
