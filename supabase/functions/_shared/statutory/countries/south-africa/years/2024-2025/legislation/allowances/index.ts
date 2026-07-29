import { statutoryConstant, type AllowancesBlock } from '../../../../../../registry/types.ts';

export const allowances: AllowancesBlock = {
  subsistenceDomesticDaily: statutoryConstant(522, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2024', pageNumber: 4, sectionReference: 'Subsistence domestic daily', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
  subsistenceForeignDaily: statutoryConstant(0, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2024', pageNumber: 4, sectionReference: 'Subsistence foreign daily', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
};
