import { statutoryConstant, type ThresholdsBlock } from '../../../../../../registry/types.ts';

export const thresholds: ThresholdsBlock = {
  secondaryRebateAge: statutoryConstant(65, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 2, sectionReference: 'Secondary rebate age', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  tertiaryRebateAge: statutoryConstant(75, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 2, sectionReference: 'Tertiary rebate age', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  taxThresholdUnder65: statutoryConstant(99000, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 2, sectionReference: 'Tax threshold under 65', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  taxThresholdAge65To74: statutoryConstant(153250, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 2, sectionReference: 'Tax threshold 65-74', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  taxThresholdAge75Plus: statutoryConstant(171300, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 2, sectionReference: 'Tax threshold 75+', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
};
