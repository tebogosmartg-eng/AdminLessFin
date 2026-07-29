import { statutoryConstant, type UifBlock } from '../../../../../../registry/types.ts';

export const uif: UifBlock = {
  ceilingMonthly: statutoryConstant(17712, { authority: 'Department of Employment and Labour', sourceDocument: 'UIF Act', pageNumber: 1, sectionReference: 'Monthly ceiling', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  employeeRate: statutoryConstant(0.01, { authority: 'Department of Employment and Labour', sourceDocument: 'UIF Act', pageNumber: 1, sectionReference: 'Employee rate', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  employerRate: statutoryConstant(0.01, { authority: 'Department of Employment and Labour', sourceDocument: 'UIF Act', pageNumber: 1, sectionReference: 'Employer rate', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
