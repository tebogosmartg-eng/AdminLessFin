import { statutoryConstant, type SdlBlock } from '../../../../../../registry/types';

export const sdl: SdlBlock = {
  rate: statutoryConstant(0.01, { authority: 'Skills Development Levies Act', sourceDocument: 'SDL Act', pageNumber: 1, sectionReference: 'Levy rate', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  exemptionAnnualRemuneration: statutoryConstant(500000, { authority: 'Skills Development Levies Act', sourceDocument: 'SDL Act', pageNumber: 1, sectionReference: 'Exemption threshold', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
