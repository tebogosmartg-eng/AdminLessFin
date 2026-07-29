import { statutoryConstant, type RebatesBlock } from '../../../../../../registry/types.ts';

export const rebates: RebatesBlock = {
  primary: statutoryConstant(17820, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 2, sectionReference: 'Primary rebate', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  secondary: statutoryConstant(9765, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 2, sectionReference: 'Secondary rebate (65+)', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  tertiary: statutoryConstant(3249, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 2, sectionReference: 'Tertiary rebate (75+)', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
};
