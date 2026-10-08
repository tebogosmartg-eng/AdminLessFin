import { statutoryConstant, type AllowancesBlock } from '../../../../../../registry/types';

export const allowances: AllowancesBlock = {
  subsistenceDomesticDaily: statutoryConstant(595, { authority: 'SARS', sourceDocument: 'SARS Notice 7174 (GG 54218)', pageNumber: 1, sectionReference: 'Income Tax Act s8(1)(c)(ii) — meals and incidental costs', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  subsistenceIncidentalDaily: statutoryConstant(184, { authority: 'SARS', sourceDocument: 'SARS Notice 7174 (GG 54218)', pageNumber: 1, sectionReference: 'Income Tax Act s8(1)(c)(ii) — incidental costs only', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
  subsistenceForeignDaily: statutoryConstant(0, { authority: 'National Treasury / SARS', sourceDocument: 'Budget Tax Guide 2026', pageNumber: 4, sectionReference: 'Subsistence foreign daily', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
};
