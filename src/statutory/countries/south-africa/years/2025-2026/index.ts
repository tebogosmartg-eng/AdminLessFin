/**
 * South Africa 2025/2026 — domain-composed legislation package.
 */
import type { CountryLegislationPackage, ValidationRulesBlock } from '../../../../registry/types';
import { computePayloadChecksum, statutoryConstant } from '../../../../registry/types';
import { withChecksum, DOCUMENT_CATALOGUE } from './metadata';
import { taxBrackets } from './legislation/paye';
import { rebates } from './legislation/rebates';
import { medicalCredits } from './legislation/medical';
import { uif } from './legislation/uif';
import { sdl } from './legislation/sdl';
import { retirement } from './legislation/retirement';
import { travel } from './legislation/travel';
import { fringeBenefits } from './legislation/fringe-benefits';
import { irp5 } from './legislation/irp5';
import { emp201 } from './legislation/emp201';
import { thresholds } from './legislation/thresholds';
import { allowances } from './legislation/allowances';
import { deductions } from './legislation/deductions';

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
