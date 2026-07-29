import { statutoryConstant, type ThresholdsBlock } from '../../../../../../registry/types';

export const thresholds: ThresholdsBlock = {
  secondaryRebateAge: statutoryConstant(65, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2024', pageNumber: 2, sectionReference: 'Secondary rebate age', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
  tertiaryRebateAge: statutoryConstant(75, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2024', pageNumber: 2, sectionReference: 'Tertiary rebate age', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
  taxThresholdUnder65: statutoryConstant(95750, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2024', pageNumber: 2, sectionReference: 'Tax threshold under 65', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
  taxThresholdAge65To74: statutoryConstant(148217, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2024', pageNumber: 2, sectionReference: 'Tax threshold 65-74', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
  taxThresholdAge75Plus: statutoryConstant(165689, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2024', pageNumber: 2, sectionReference: 'Tax threshold 75+', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
};
