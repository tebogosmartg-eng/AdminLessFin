/**
 * V16.1 — Render corporate information presentation rows (PDF).
 * Consumes pre-formatted presentation rows only — no business logic.
 */
import type { LayoutEngine } from './layoutEngine';
import type { Rgb } from './pdfKit';
import type { CorporateInformationPresentation } from '../../corporateInformation/presentationTypes';
import { CORPORATE_INFO_LABEL_WIDTH } from '../corporateInformationRender';

export function renderCorporateInformationPresentationPdf(
  engine: LayoutEngine,
  presentation: CorporateInformationPresentation,
  accent?: Rgb,
): void {
  engine.sectionTitleBlock(presentation.title, accent);

  for (const row of presentation.rows) {
    switch (row.kind) {
      case 'group_header':
        engine.spacer(row.spacingBefore ?? 4);
        engine.subHeading(row.label);
        break;
      case 'single':
        engine.labelValueRow(row.label, [row.value], {
          labelWidth: CORPORATE_INFO_LABEL_WIDTH,
          spacingAfter: 2,
        });
        break;
      case 'paragraph':
        engine.labelValueRow(row.label, [row.value], {
          labelWidth: CORPORATE_INFO_LABEL_WIDTH,
          spacingAfter: 4,
        });
        break;
      case 'address_block':
        engine.labelValueRow(row.label, row.lines, {
          labelWidth: CORPORATE_INFO_LABEL_WIDTH,
          spacingAfter: 4,
        });
        break;
      case 'person_list':
        engine.labelValueRow(
          row.label,
          row.people.map((p) => (p.detail ? `${p.name}  (${p.detail})` : p.name)),
          { labelWidth: CORPORATE_INFO_LABEL_WIDTH, spacingAfter: 4 },
        );
        break;
      case 'banker_list':
        engine.labelValueRow(
          row.label,
          row.bankers.map((b) => (b.detail ? `${b.name}, ${b.detail}` : b.name)),
          { labelWidth: CORPORATE_INFO_LABEL_WIDTH, spacingAfter: 4 },
        );
        break;
      case 'tax_list':
        engine.labelValueRow(
          row.label,
          row.items.map((t) => `${t.label}: ${t.number}`),
          { labelWidth: CORPORATE_INFO_LABEL_WIDTH, spacingAfter: 4 },
        );
        break;
      case 'spacer':
        engine.spacer(row.height);
        break;
    }
  }
}
