/**
 * V16.0 — Enterprise Disclosure Component Library.
 *
 * Reusable disclosure components assembled into structured disclosure objects.
 * No disclosure is plain text — every block is a typed, metadata-driven component.
 */
import type { DocNoteNode, DocParagraph, DocSection, DocTable } from '../document/documentModel';
import type {
  CompositionNarrative,
  CompositionTable,
  DisclosureComponentKind,
  DisclosureLibraryComponent,
  DisclosureLibraryComponentKind,
} from './types';

function inferLibraryKind(
  section: DocSection | null,
  paragraph: DocParagraph | null,
  table: DocTable | null,
): DisclosureLibraryComponentKind {
  if (table) {
    const hay = `${table.table_code} ${table.title}`.toLowerCase();
    if (/movement|roll.?forward/.test(hay)) return 'movement_table';
    if (/reconcil/.test(hay)) return 'reconciliation_table';
    if (/categor|classif/.test(hay)) return 'category_table';
    if (/compar|prior|year/.test(hay)) return 'comparative_table';
    return 'movement_table';
  }
  const text = (section?.body || paragraph?.body || section?.title || '').toLowerCase();
  if (/judgement|judgment/.test(text)) return 'judgement';
  if (/estimate/.test(text)) return 'estimate';
  if (/recognition/.test(text)) return 'recognition_criteria';
  if (/measurement/.test(text)) return 'measurement_basis';
  if (/policy reference|see note|refer to note/.test(text)) return 'policy_reference';
  if (/ifrs|grap|ipsas|framework/.test(text)) return 'framework_citation';
  if (/cross.?ref|see note \d/.test(text)) return 'cross_reference_block';
  if (section?.title && section.section_code !== 'body') return 'subheading';
  if (paragraph && /^[-•*]\s/.test(paragraph.body)) return 'bullet_list';
  return section?.title ? 'heading' : 'paragraph';
}

function inferTableComponentKind(table: DocTable): DisclosureComponentKind {
  const kind = inferLibraryKind(null, null, table);
  if (kind === 'movement_table') return 'movement_schedule';
  if (kind === 'reconciliation_table') return 'reconciliation';
  if (kind === 'category_table' || kind === 'comparative_table') return 'analysis_table';
  return 'supporting_table';
}

function stringifyCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return String(obj.label ?? obj.value ?? obj.text ?? JSON.stringify(obj));
  }
  return String(value);
}

export function tableToCompositionRows(columns: unknown[], rows: unknown[]): string[][] {
  const out: string[][] = [];
  if (Array.isArray(columns) && columns.length) {
    out.push(columns.map(stringifyCell));
  }
  for (const row of rows || []) {
    if (Array.isArray(row)) {
      out.push(row.map(stringifyCell));
    } else if (row && typeof row === 'object') {
      const obj = row as Record<string, unknown>;
      const keys =
        Array.isArray(columns) && columns.length
          ? columns.map((c) =>
              typeof c === 'object' && c
                ? String(
                    (c as Record<string, unknown>).key ??
                      (c as Record<string, unknown>).label ??
                      '',
                  )
                : String(c),
            )
          : Object.keys(obj);
      out.push(keys.map((k) => stringifyCell(obj[k])));
    }
  }
  return out;
}

export function buildLibraryComponent(
  id: string,
  kind: DisclosureLibraryComponentKind,
  content: {
    text?: string;
    bold?: boolean;
    title?: string;
    rows?: string[][];
    items?: string[];
    targetNoteNumber?: number | null;
    frameworkSection?: string;
    policyCode?: string;
  },
): DisclosureLibraryComponent {
  return {
    id,
    kind: 'library_component',
    componentKind: kind,
    text: content.text ?? null,
    bold: content.bold,
    title: content.title ?? null,
    rows: content.rows ?? null,
    items: content.items ?? null,
    targetNoteNumber: content.targetNoteNumber ?? null,
    frameworkSection: content.frameworkSection ?? null,
    policyCode: content.policyCode ?? null,
  };
}

