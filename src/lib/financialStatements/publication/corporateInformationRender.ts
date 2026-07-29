/**
 * V16.1 — Corporate Information Presentation Renderer helpers.
 *
 * Shared layout primitives for PDF and DOCX — no business logic.
 */
import type { CorporateInformationPresentationRow } from '../corporateInformation/presentationTypes';

export const CORPORATE_INFO_LABEL_WIDTH = 155;

export type CorporateInfoRenderContext = {
  labelWidth?: number;
};

/** Estimate vertical space needed for a presentation row (PDF layout). */
export function estimatePresentationRowHeight(
  row: CorporateInformationPresentationRow,
  lineHeight = 13.5,
): number {
  switch (row.kind) {
    case 'group_header':
      return lineHeight * 2.2;
    case 'single':
      return lineHeight * 1.5;
    case 'paragraph':
      return lineHeight * 2.5;
    case 'address_block':
      return lineHeight * (1.2 + row.lines.length);
    case 'person_list':
      return lineHeight * (1.2 + row.people.length);
    case 'banker_list':
      return lineHeight * (1.2 + row.bankers.length);
    case 'tax_list':
      return lineHeight * (1.2 + row.items.length);
    case 'spacer':
      return row.height;
    default:
      return lineHeight;
  }
}

export function flattenPresentationValue(row: CorporateInformationPresentationRow): string {
  switch (row.kind) {
    case 'single':
    case 'paragraph':
      return row.value;
    case 'address_block':
      return row.lines.join('\n');
    case 'person_list':
      return row.people.map((p) => p.name).join('\n');
    case 'banker_list':
      return row.bankers.map((b) => (b.detail ? `${b.name}, ${b.detail}` : b.name)).join('\n');
    case 'tax_list':
      return row.items.map((t) => `${t.label}: ${t.number}`).join('\n');
    default:
      return '';
  }
}
