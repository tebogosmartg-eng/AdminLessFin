/**
 * Professional PDF kit (V13.0) — Typography + Page Layout primitives.
 *
 * Low-level, dependency-free PDF construction used by the Professional Statutory
 * Renderer. Provides accurate Helvetica metrics (regular / bold / oblique),
 * text measurement + wrapping, primitive drawing (text, rules, fills) and PDF
 * assembly. It carries NO document semantics — it only draws.
 */

// A4 portrait.
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

// Statutory margins (generous, print-safe).
export const MARGIN_L = 58;
export const MARGIN_R = 58;
export const MARGIN_TOP = 96; // leaves room for the running header
export const MARGIN_BOTTOM = 68; // leaves room for the running footer
export const CONTENT_L = MARGIN_L;
export const CONTENT_R = PAGE_W - MARGIN_R;
export const CONTENT_W = CONTENT_R - CONTENT_L;
export const CONTENT_TOP = PAGE_H - MARGIN_TOP;
export const CONTENT_BOTTOM = MARGIN_BOTTOM;

// Helvetica AFM advance widths (per 1000 units), codes 32..126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

export type FontKey = 'regular' | 'bold' | 'oblique';

function widthTable(font: FontKey): number[] {
  return font === 'bold' ? HELV_BOLD : HELV; // oblique shares regular metrics (base-14)
}

function fontRef(font: FontKey): string {
  return font === 'bold' ? 'F2' : font === 'oblique' ? 'F3' : 'F1';
}

export function asciiOnly(input: unknown): string {
  return String(input ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7E]/g, '');
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function charWidth(code: number, font: FontKey): number {
  const table = widthTable(font);
  if (code < 32 || code > 126) return table['?'.charCodeAt(0) - 32];
  return table[code - 32];
}

export function textWidth(text: string, size: number, font: FontKey = 'regular'): number {
  const s = asciiOnly(text);
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i), font);
  return (w * size) / 1000;
}

export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  font: FontKey = 'regular',
): string[] {
  const words = asciiOnly(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (textWidth(next, size, font) <= maxWidth) current = next;
    else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/** Truncate to a max width, appending an ellipsis when clipped. */
export function ellipsize(text: string, maxWidth: number, size: number, font: FontKey = 'regular'): string {
  const s = asciiOnly(text);
  if (textWidth(s, size, font) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && textWidth(`${out}...`, size, font) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

/** RGB colour with components in the 0..1 range (presentation branding only). */
export type Rgb = [number, number, number];

function rgbOp(c: Rgb, stroke = false): string {
  const op = stroke ? 'RG' : 'rg';
  return `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)} ${op}`;
}

export type TextOptions = {
  size: number;
  font?: FontKey;
  gray?: number; // 0 = black (default), 1 = white
  /** Optional RGB colour (branding). Takes precedence over `gray` when set. */
  color?: Rgb;
  charSpacing?: number;
};

/** A single PDF page as an ordered list of content-stream operators. */
export class PdfPage {
  ops: string[] = [];

  private emitText(x: number, y: number, text: string, o: TextOptions): void {
    const font = o.font || 'regular';
    const gray = o.gray ?? 0;
    const cs = o.charSpacing ? ` ${o.charSpacing.toFixed(2)} Tc` : '';
    const coloured = !!o.color || gray !== 0;
    const pre = o.color ? `${rgbOp(o.color)} ` : gray !== 0 ? `${gray.toFixed(3)} g ` : '';
    const post = coloured ? ' 0 g' : '';
    this.ops.push(
      `${pre}BT /${fontRef(font)} ${o.size} Tf${cs} 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(
        asciiOnly(text),
      )}) Tj ET${post}`,
    );
  }

  text(x: number, y: number, text: string, o: TextOptions): void {
    this.emitText(x, y, text, o);
  }

  textRight(xRight: number, y: number, text: string, o: TextOptions): void {
    const w = textWidth(text, o.size, o.font || 'regular');
    this.emitText(xRight - w, y, text, o);
  }

  textCenter(xCenter: number, y: number, text: string, o: TextOptions): void {
    const w = textWidth(text, o.size, o.font || 'regular');
    this.emitText(xCenter - w / 2, y, text, o);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.6, gray = 0, color?: Rgb): void {
    const coloured = !!color || gray !== 0;
    const pre = color ? `${rgbOp(color, true)} ` : gray !== 0 ? `${gray.toFixed(3)} G ` : '';
    this.ops.push(
      `${pre}${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(
        2,
      )} l S${coloured ? ' 0 G' : ''}`,
    );
  }

  rect(x: number, y: number, w: number, h: number, gray = 0.92, color?: Rgb): void {
    const fill = color ? rgbOp(color) : `${gray.toFixed(3)} g`;
    this.ops.push(`${fill} ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
}

/** Assemble a set of pages into a PDF-1.4 document string (3 base fonts). */
export function assemblePdf(pages: PdfPage[]): string {
  const offsets: number[] = [];
  const parts: string[] = [];
  let pos = 0;
  const push = (s: string) => {
    parts.push(s);
    pos += s.length;
  };
  const addObj = (id: number, body: string) => {
    offsets[id] = pos;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n');

  // Fixed font objects: 3=Helvetica, 4=Helvetica-Bold, 5=Helvetica-Oblique.
  const pageObjs: Array<{ id: number; contentId: number }> = [];
  const contentObjs: Array<{ id: number; stream: string }> = [];
  let nextId = 6;
  for (const page of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    contentObjs.push({ id: contentId, stream: page.ops.join('\n') });
    pageObjs.push({ id: pageId, contentId });
  }

  const kids = pageObjs.map((p) => `${p.id} 0 R`).join(' ');
  addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObj(2, `<< /Type /Pages /Kids [ ${kids} ] /Count ${pageObjs.length} >>`);
  addObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  addObj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  addObj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  contentObjs.forEach((c) => {
    addObj(c.id, `<< /Length ${c.stream.length} >>\nstream\n${c.stream}\nendstream`);
  });
  pageObjs.forEach((p) => {
    addObj(
      p.id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${p.contentId} 0 R >>`,
    );
  });

  const xrefPos = pos;
  const total = nextId;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) {
    xref += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);
  return parts.join('');
}
