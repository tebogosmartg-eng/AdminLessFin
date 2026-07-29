/**
 * South Africa 2025/2026 — domain-composed legislation package.
 */
import type { CountryLegislationPackage, ValidationRulesBlock } from '../../../../registry/types.ts';
import { computePayloadChecksum, statutoryConstant } from '../../../../registry/types.ts';
import { withChecksum, DOCUMENT_CATALOGUE } from './metadata.ts';
import { taxBrackets } from './legislation/paye/index.ts';
import { rebates } from './legislation/rebates/index.ts';
import { medicalCredits } from './legislation/medical/index.ts';
import { uif } from './legislation/uif/index.ts';
import { sdl } from './legislation/sdl/index.ts';
import { retirement } from './legislation/retirement/index.ts';
import { travel } from './legislation/travel/index.ts';
import { fringeBenefits } from './legislation/fringe-benefits/index.ts';
import { irp5 } from './legislation/irp5/index.ts';
import { emp201 } from './legislation/emp201/index.ts';
import { thresholds } from './legislation/thresholds/index.ts';
import { allowances } from './legislation/allowances/index.ts';
import { deductions } from './legislation/deductions/index.ts';

const validationRules: ValidationRulesBlock = {
  requireEmployeeTaxReference: statutoryConstant(true, {
    authority: 'SARS', sourceDocument: 'EMP201 Guide', pageNumber: 1, sectionReference: 'Validation',
    effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0',
  }),
  requirePayeReconciliation: statutoryConstant(true, {
    authority: 'SARS', sourceDocument: 'EMP201 Guide', pageNumber: 1, sectionReference: 'Validation',
    effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0',
  }),
  requireUifDeclaration: statutoryConstant(true, {
    authority: 'SARS', sourceDocument: 'EMP201 Guide', pageNumber: 1, sectionReference: 'Validation',
    effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0',
  }),
  requireSdlDeclaration: statutoryConstant(true, {
    authority: 'SARS', sourceDocument: 'EMP201 Guide', pageNumber: 1, sectionReference: 'Validation',
    effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0',
  }),
};

const draft = {
  taxBrackets,
  rebates,
  medicalCredits,
  uif,
  sdl,
  retirement,
  travel,
  fringeBenefits,
  thresholds,
  allowances,
  deductions,
  irp5,
  emp201,
  validationRules,
};

const checksum = computePayloadChecksum(draft);

export const RULE_SET_2025_2026: CountryLegislationPackage = {
  metadata: withChecksum(checksum),
  ...draft,
};

export default RULE_SET_2025_2026;
