import { statutoryConstant, type RetirementBlock } from '../../../../../../registry/types';

export const retirement: RetirementBlock = {
  deductionCapAnnual: statutoryConstant(350000, { authority: 'Income Tax Act', sourceDocument: 'Income Tax Act', pageNumber: '§11F', sectionReference: 'Annual cap', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  deductionMaxRate: statutoryConstant(0.275, { authority: 'Income Tax Act', sourceDocument: 'Income Tax Act', pageNumber: '§11F', sectionReference: 'Max rate', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  lumpSumTable: statutoryConstant([{"from":0,"to":550000,"rate":0,"base":0},{"from":550000,"to":770000,"rate":0.18,"base":0},{"from":770000,"to":1155000,"rate":0.27,"base":39600},{"from":1155000,"to":null,"rate":0.36,"base":143550}], { authority: 'Income Tax Act', sourceDocument: 'Income Tax Act', pageNumber: 'Second Schedule', sectionReference: 'Lump-sum table', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  deathBenefitExemption: statutoryConstant(250000, { authority: 'Income Tax Act', sourceDocument: 'Income Tax Act', pageNumber: '§10(1)(gB)', sectionReference: 'Death exemption', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  severanceExemptionLifetime: statutoryConstant(500000, { authority: 'Income Tax Act', sourceDocument: 'Income Tax Act', pageNumber: '§10(1)(x)', sectionReference: 'Severance exemption', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
