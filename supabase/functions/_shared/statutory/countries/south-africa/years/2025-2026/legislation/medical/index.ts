import { statutoryConstant, type MedicalCreditsBlock } from '../../../../../../registry/types.ts';

export const medicalCredits: MedicalCreditsBlock = {
  mainMember: statutoryConstant(364, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 3, sectionReference: '§6A main member', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  firstDependant: statutoryConstant(364, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 3, sectionReference: '§6A first dependant', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  additionalDependant: statutoryConstant(246, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 3, sectionReference: '§6A additional dependant', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
