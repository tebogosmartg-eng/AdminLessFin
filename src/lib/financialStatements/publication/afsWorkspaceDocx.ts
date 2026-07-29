/**
 * Canonical DOCX renderer (V13.0 Professional Renderer).
 *
 * Renders a professionally styled Published DOCX from prepareCanonicalDocumentView
 * — identical structure, numbering, cross-reference text, hidden-note omissions
 * and signatures as the PDF. Adds heading styles, bordered financial tables, a
 * running header/footer and automatic page numbers. Uses store-method ZIP (no
 * extra dependencies; edge functions unchanged).
 */
import type { CanonicalDocumentView, CanonicalStatement } from './canonicalDocumentView';
import { formatAmount, professionalLineLabel } from './afsProfessionalPdf';
import {
  approvalIntro,
  auditorsReportParagraphs,
  directorsReportParagraphs,
  directorsResponsibilitiesParagraphs,
  supplementaryScheduleParagraphs,
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

function cellParagraph(text: string, o: ParaOpts = {}): string {
  let pPr = '<w:pPr>';
  if (o.align) pPr += `<w:jc w:val="${o.align}"/>`;
  pPr += '<w:spacing w:after="20"/></w:pPr>';
  return `<w:p>${pPr}${run(text, o)}</w:p>`;
}

const NUMERIC_RE = /^\(?-?[\d,]+\.\d{2}\)?$/;
function looksNumeric(v: string): boolean {
  const t = v.trim();
  return NUMERIC_RE.test(t) || t === '[ — ]' || /^[-–—]$/.test(t);
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
      const trPr = isHeader ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
      const cells = r
        .map((cell, c) => {
          const align = c === 0 ? 'left' : numericCol[c] ? 'right' : 'left';
          const w = c === 0 ? firstW : otherW;
          const shd = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
          return (
            '<w:tc>' +
            `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shd}</w:tcPr>` +
            cellParagraph(cell, { align, bold, size: 9 }) +
            '</w:tc>'
          );
        })
        .join('');
      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join('');

  return `<w:tbl>${tblPr}${grid}${rowsXml}</w:tbl>`;
}

function statementTableXml(stmt: CanonicalStatement, view: CanonicalDocumentView): string {
  type Line = EfsStatementLine & {
    is_header?: boolean;
    is_subheader?: boolean;
    prior_amount?: number | null;
    note_ref?: string | number | null;
  };
  const year = (view.period?.end_date || '').slice(0, 4) || 'Current';
  const priorYear = year && /^\d{4}$/.test(year) ? String(Number(year) - 1) : 'Prior';
  const lines = stmt.lines as Line[];
  const showComp = lines.some((l) => l.prior_amount != null && !l.is_header && !l.is_subheader);
  const header = showComp ? ['', 'Notes', `${priorYear} R`, `${year} R`] : ['', 'Notes', `${year} R`];
  const rows: string[][] = [header];
  for (const line of lines) {
    const headerLine = !!(line.is_header || line.is_subheader);
    const label = professionalLineLabel(line.label);
    const note = headerLine || line.is_total || line.note_ref == null ? '' : String(line.note_ref);
    const amt =
      headerLine ? '' : line.amount === 0 && !line.is_total ? '—' : formatAmount(line.amount);
    if (showComp) {
      const prior =
        headerLine
          ? ''
          : line.prior_amount == null || (line.prior_amount === 0 && !line.is_total)
            ? '—'
            : formatAmount(line.prior_amount);
      rows.push([label, note, prior, amt]);
    } else {
      rows.push([label, note, amt]);
    }
  }
  const totalFlags = [false, ...lines.map((l) => !!l.is_total && !l.is_header && !l.is_subheader)];
  return tableXml(rows, { boldRow: (i) => totalFlags[i] || !!(lines[i - 1] as Line | undefined)?.is_header });
}

// ── Document assembly ────────────────────────────────────────────────────────

/** Build DOCX bytes from the canonical document view. */
export function renderCanonicalDocx(view: CanonicalDocumentView): Uint8Array<ArrayBuffer> {
  const body: string[] = [];
  const add = (xml: string) => body.push(xml);
  const brand = view.presentation.branding;

  // Cover.
  add(para(view.companyName, { style: 'Title', bold: true, size: 22, align: 'center', color: brand.primaryHex, after: 80 }));
  if (view.presentation.registrationNumber) {
    add(para(`Registration number ${view.presentation.registrationNumber}`, { align: 'center', color: '595959', after: 40 }));
  }
  if (view.presentation.tradingName) {
    add(para(`Trading as ${view.presentation.tradingName}`, { align: 'center', color: '595959', after: 40 }));
  }
  add(para(view.presentation.documentTitle, { bold: true, size: 14, align: 'center', color: brand.primaryHex, after: 40 }));
  add(para(view.presentation.coverTitle, { align: 'center', after: 40 }));
  add(para(`Prepared in accordance with ${view.frameworkLabel}`, { align: 'center', after: 20 }));
  add(para(view.currencyLabel, { align: 'center', color: '595959', after: 120 }));
  add(para(brand.brandName, { align: 'center', bold: true, size: 9, color: brand.primaryHex, after: 20 }));
  if (brand.tagline) add(para(brand.tagline, { align: 'center', size: 8, color: '595959', after: 200 }));

  // Contents — driven by composition publication metadata when available.
  add(para('Contents', { style: 'Heading1', bold: true, size: 13 }));
  const tocLabels =
    view.composition?.publicationHints.contentsEntries.map((e) => e.label) ||
    [
      "Directors' Responsibilities and Approval",
      "Directors' Report",
      "Independent Auditor's Report",
      'Corporate Information',
      ...view.statements.map((s) => s.title),
      'Significant Accounting Policies',
      'Notes to the Financial Statements',
      'Supplementary Information',
      ...(view.signatures.length ? ['Approval of Annual Financial Statements'] : []),
    ];
  for (const label of tocLabels) {
    if (label === 'Cover' || label === 'Contents') continue;
    add(para(label, { after: 40 }));
  }

  // Statutory front sections.
  add(para("Directors' Responsibilities and Approval", { style: 'Heading1', bold: true, size: 13 }));
  for (const p of directorsResponsibilitiesParagraphs(view)) add(para(p));

  add(para("Directors' Report", { style: 'Heading1', bold: true, size: 13 }));
  for (const block of directorsReportParagraphs(view)) {
    if (block.heading) add(para(block.heading, { bold: true, size: 10, after: 40 }));
    add(para(block.body));
  }

  add(para("Independent Auditor's Report", { style: 'Heading1', bold: true, size: 13 }));
  for (const p of auditorsReportParagraphs(view)) add(para(p));

  // Corporate Information (Phase 1).
  const corp = view.composition?.sequencedSections.find((s) => s.kind === 'corporate_information');
  if (corp?.corporatePresentation?.rows?.length) {
    renderCorporateInformationPresentationDocx(corp.corporatePresentation, add, para, tableXml);
  } else if (corp?.narratives?.length) {
    add(para('Corporate Information', { style: 'Heading1', bold: true, size: 13 }));
    for (const n of corp.narratives) add(para(n.text));
  }

  // Primary statements (Phase 2).
  for (const statement of view.statements) {
    add(para(statement.title, { style: 'Heading1', bold: true, size: 12 }));
    add(para(statement.periodCaption, { italic: true, color: '595959', after: 40 }));
    add(para(view.currencyLabel, { italic: true, color: '595959', size: 8, after: 60 }));
    if (statement.lines.length) {
      add(statementTableXml(statement, view));
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
  add(para('Significant Accounting Policies', { style: 'Heading1', bold: true, size: 13 }));
  add(
    para(
      `The following accounting policies are consistent with ${view.frameworkLabel} and have been applied in preparing these annual financial statements.`,
    ),
  );
  const policies = view.accountingPolicies || [];
  if (!policies.length) {
    add(para(`Significant accounting policies are applied in accordance with ${view.frameworkLabel}.`));
  } else {
    for (const policy of policies) {
      add(para(policy.title, { style: 'Heading2', bold: true, size: 10 }));
      add(para(policy.body));
    }
  }

  // Notes (Phase 4).
  add(para('Notes to the Financial Statements', { style: 'Heading1', bold: true, size: 13 }));
  for (const note of view.notes) {
    add(para(note.heading, { style: 'Heading2', bold: true, size: 10 }));
    for (const block of note.blocks) {
      if (block.type === 'paragraph') {
        add(para(block.text, { bold: !!block.bold }));
      } else {
        if (block.title) add(para(block.title, { bold: true, after: 40 }));
        add(tableXml(block.rows));
        add(para('', { after: 40 }));
      }
    }
  }

  // Supplementary schedules.
  add(para('Supplementary Information', { style: 'Heading1', bold: true, size: 13 }));
  for (const p of supplementaryScheduleParagraphs()) add(para(p, { color: '595959' }));

  // Signatures.
  if (view.signatures.length) {
    add(para('Approval of Annual Financial Statements', { style: 'Heading1', bold: true, size: 13 }));
    add(para(approvalIntro()));
    for (const sig of view.signatures) {
      add(para(sig.label, { bold: true, size: 10, after: 80 }));
      add(para('______________________________', { after: 20 }));
      add(para(sig.signatureDisplay, { color: '595959', after: 20 }));
      add(para(sig.nameDisplay, { after: 20 }));
      add(para(sig.positionDisplay, { color: '595959', after: 20 }));
      add(para(sig.dateDisplay, { color: '595959', after: 120 }));
    }
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
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>${body.join('')}${sectPr}</w:body></w:document>`;

  const headerParts =
    `${run(view.companyName, { bold: true, size: 9 })}` +
    (view.presentation.registrationNumber
      ? `<w:r><w:br/></w:r>${run(`Registration number: ${view.presentation.registrationNumber}`, { size: 8, color: '595959' })}`
      : '');
  const headerXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="${brand.accentHex}"/></w:pBdr></w:pPr>` +
    `${headerParts}</w:p></w:hdr>`;

  const footerXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="C8D0CC"/></w:pBdr></w:pPr>` +
    `${run(brand.footer.creditLine + '   ', { size: 8, color: '595959' })}` +
    `${run('Page ', { size: 8, color: '595959' })}` +
    `<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `${run(' / ', { size: 8, color: '595959' })}` +
    `<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    (view.presentation.issueDateLong ? run(`   ${view.presentation.issueDateLong}`, { size: 8, color: '595959' }) : '') +
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
    `</Relationships>`;

  return zipStore({
    '[Content_Types].xml': encodeUtf8(contentTypes),
    '_rels/.rels': encodeUtf8(rels),
    'word/styles.xml': encodeUtf8(stylesXml),
    'word/header1.xml': encodeUtf8(headerXml),
    'word/footer1.xml': encodeUtf8(footerXml),
    'word/document.xml': encodeUtf8(documentXml),
    'word/_rels/document.xml.rels': encodeUtf8(documentRels),
  });
}
