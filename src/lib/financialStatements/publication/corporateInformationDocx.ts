/**
 * V16.1 — Render corporate information presentation rows (DOCX).
 */
import type { CorporateInformationPresentation } from '../corporateInformation/presentationTypes';

type DocxAddFn = (xml: string) => void;
type ParaFn = (text: string, o?: Record<string, unknown>) => string;
type TableFn = (rows: string[][], o?: Record<string, unknown>) => string;

export function renderCorporateInformationPresentationDocx(
  presentation: CorporateInformationPresentation,
  add: DocxAddFn,
  para: ParaFn,
  tableXml: TableFn,
): void {
  add(para(presentation.title, { style: 'Heading1', bold: true, size: 13 }));

  for (const row of presentation.rows) {
    switch (row.kind) {
      case 'group_header':
        add(para(row.label, { bold: true, size: 10, after: 60 }));
        break;
      case 'single':
        add(
          tableXml([[row.label, row.value]], {
            boldRow: (i: number) => i === 0,
          }),
        );
        add(para('', { after: 40 }));
        break;
      case 'paragraph':
        add(
          tableXml([[row.label, row.value]], {
            boldRow: () => false,
          }),
        );
        add(para('', { after: 40 }));
        break;
      case 'address_block':
        add(tableXml([[row.label, row.lines.join('\n')]]));
        add(para('', { after: 40 }));
        break;
      case 'person_list':
        add(
          tableXml([
            [row.label, row.people.map((p) => (p.detail ? `${p.name} (${p.detail})` : p.name)).join('\n')],
          ]),
        );
        add(para('', { after: 40 }));
        break;
      case 'banker_list':
        add(
          tableXml([
            [
              row.label,
              row.bankers.map((b) => (b.detail ? `${b.name}, ${b.detail}` : b.name)).join('\n'),
            ],
          ]),
        );
        add(para('', { after: 40 }));
        break;
      case 'tax_list':
        add(
          tableXml([
            [row.label, row.items.map((t) => `${t.label}: ${t.number}`).join('\n')],
          ]),
        );
        add(para('', { after: 40 }));
        break;
      case 'spacer':
        add(para('', { after: row.height * 20 }));
        break;
    }
  }
}
