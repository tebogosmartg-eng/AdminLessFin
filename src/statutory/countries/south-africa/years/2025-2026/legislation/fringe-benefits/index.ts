import { statutoryConstant, type FringeBenefitsBlock } from '../../../../../../registry/types';

export const fringeBenefits: FringeBenefitsBlock = {
  officialInterestRateAnnual: statutoryConstant(0.085, { authority: 'Income Tax Act', sourceDocument: 'Seventh Schedule', pageNumber: 'para 7(1)(f)', sectionReference: 'Official interest rate', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  vehicleFringeRateEmployerCosts: statutoryConstant(0.035, { authority: 'Income Tax Act', sourceDocument: 'Seventh Schedule', pageNumber: 'para 7(1)(a)', sectionReference: 'Vehicle fringe employer costs', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  vehicleFringeRateEmployeeFuel: statutoryConstant(0.0325, { authority: 'Income Tax Act', sourceDocument: 'Seventh Schedule', pageNumber: 'para 7(1)(b)', sectionReference: 'Vehicle fringe employee fuel', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  accommodationAbatementAnnual: statutoryConstant(30000, { authority: 'Income Tax Act', sourceDocument: 'Seventh Schedule', pageNumber: 'para 9', sectionReference: 'Accommodation abatement', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  furnishedAccommodationAbatementMultiplier: statutoryConstant(1.25, { authority: 'Income Tax Act', sourceDocument: 'Seventh Schedule', pageNumber: 'para 9', sectionReference: 'Furnished accommodation abatement multiplier', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
