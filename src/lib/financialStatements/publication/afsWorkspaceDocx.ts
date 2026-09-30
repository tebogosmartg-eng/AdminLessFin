/**
 * Canonical DOCX renderer (V13.0 Professional Renderer).
 *
 * Renders a professionally styled Published DOCX from prepareCanonicalDocumentView
 * — identical structure, numbering, cross-reference text, hidden-note omissions
 * and signatures as the PDF. Adds heading styles, bordered financial tables, a
 * running header/footer and automatic page numbers. Uses store-method ZIP (no
 * extra dependencies; edge functions unchanged).
 */
import { coverLogoBox, coverLogoBytes } from './coverLogo';
import type { CanonicalDocumentView, CanonicalStatement } from './canonicalDocumentView';
import { professionalLineLabel } from './afsProfessionalPdf';
import {
  documentHasComparatives,
  formatStatementFigure,
  lineNegatesFigure,
  isTotalRole,
  lineIndent,
  lineRole,
  looksLikeFigure,
  reportingYears,
} from './statementPresentation';
import {
  practitionerFirmLines,
  SUPPLEMENTARY_DISCLAIMER,
} from './statutoryFrontMatter';
import { renderCorporateInformationPresentationDocx } from './corporateInformationDocx';
import type { EfsStatementLine } from '../api';

function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Minimal ZIP (store / method 0) for OOXML packages. */
function zipStore(files: Record<string, Uint8Array>): Uint8Array<ArrayBuffer> {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const entries = Object.entries(files);

  for (const [name, data] of entries) {
    const nameBytes = encodeUtf8(name);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    localParts.push(local);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDir = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...localParts, centralDir, end]);
}

// ── XML building helpers ─────────────────────────────────────────────────────

type RunOpts = { bold?: boolean; italic?: boolean; size?: number; color?: string };
type ParaOpts = RunOpts & { style?: string; align?: 'left' | 'center' | 'right'; after?: number };

function runProps(o: RunOpts): string {
  if (!o.bold && !o.italic && !o.size && !o.color) return '';
  let s = '<w:rPr>';
  if (o.bold) s += '<w:b/>';
  if (o.italic) s += '<w:i/>';
  if (o.color) s += `<w:color w:val="${o.color}"/>`;
  if (o.size) s += `<w:sz w:val="${o.size * 2}"/><w:szCs w:val="${o.size * 2}"/>`;
  s += '</w:rPr>';
  return s;
}

