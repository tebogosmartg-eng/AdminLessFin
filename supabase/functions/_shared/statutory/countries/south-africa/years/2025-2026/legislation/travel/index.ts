import { statutoryConstant, type TravelBlock } from '../../../../../../registry/types.ts';

export const travel: TravelBlock = {
  prescribedRatePerKm: statutoryConstant(4.76, { authority: 'SARS', sourceDocument: 'PAYE-GEN', pageNumber: 1, sectionReference: 'Prescribed rate per km', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  deemedTaxableNoLogbook: statutoryConstant(0.8, { authority: 'SARS', sourceDocument: 'PAYE-GEN', pageNumber: 1, sectionReference: 'Deemed taxable no logbook', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  deemedTaxableMainlyBusiness: statutoryConstant(0.2, { authority: 'SARS', sourceDocument: 'PAYE-GEN', pageNumber: 1, sectionReference: 'Deemed taxable mainly business', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
