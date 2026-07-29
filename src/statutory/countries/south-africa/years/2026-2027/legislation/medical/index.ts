import { statutoryConstant, type MedicalCreditsBlock } from '../../../../../../registry/types';

export const medicalCredits: MedicalCreditsBlock = {
  mainMember: statutoryConstant(376, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 3, sectionReference: '§6A main member', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  firstDependant: statutoryConstant(376, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 3, sectionReference: '§6A first dependant', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  additionalDependant: statutoryConstant(254, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 3, sectionReference: '§6A additional dependant', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
};