function run(text: string, o: RunOpts = {}): string {
  return `<w:r>${runProps(o)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function para(text: string, o: ParaOpts = {}): string {
  let pPr = '<w:pPr>';
  if (o.style) pPr += `<w:pStyle w:val="${o.style}"/>`;
  if (o.align) pPr += `<w:jc w:val="${o.align}"/>`;
  pPr += `<w:spacing w:after="${o.after ?? 120}"/>`;
  pPr += '</w:pPr>';
  return `<w:p>${pPr}${run(text, o)}</w:p>`;
}

function cellParagraph(text: string, o: ParaOpts & { keepNext?: boolean } = {}): string {
  let pPr = '<w:pPr>';
  // Kept with the next row, so Word moves a table that fits on a page to the
  // next page whole rather than splitting it.
  if (o.keepNext) pPr += '<w:keepNext/>';
  if (o.align) pPr += `<w:jc w:val="${o.align}"/>`;
  pPr += '<w:spacing w:after="20"/></w:pPr>';
  return `<w:p>${pPr}${run(text, o)}</w:p>`;
}

function looksNumeric(v: string): boolean {
  const t = v.trim();
  return looksLikeFigure(t) || t === '[ — ]' || /^[-–—]$/.test(t);
}

/** Bookmark names for notes, shared by the heading and every link to it. */
function noteBookmark(noteNumber: number | string): string {
  return `note_${noteNumber}`;
}

/** A heading paragraph that is also a bookmark a link can jump to. */
function bookmarkedPara(
  text: string,
  name: string,
  id: number,
  o: ParaOpts & { pageBreakBefore?: boolean } = {},
): string {
  let pPr = '<w:pPr>';
  if (o.style) pPr += `<w:pStyle w:val="${o.style}"/>`;
  if (o.pageBreakBefore) pPr += '<w:pageBreakBefore/>';
  pPr += `<w:spacing w:after="${o.after ?? 120}"/>`;
  pPr += '</w:pPr>';
  return (
    `<w:p>${pPr}<w:bookmarkStart w:id="${id}" w:name="${escapeXml(name)}"/>` +
    `${run(text, o)}<w:bookmarkEnd w:id="${id}"/></w:p>`
  );
}

function tableXml(rows: string[][], opts: { boldRow?: (i: number) => boolean } = {}): string {
  if (!rows.length) return '';
  const ncol = Math.max(...rows.map((r) => r.length), 1);
  const norm = rows.map((r) => {
    const c = r.map((x) => String(x ?? ''));
    while (c.length < ncol) c.push('');
    return c;
  });

  const numericCol: boolean[] = new Array(ncol).fill(false);
  for (let c = 1; c < ncol; c++) {
    let num = 0;
    let tot = 0;
    for (let i = 1; i < norm.length; i++) {
      const v = norm[i][c].trim();
      if (!v) continue;
      tot += 1;
      if (looksNumeric(v)) num += 1;
    }
    numericCol[c] = tot > 0 ? num / tot >= 0.5 : true;
  }

  const totalW = 9026;
  const firstW = Math.max(3600, totalW - (ncol - 1) * 1500);
  const otherW = ncol > 1 ? Math.floor((totalW - firstW) / (ncol - 1)) : 0;
  const grid =
    '<w:tblGrid>' +
    `<w:gridCol w:w="${firstW}"/>` +
    Array.from({ length: ncol - 1 }, () => `<w:gridCol w:w="${otherW}"/>`).join('') +
    '</w:tblGrid>';

  const tblPr =
    '<w:tblPr>' +
    '<w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
    '<w:insideH w:val="single" w:sz="2" w:space="0" w:color="E0E0E0"/>' +
    '</w:tblBorders>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    '</w:tblPr>';

  const rowsXml = norm
    .map((r, i) => {
      const isHeader = i === 0;
      const bold = isHeader || (opts.boldRow ? opts.boldRow(i) : false);
      const trPr = `<w:trPr><w:cantSplit/>${isHeader ? '<w:tblHeader/>' : ''}</w:trPr>`;
      const keepNext = i < norm.length - 1;
      const cells = r
        .map((cell, c) => {
          const align = c === 0 ? 'left' : numericCol[c] ? 'right' : 'left';
          const w = c === 0 ? firstW : otherW;
          const shd = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
          return (
            '<w:tc>' +
            `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shd}</w:tcPr>` +
            cellParagraph(cell, { align, bold, size: 9, keepNext }) +
            '</w:tc>'
          );
        })
        .join('');
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join('');

  return `<w:tbl>${tblPr}${grid}${rowsXml}</w:tbl>`;
}

type EquityDocxLine = EfsStatementLine & {
  columns?: { capital?: number | null; retained?: number | null; total?: number | null };
};

/**
 * The Statement of Changes in Equity as a Word table: one column per
 * component of equity, both years' movements as rows — exactly as the PDF
 * prints it.
 */
function equityMatrixTableXml(stmt: CanonicalStatement): string {
  const lines = stmt.lines as EquityDocxLine[];
  const hasCapital = lines.some((l) => l.columns && l.columns.capital != null);
  const components: Array<{ key: 'capital' | 'retained' | 'total'; label: string }> = [
    ...(hasCapital ? [{ key: 'capital' as const, label: 'Share capital' }] : []),
    { key: 'retained' as const, label: 'Retained earnings' },
    { key: 'total' as const, label: 'Total equity' },
  ];
  const figureW = 1500;
  const labelW = 9026 - components.length * figureW;
  const grid =
    '<w:tblGrid>' +
    `<w:gridCol w:w="${labelW}"/>` +
    components.map(() => `<w:gridCol w:w="${figureW}"/>`).join('') +
    '</w:tblGrid>';
  const tblPr =
    '<w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>';
  const cell = (
    width: number,
    content: string,
    o: { borders?: string; align?: 'left' | 'center' | 'right'; indent?: number } = {},
  ) => {
    const borders = o.borders ? `<w:tcBorders>${o.borders}</w:tcBorders>` : '';
    let pPr = '<w:pPr>';
    if (o.align) pPr += `<w:jc w:val="${o.align}"/>`;
    if (o.indent) pPr += `<w:ind w:left="${o.indent}"/>`;
    pPr += '<w:spacing w:after="20"/></w:pPr>';
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${borders}</w:tcPr><w:p>${pPr}${content}</w:p></w:tc>`;
  };
  const headerBorder = '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="404040"/>';
  const rows: string[] = [
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
      cell(labelW, run('Figures in Rand', { size: 8, color: '595959' }), { borders: headerBorder }) +
      components
        .map((c) => cell(figureW, run(c.label, { bold: true, size: 9 }), { borders: headerBorder, align: 'right' }))
        .join('') +
      '</w:tr>',
  ];
  for (const line of lines) {
    const role = lineRole(line);
    const totalled = isTotalRole(role);
    const bold = totalled;
    const ruleAbove = totalled ? '<w:top w:val="single" w:sz="4" w:space="0" w:color="595959"/>' : '';
    const ruleBelow =
      role === 'grand_total' ? '<w:bottom w:val="double" w:sz="4" w:space="0" w:color="262626"/>' : '';
    const cells = [
      cell(labelW, run(professionalLineLabel(line.label), { bold, size: 9 }), {
        indent: lineIndent(line, role) * 240,
      }),
      ...components.map((c) => {
        const value = line.columns ? line.columns[c.key] : c.key === 'total' ? line.amount : null;
        return cell(figureW, run(formatStatementFigure(value, role), { bold, size: 9 }), {
          align: 'right',
          borders: value == null ? '' : ruleAbove + ruleBelow,
        });
      }),
    ];
    rows.push(`<w:tr>${cells.join('')}</w:tr>`);
  }
  return `<w:tbl>${tblPr}${grid}${rows.join('')}</w:tbl>`;
}

