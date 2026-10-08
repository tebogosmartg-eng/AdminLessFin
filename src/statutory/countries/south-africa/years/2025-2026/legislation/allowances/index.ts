import { statutoryConstant, type AllowancesBlock } from '../../../../../../registry/types';

export const allowances: AllowancesBlock = {
  subsistenceDomesticDaily: statutoryConstant(570, { authority: 'SARS', sourceDocument: 'SARS subsistence notice effective 1 March 2025', pageNumber: 1, sectionReference: 'Income Tax Act s8(1)(c)(ii) — meals and incidental costs', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  subsistenceIncidentalDaily: statutoryConstant(176, { authority: 'SARS', sourceDocument: 'SARS subsistence notice effective 1 March 2025', pageNumber: 1, sectionReference: 'Income Tax Act s8(1)(c)(ii) — incidental costs only', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
  subsistenceForeignDaily: statutoryConstant(0, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2025', pageNumber: 4, sectionReference: 'Subsistence foreign daily', effectiveFrom: '2025-03-01', effectiveTo: '2026-02-28', legislationVersion: '2025.2.0' }),
};
