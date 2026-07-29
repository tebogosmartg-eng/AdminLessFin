import { statutoryConstant, type RebatesBlock } from '../../../../../../registry/types.ts';

export const rebates: RebatesBlock = {
  primary: statutoryConstant(17235, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 2, sectionReference: 'Primary rebate', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  secondary: statutoryConstant(9444, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 2, sectionReference: 'Secondary rebate (65+)', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  tertiary: statutoryConstant(3145, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 2, sectionReference: 'Tertiary rebate (75+)', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