/**
 * A primary statement as a Word table, laid out as the PDF lays it out:
 * label, Notes, the current year, then the comparative. Totals are ruled above
 * their figures, the statement's grand total double-ruled beneath, and a note
 * number is a hyperlink to the note's heading.
 */
function statementTableXml(
  stmt: CanonicalStatement,
  view: CanonicalDocumentView,
  showComp: boolean,
): string {
  const years = reportingYears(view.period ?? { label: view.presentation.reportingPeriodLabel });
  const labelW = showComp ? 5226 : 6626;
  const noteW = 800;
  const figureW = 1500;
  const widths = showComp ? [labelW, noteW, figureW, figureW] : [labelW, noteW, figureW];
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const tblPr =
    '<w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr>';

  const cell = (
    width: number,
    content: string,
    o: { borders?: string; align?: 'left' | 'center' | 'right'; indent?: number } = {},
  ) => {
    const borders = o.borders ? `<w:tcBorders>${o.borders}</w:tcBorders>` : '';
    let pPr = '<w:pPr>';
    if (o.align) pPr += `<w:jc w:val="${o.align}"/>`;
    if (o.indent) pPr += `<w:ind w:left="${o.indent}"/>`;
    pPr += '<w:spacing w:after="20"/></w:pPr>';
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${borders}</w:tcPr><w:p>${pPr}${content}</w:p></w:tc>`;
  };

  const headerBorder = '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="404040"/>';
  const headerCells = [
    cell(labelW, run('Figures in Rand', { size: 8, color: '595959' }), { borders: headerBorder }),
    cell(noteW, run('Notes', { bold: true, size: 8, color: '595959' }), { borders: headerBorder, align: 'center' }),
    cell(figureW, `${run(years.current, { bold: true, size: 9 })}<w:r><w:br/></w:r>${run('R', { italic: true, size: 8, color: '737373' })}`, {
      borders: headerBorder,
      align: 'right',
    }),
    ...(showComp
      ? [
          cell(figureW, `${run(years.comparative, { bold: true, size: 9 })}<w:r><w:br/></w:r>${run('R', { italic: true, size: 8, color: '737373' })}`, {
            borders: headerBorder,
            align: 'right',
          }),
        ]
      : []),
  ];
  const rows: string[] = [`<w:tr><w:trPr><w:tblHeader/></w:trPr>${headerCells.join('')}</w:tr>`];

  for (const line of stmt.lines) {
    const role = lineRole(line);
    const heading = role === 'heading';
    const totalled = isTotalRole(role);
    const bold = heading || totalled;
    const label = professionalLineLabel(line.label);
    const ruleAbove = totalled ? '<w:top w:val="single" w:sz="4" w:space="0" w:color="595959"/>' : '';
    const ruleBelow = role === 'grand_total' ? '<w:bottom w:val="double" w:sz="4" w:space="0" w:color="262626"/>' : '';
    const bordersFor = (value: number | null | undefined) => (value == null ? '' : ruleAbove + ruleBelow);
    const noteRef =
      role === 'item' && line.note_ref != null && line.note_ref !== '' ? String(line.note_ref) : '';
    const negate = lineNegatesFigure(stmt.statement_type, line);
    const noteCell = noteRef
      ? `<w:hyperlink w:anchor="${noteBookmark(noteRef)}" w:history="1">${run(noteRef, { size: 9, color: '1F4E3D' })}</w:hyperlink>`
      : '';
    const cells = [
      cell(labelW, run(label, { bold, size: 9 }), { indent: heading ? 0 : lineIndent(line, role) * 240 }),
      cell(noteW, noteCell, { align: 'center' }),
      cell(figureW, run(formatStatementFigure(line.amount, role, { negate }), { bold, size: 9 }), {
        align: 'right',
        borders: bordersFor(line.amount),
      }),
      ...(showComp
        ? [
            cell(figureW, run(formatStatementFigure(line.prior_amount, role, { negate }), { bold, size: 9 }), {
              align: 'right',
              borders: bordersFor(line.prior_amount),
            }),
          ]
        : []),
    ];
    rows.push(`<w:tr>${cells.join('')}</w:tr>`);
  }

  return `<w:tbl>${tblPr}${grid}${rows.join('')}</w:tbl>`;
}

// ── Document assembly ────────────────────────────────────────────────────────

/** Build DOCX bytes from the canonical document view. */
export function renderCanonicalDocx(view: CanonicalDocumentView): Uint8Array<ArrayBuffer> {
  const body: string[] = [];
  const add = (xml: string) => body.push(xml);

  // Cover — the entity's own logo where it has one, the entity, what the
  // document is, and the practitioner.
  const logo = view.presentation.logo;
  if (logo) {
    const { w, h } = coverLogoBox(logo, 240, 130);
    const cx = Math.round(w * 12700);
    const cy = Math.round(h * 12700);
    add(
      `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="2400" w:after="160"/></w:pPr><w:r><w:drawing>` +
        `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
        `<wp:docPr id="1" name="Logo"/>` +
        `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
        `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:nvPicPr><pic:cNvPr id="1" name="logo.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
        `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
    );
  }
  add(para(view.companyName.toUpperCase(), { style: 'Title', bold: true, size: 16, align: 'center', after: 80 }));
  if (view.presentation.registrationNumber) {
    add(para(`(Registration number ${view.presentation.registrationNumber})`, { align: 'center', after: 40 }));
  }
  if (view.presentation.tradingName) {
    add(para(`Trading as ${view.presentation.tradingName}`, { align: 'center', color: '595959', after: 40 }));
  }
  add(para(view.presentation.documentTitle.toUpperCase(), { bold: true, size: 13, align: 'center', after: 40 }));
  add(para(view.presentation.coverTitle, { align: 'center', after: view.presentation.issueDateRecorded ? 40 : 200 }));
  if (view.presentation.issueDateRecorded) {
    add(para(`Issued ${view.presentation.issueDateRecorded}`, { align: 'center', after: 200 }));
  }
  for (const line of practitionerFirmLines(view)) {
    add(para(line, { align: 'center', size: 9, after: 20 }));
  }

  // General Information — the first page of a bound set.
  const corp = view.composition?.sequencedSections.find((s) => s.kind === 'corporate_information');
  if (corp?.corporatePresentation?.rows?.length) {
    renderCorporateInformationPresentationDocx(corp.corporatePresentation, add, para, tableXml);
  } else if (corp?.narratives?.length) {
    add(para('General Information', { style: 'Heading1', bold: true, size: 13 }));
    for (const n of corp.narratives) add(para(n.text));
  }

  // Index.
  add(para('Index', { style: 'Heading1', bold: true, size: 13 }));
  add(
    para(
      'The reports and statements set out below comprise the annual financial statements presented to the shareholders:',
    ),
  );
  const fm = view.frontMatter;
  const printedFront = [fm.responsibilities, fm.directorsReport, fm.practitionerReport].filter(
    (s) => s.included !== false,
  );
  const tocLabels = [
    ...printedFront.map((s) => s.title),
    ...view.statements.map((s) => s.title),
    'Accounting Policies',
    'Notes to the Annual Financial Statements',
    ...(view.composition?.supplementarySchedules || []).map((s) => s.title),
  ];
  for (const label of tocLabels) add(para(label, { after: 40 }));

  // Statutory front sections — the wording the preparation engine resolved:
  // authored where the preparer wrote it, generated text otherwise.
  const blocksOf = (section: typeof fm.responsibilities) => {
    for (const block of section.blocks) {
      if (block.heading) add(para(block.heading, { bold: true, size: 10, after: 40 }));
      if (block.body) add(para(block.body));
    }
  };
  if (fm.responsibilities.included !== false) {
    add(para(fm.responsibilities.title, { style: 'Heading1', bold: true, size: 13 }));
    blocksOf(fm.responsibilities);
  } else if (fm.approval.included !== false) {
    add(para(fm.approval.title, { style: 'Heading1', bold: true, size: 13 }));
  }
  if (fm.approval.included !== false) blocksOf(fm.approval);
  if (fm.approval.included !== false && view.presentation.directors.length) {
    for (const name of view.presentation.directors) {
      add(para('______________________________', { after: 20 }));
      add(para(name, { after: 10 }));
      add(para('Director', { color: '595959', after: 120 }));
    }
  }

  for (const section of [fm.directorsReport, fm.practitionerReport]) {
    if (section.included === false) continue;
    add(para(section.title, { style: 'Heading1', bold: true, size: 13 }));
    blocksOf(section);
  }

  // Primary statements (Phase 2) — the same two columns on every statement.
  const showComp = documentHasComparatives(view.statements);
  for (const statement of view.statements) {
    add(para(statement.title, { style: 'Heading1', bold: true, size: 12 }));
    add(para(statement.periodCaption, { italic: true, color: '595959', after: 60 }));
    const matrix =
      statement.statement_type === 'changes_in_equity' &&
      (statement.lines as EquityDocxLine[]).some((l) => l.columns != null);
    if (statement.lines.length && matrix) {
      add(equityMatrixTableXml(statement));
      add(para('', { after: 60 }));
    } else if (statement.lines.length) {
      add(statementTableXml(statement, view, showComp));
      add(para('', { after: 60 }));
    } else {
      add(
        para(
          'Figures will be presented in this statement once the trial balance for the engagement has been captured and the statement has been prepared.',
          { color: '595959' },
        ),
      );
    }
  }

  // Accounting Policies (Phase 3) — separate from disclosure notes.
  add(para('Accounting Policies', { style: 'Heading1', bold: true, size: 13 }));
  const policies = view.accountingPolicies || [];
  if (!policies.length) {
    add(para(`Significant accounting policies are applied in accordance with ${view.frameworkLabel}.`));
  } else {
    const paragraphsOf = (text: string | undefined) =>
      String(text || '')
        .split(/\n\s*\n/)
        .map((t) => t.trim())
        .filter(Boolean);
    for (const policy of policies) {
      add(para(policy.title, { style: 'Heading2', bold: true, size: 10 }));
      for (const text of paragraphsOf(policy.body)) add(para(text));
      if (policy.table?.length) {
        add(tableXml(policy.table, { boldRow: (i) => i === 0 }));
        add(para('', { after: 40 }));
      }
      for (const text of paragraphsOf(policy.bodyAfter)) add(para(text));
    }
  }

  // Notes (Phase 4).
  add(para('Notes to the Annual Financial Statements', { style: 'Heading1', bold: true, size: 13 }));
  view.notes.forEach((note, i) => {
    add(
      bookmarkedPara(note.heading, noteBookmark(note.noteNumber), i + 1, {
        style: 'Heading2',
        bold: true,
        size: 10,
        pageBreakBefore: note.pageBreakBefore,
      }),
    );
    for (const block of note.blocks) {
      if (block.type === 'paragraph') {
        add(para(block.text, { bold: !!block.bold }));
      } else {
        if (block.title) add(para(block.title, { bold: true, after: 40 }));
        add(tableXml(block.rows));
        add(para('', { after: 40 }));
      }
    }
  });

  // Supplementary schedules — behind their own disclaimer.
  for (const schedule of view.composition?.supplementarySchedules || []) {
    add(para(schedule.title, { style: 'Heading1', bold: true, size: 13 }));
    add(para(SUPPLEMENTARY_DISCLAIMER, { italic: true, color: '595959', size: 8 }));
    add(
      tableXml(schedule.rows, {
        boldRow: (i) => /total|profit/i.test(String(schedule.rows[i]?.[0] || '')),
      }),
    );
  }

  const sectPr =
    '<w:sectPr>' +
    '<w:headerReference w:type="default" r:id="rId2"/>' +
    '<w:footerReference w:type="default" r:id="rId3"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
    '</w:sectPr>';

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<w:body>${body.join('')}${sectPr}</w:body></w:document>`;

  const documentLine = `${view.presentation.documentTitle} for the ${view.presentation.reportingPeriodLabel.charAt(0).toLowerCase()}${view.presentation.reportingPeriodLabel.slice(1)}`;
  const headerParts =
    `${run(view.companyName, { bold: true, size: 9 })}` +
    (view.presentation.registrationNumber
      ? `<w:r><w:br/></w:r>${run(`(Registration number: ${view.presentation.registrationNumber})`, { size: 8, color: '595959' })}`
      : '') +
    `<w:r><w:br/></w:r>${run(documentLine, { size: 8, color: '595959' })}`;
  const headerXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="9A9A9A"/></w:pBdr></w:pPr>` +
    `${headerParts}</w:p></w:hdr>`;

  // The footer of a statutory document carries the page number and nothing
  // else — software does not sign financial statements.
  const footerXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="C8C8C8"/></w:pBdr></w:pPr>` +
    `<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:p></w:ftr>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="19"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/></w:rPr></w:style>` +
    `</w:styles>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
    `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>` +
    (logo
      ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.jpeg"/>`
      : '') +
    `</Relationships>`;

  return zipStore({
    '[Content_Types].xml': encodeUtf8(contentTypes),
    '_rels/.rels': encodeUtf8(rels),
    'word/styles.xml': encodeUtf8(stylesXml),
    'word/header1.xml': encodeUtf8(headerXml),
    'word/footer1.xml': encodeUtf8(footerXml),
    'word/document.xml': encodeUtf8(documentXml),
    'word/_rels/document.xml.rels': encodeUtf8(documentRels),
    ...(logo ? { 'word/media/logo.jpeg': coverLogoBytes(logo) } : {}),
  });
}
