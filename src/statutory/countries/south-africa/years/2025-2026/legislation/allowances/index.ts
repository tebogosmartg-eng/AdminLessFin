import { statutoryConstant, type AllowancesBlock } from '../../../../../../registry/types';

export const allowances: AllowancesBlock = {
  subsistenceDomesticDaily: statutoryConstant(522, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 4, sectionReference: 'Subsistence domestic daily', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  subsistenceForeignDaily: statutoryConstant(0, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 4, sectionReference: 'Subsistence foreign daily', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
