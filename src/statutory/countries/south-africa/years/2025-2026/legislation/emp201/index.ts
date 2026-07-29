import { statutoryConstant, type Emp201Block } from '../../../../../../registry/types';

export const emp201: Emp201Block = {
  paye: statutoryConstant('PAYE', { authority: 'SARS', sourceDocument: 'EMP201 Guide', pageNumber: 1, sectionReference: 'PAYE field', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  uif: statutoryConstant('UIF', { authority: 'SARS', sourceDocument: 'EMP201 Guide', pageNumber: 1, sectionReference: 'UIF field', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  sdl: statutoryConstant('SDL', { authority: 'SARS', sourceDocument: 'EMP201 Guide', pageNumber: 1, sectionReference: 'SDL field', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
