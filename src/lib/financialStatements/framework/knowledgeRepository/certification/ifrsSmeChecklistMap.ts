/**
 * IFRS for SMEs Disclosure Checklist — certification asset (V14.2).
 *
 * Source: IASB Agenda Paper 6B Attachment (ED disclosure checklist, 2008).
 * This module is NOT loaded as runtime document logic and does NOT embed the PDF.
 * It maps checklist paragraphs → repository disclosure codes for certification
 * traceability and coverage measurement.
 */
import type { ChecklistRequirement } from '../types';

/**
 * Representative mapping of ED checklist paragraphs to repository disclosure codes.
 * Coverage reflects the V14.0 review baseline against the current knowledge packs.
 */
export const IFRS_SME_ED_CHECKLIST_2008: ChecklistRequirement[] = [
  { id: 'SME-ED-3.2', paragraph: '3.2', section: '3', title: 'Compliance with IFRS for SMEs', disclosureCodes: ['DISC.BASIS'], coverage: 'partial' },
  { id: 'SME-ED-3.20', paragraph: '3.20', section: '3', title: 'Identification of financial statements', disclosureCodes: ['DISC.GENERAL'], coverage: 'implemented' },
  { id: 'SME-ED-4.2', paragraph: '4.2', section: '4', title: 'Balance sheet face information', disclosureCodes: ['DISC.PPE', 'DISC.SHARECAPITAL'], coverage: 'partial' },
  { id: 'SME-ED-4.13', paragraph: '4.13', section: '4', title: 'Share capital disclosures', disclosureCodes: ['DISC.SHARECAPITAL'], coverage: 'partial' },
  { id: 'SME-ED-5.3', paragraph: '5.3', section: '5', title: 'Income statement face information', disclosureCodes: ['DISC.REVENUE', 'DISC.TAX'], coverage: 'partial' },
  { id: 'SME-ED-6.2', paragraph: '6.2', section: '6', title: 'Statement of changes in equity', disclosureCodes: [], coverage: 'partial' },
  { id: 'SME-ED-7.3', paragraph: '7.3', section: '7', title: 'Cash flow statement', disclosureCodes: ['DISC.CASHFLOW'], coverage: 'partial' },
  { id: 'SME-ED-8.5', paragraph: '8.5', section: '8', title: 'Summary of significant accounting policies', disclosureCodes: ['DISC.POLICIES'], coverage: 'implemented' },
  { id: 'SME-ED-8.6', paragraph: '8.6', section: '8', title: 'Judgements', disclosureCodes: ['DISC.JUDGEMENTS'], coverage: 'implemented' },
  { id: 'SME-ED-8.7', paragraph: '8.7', section: '8', title: 'Estimation uncertainty', disclosureCodes: ['DISC.JUDGEMENTS'], coverage: 'implemented' },
  { id: 'SME-ED-8.8', paragraph: '8.8', section: '8', title: 'Capital requirements', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-10.11', paragraph: '10.11', section: '10', title: 'Change in accounting policy', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-10.16', paragraph: '10.16', section: '10', title: 'Change in estimate', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-10.23', paragraph: '10.23', section: '10', title: 'Prior period errors', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-11.40', paragraph: '11.40', section: '11', title: 'Accounting policies for financial instruments', disclosureCodes: ['POL.FININST', 'DISC.FININST'], coverage: 'partial' },
  { id: 'SME-ED-11.41', paragraph: '11.41', section: '11', title: 'Categories of financial instruments', disclosureCodes: ['DISC.FININST'], coverage: 'partial' },
  { id: 'SME-ED-12.21', paragraph: '12.21', section: '12', title: 'Inventories', disclosureCodes: ['DISC.INVENTORIES', 'POL.INVENTORY'], coverage: 'partial' },
  { id: 'SME-ED-13.7', paragraph: '13.7', section: '13', title: 'Investments in associates', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-14.16', paragraph: '14.16', section: '14', title: 'Investments in joint ventures', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-15.5', paragraph: '15.5', section: '15', title: 'Investment property fair value', disclosureCodes: ['DISC.INVPROP', 'POL.INVPROP'], coverage: 'partial' },
  { id: 'SME-ED-16.29', paragraph: '16.29', section: '16', title: 'PPE class disclosures', disclosureCodes: ['DISC.PPE', 'POL.PPE'], coverage: 'partial' },
  { id: 'SME-ED-17.32', paragraph: '17.32', section: '17', title: 'Intangible assets', disclosureCodes: ['DISC.INTANGIBLES', 'POL.INTANGIBLES'], coverage: 'partial' },
  { id: 'SME-ED-18.23', paragraph: '18.23', section: '18', title: 'Business combinations', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-19.12', paragraph: '19.12', section: '19', title: 'Finance leases — lessee', disclosureCodes: ['DISC.LEASES', 'POL.LEASES'], coverage: 'partial' },
  { id: 'SME-ED-20.14', paragraph: '20.14', section: '20', title: 'Provisions', disclosureCodes: ['DISC.PROVISIONS', 'POL.PROVISIONS'], coverage: 'partial' },
  { id: 'SME-ED-20.15', paragraph: '20.15', section: '20', title: 'Contingent liabilities', disclosureCodes: ['DISC.CONTINGENT'], coverage: 'partial' },
  { id: 'SME-ED-22.28', paragraph: '22.28', section: '22', title: 'Revenue', disclosureCodes: ['DISC.REVENUE', 'POL.REVENUE'], coverage: 'partial' },
  { id: 'SME-ED-23.65', paragraph: '23.65', section: '23', title: 'Government grants', disclosureCodes: ['POL.GRANTS'], coverage: 'partial' },
  { id: 'SME-ED-24.5', paragraph: '24.5', section: '24', title: 'Borrowing costs policy', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-25.8', paragraph: '25.8', section: '25', title: 'Share-based payment', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-26.25', paragraph: '26.25', section: '26', title: 'Impairment', disclosureCodes: ['POL.IMPAIRMENT', 'DISC.PPE'], coverage: 'partial' },
  { id: 'SME-ED-27.37', paragraph: '27.37', section: '27', title: 'Defined contribution cost', disclosureCodes: ['DISC.EMPLOYEE', 'POL.EMPLOYEE'], coverage: 'partial' },
  { id: 'SME-ED-28.28', paragraph: '28.28', section: '28', title: 'Income tax components', disclosureCodes: ['DISC.TAX', 'POL.TAX'], coverage: 'partial' },
  { id: 'SME-ED-29.2', paragraph: '29.2', section: '29', title: 'Hyperinflation', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-30.26', paragraph: '30.26', section: '30', title: 'Foreign currency', disclosureCodes: ['POL.FOREX'], coverage: 'partial' },
  { id: 'SME-ED-31.1', paragraph: '31.1', section: '31', title: 'Segment reporting', disclosureCodes: [], coverage: 'not_applicable' },
  { id: 'SME-ED-32.8', paragraph: '32.8', section: '32', title: 'Events after reporting period', disclosureCodes: ['DISC.EVENTS'], coverage: 'implemented' },
  { id: 'SME-ED-33.6', paragraph: '33.6', section: '33', title: 'Related party relationships', disclosureCodes: ['DISC.RELATED'], coverage: 'implemented' },
  { id: 'SME-ED-33.9', paragraph: '33.9', section: '33', title: 'Related party transactions', disclosureCodes: ['DISC.RELATED'], coverage: 'implemented' },
  { id: 'SME-ED-34.1', paragraph: '34.1', section: '34', title: 'Earnings per share', disclosureCodes: [], coverage: 'not_applicable' },
  { id: 'SME-ED-35.1', paragraph: '35.1', section: '35', title: 'Specialised industries', disclosureCodes: ['DISC.BIOLOGICAL'], coverage: 'partial' },
  { id: 'SME-ED-36.2', paragraph: '36.2', section: '36', title: 'Discontinued operations', disclosureCodes: [], coverage: 'not_implemented' },
  { id: 'SME-ED-37.1', paragraph: '37.1', section: '37', title: 'Interim reporting', disclosureCodes: [], coverage: 'not_applicable' },
  { id: 'SME-ED-38.10', paragraph: '38.10', section: '38', title: 'Transition to IFRS for SMEs', disclosureCodes: [], coverage: 'not_implemented' },
];

export const CERTIFICATION_ASSET_IFRS_SME_ED_2008 = 'cert://ifrs-sme/ed-checklist-2008';

export function listChecklistRequirements(): ChecklistRequirement[] {
  return IFRS_SME_ED_CHECKLIST_2008;
}

export function checklistRefsForDisclosure(code: string): string[] {
  return IFRS_SME_ED_CHECKLIST_2008.filter((r) => r.disclosureCodes.includes(code)).map((r) => r.id);
}

export function measureChecklistCoverage(requirements: ChecklistRequirement[] = IFRS_SME_ED_CHECKLIST_2008): {
  total: number;
  applicable: number;
  implemented: number;
  partial: number;
  notImplemented: number;
  notApplicable: number;
  weightedPercent: number;
} {
  const applicable = requirements.filter((r) => r.coverage !== 'not_applicable');
  const implemented = applicable.filter((r) => r.coverage === 'implemented').length;
  const partial = applicable.filter((r) => r.coverage === 'partial').length;
  const notImplemented = applicable.filter((r) => r.coverage === 'not_implemented').length;
  const weighted = implemented + partial * 0.5;
  return {
    total: requirements.length,
    applicable: applicable.length,
    implemented,
    partial,
    notImplemented,
    notApplicable: requirements.length - applicable.length,
    weightedPercent: applicable.length ? Math.round((1000 * weighted) / applicable.length) / 10 : 0,
  };
}

/** Lookup table: disclosure code → checklist requirement ids. */
export function buildDisclosureChecklistIndex(
  requirements: ChecklistRequirement[] = IFRS_SME_ED_CHECKLIST_2008,
): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const req of requirements) {
    for (const code of req.disclosureCodes) {
      if (!index[code]) index[code] = [];
      if (!index[code].includes(req.id)) index[code].push(req.id);
    }
  }
  return index;
}
