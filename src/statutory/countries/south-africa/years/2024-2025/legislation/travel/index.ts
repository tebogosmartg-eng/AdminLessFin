import { statutoryConstant, type TravelBlock } from '../../../../../../registry/types';

export const travel: TravelBlock = {
  prescribedRatePerKm: statutoryConstant(4.76, { authority: 'SARS', sourceDocument: 'PAYE-GEN', pageNumber: 1, sectionReference: 'Prescribed rate per km', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
  deemedTaxableNoLogbook: statutoryConstant(0.8, { authority: 'SARS', sourceDocument: 'PAYE-GEN', pageNumber: 1, sectionReference: 'Deemed taxable no logbook', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
  deemedTaxableMainlyBusiness: statutoryConstant(0.2, { authority: 'SARS', sourceDocument: 'PAYE-GEN', pageNumber: 1, sectionReference: 'Deemed taxable mainly business', effectiveFrom: '2024-03-01', effectiveTo: '2025-02-28', legislationVersion: '2024.2.0' }),
};