/** Map a document note into typed library components. */
export function buildDisclosureLibraryComponents(note: DocNoteNode): DisclosureLibraryComponent[] {
  const components: DisclosureLibraryComponent[] = [];

  for (const section of note.sections || []) {
    if (section.title && section.section_code !== 'body') {
      components.push(
        buildLibraryComponent(`${section.id}:heading`, inferLibraryKind(section, null, null), {
          text: section.title,
          bold: true,
          title: section.title,
        }),
      );
    }
    if ((section.body || '').trim()) {
      const kind = inferLibraryKind(section, null, null);
      if (kind === 'bullet_list') {
        const items = section.body
          .split('\n')
          .map((l) => l.replace(/^[-•*]\s*/, '').trim())
          .filter(Boolean);
        components.push(buildLibraryComponent(section.id, 'bullet_list', { items }));
      } else {
        components.push(buildLibraryComponent(section.id, kind, { text: section.body }));
      }
    }
  }

  for (const paragraph of note.paragraphs || []) {
    if (!(paragraph.body || '').trim()) continue;
    const kind = inferLibraryKind(null, paragraph, null);
    if (kind === 'bullet_list') {
      const items = paragraph.body
        .split('\n')
        .map((l) => l.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean);
      components.push(buildLibraryComponent(paragraph.id, 'bullet_list', { items }));
    } else {
      components.push(buildLibraryComponent(paragraph.id, kind, { text: paragraph.body }));
    }
  }

  for (const table of note.tables || []) {
    const rows = tableToCompositionRows(table.columns_json, table.rows_json);
    const libKind = inferLibraryKind(null, null, table);
    components.push(
      buildLibraryComponent(table.id, libKind, {
        title: table.title,
        rows,
      }),
    );
  }

  return components;
}

/** Convert library components into composition disclosure components (V15 compat + V16 structure). */
export function libraryToCompositionComponents(
  library: DisclosureLibraryComponent[],
  noteId: string,
): {
  narratives: CompositionNarrative[];
  tables: CompositionTable[];
  grouped: Array<{
    id: string;
    componentKind: DisclosureComponentKind;
    title: string | null;
    narratives: CompositionNarrative[];
    tables: CompositionTable[];
    libraryComponents: DisclosureLibraryComponent[];
  }>;
} {
  const narratives: CompositionNarrative[] = [];
  const tables: CompositionTable[] = [];
  const grouped: Array<{
    id: string;
    componentKind: DisclosureComponentKind;
    title: string | null;
    narratives: CompositionNarrative[];
    tables: CompositionTable[];
    libraryComponents: DisclosureLibraryComponent[];
  }> = [];

  let narrativeBatch: CompositionNarrative[] = [];
  let narrativeLibs: DisclosureLibraryComponent[] = [];

  const flushNarratives = () => {
    if (!narrativeBatch.length) return;
    grouped.push({
      id: `${noteId}:narratives-${grouped.length}`,
      componentKind: 'narrative',
      title: null,
      narratives: narrativeBatch,
      tables: [],
      libraryComponents: narrativeLibs,
    });
    narrativeBatch = [];
    narrativeLibs = [];
  };

  for (const lib of library) {
    if (lib.rows?.length) {
      flushNarratives();
      const tableKind =
        lib.componentKind === 'movement_table'
          ? 'movement_schedule'
          : lib.componentKind === 'reconciliation_table'
            ? 'reconciliation'
            : lib.componentKind === 'category_table' || lib.componentKind === 'comparative_table'
              ? 'analysis_table'
              : 'supporting_table';
      const compTable: CompositionTable = {
        id: lib.id,
        kind: 'table',
        title: lib.title || '',
        rows: lib.rows,
        componentKind: tableKind,
      };
      tables.push(compTable);
      grouped.push({
        id: lib.id,
        componentKind: tableKind,
        title: lib.title,
        narratives: [],
        tables: [compTable],
        libraryComponents: [lib],
      });
    } else {
      const text =
        lib.items?.length
          ? lib.items.map((i) => `• ${i}`).join('\n')
          : lib.text || '';
      if (text.trim()) {
        narratives.push({
          id: lib.id,
          kind: 'narrative',
          text,
          bold: lib.bold,
        });
        narrativeBatch.push({
          id: lib.id,
          kind: 'narrative',
          text,
          bold: lib.bold,
        });
        narrativeLibs.push(lib);
      }
    }
  }
  flushNarratives();

  return { narratives, tables, grouped };
}

export { inferTableComponentKind, inferLibraryKind };
