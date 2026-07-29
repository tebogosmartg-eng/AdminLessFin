import { statutoryConstant, type DeductionsBlock } from '../../../../../../registry/types';

export const deductions: DeductionsBlock = {
  donationDeductionMaxPercent: statutoryConstant(0.1, { authority: 'Income Tax Act', sourceDocument: 'Income Tax Act', pageNumber: '§18A', sectionReference: 'Donations max percent', effectiveFrom: '2026-03-01', effectiveTo: '2027-02-28', legislationVersion: '2026.2.0' }),
};
