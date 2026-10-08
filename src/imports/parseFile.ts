/**
 * Reads a CSV or Excel file into header + row objects. Parsing happens in
 * the browser (both libraries load on demand); every value is then validated
 * again on the server, so nothing here is trusted.
 */

export type Cell = string | number | boolean | null;

export interface ParsedFile {
  fileName: string;
  fileSize: number;
  fileHash: string;
  headers: string[];
  rows: Array<Record<string, Cell>>;
  /** The spreadsheet line of each row (1-based, header included), for messages users can find. */
  lines: number[];
  sheetName: string | null;
  sheetNames: string[];
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['.csv', '.txt', '.xlsx'];

export class FileReadError extends Error {}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isoFromDate(d: Date): string {
  // Excel dates carry no time zone; read-excel-file returns them at UTC midnight.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function cleanCell(value: unknown): Cell {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : isoFromDate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const s = String(value);
  return s.trim() === '' ? null : s;
}

/** Unique, non-empty header names ("Amount", "Amount (2)", "Column 5"). */
function normaliseHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = String(h ?? '').replace(/\s+/g, ' ').trim();
    if (!name) name = `Column ${i + 1}`;
    const n = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), n);
    return n > 1 ? `${name} (${n})` : name;
  });
}

/**
 * Bank and accounting exports often start with title lines ("Statement for
 * account …"). The header is the first row, within the first 15, that has at
 * least two text cells and at least as many filled cells as the rows after it.
 */
function findHeaderIndex(matrix: unknown[][]): number {
  const filled = (row: unknown[]) => row.filter(c => c != null && String(c).trim() !== '').length;
  const texty = (row: unknown[]) => row.filter(c => typeof c === 'string' && c.trim() !== '' && Number.isNaN(Number(c))).length;
  const limit = Math.min(matrix.length, 15);
  const widest = Math.max(0, ...matrix.slice(0, 40).map(filled));
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] ?? [];
    if (texty(row) >= 2 && filled(row) >= Math.max(2, Math.floor(widest * 0.6))) return i;
  }
  return 0;
}

function toRecords(matrix: unknown[][]): { headers: string[]; rows: Array<Record<string, Cell>>; lines: number[] } {
  const headerIndex = findHeaderIndex(matrix);
  const headers = normaliseHeaders(matrix[headerIndex] ?? []);
  const rows: Array<Record<string, Cell>> = [];
  const lines: number[] = [];
  matrix.slice(headerIndex + 1).forEach((line, offset) => {
    const record: Record<string, Cell> = {};
    let any = false;
    headers.forEach((h, i) => {
      const v = cleanCell(line?.[i]);
      record[h] = v;
      if (v != null) any = true;
    });
    if (any) {
      rows.push(record);
      lines.push(headerIndex + offset + 2);
    }
  });
  return { headers, rows, lines };
}

async function parseCsv(text: string): Promise<unknown[][]> {
  const { default: Papa } = await import('papaparse');
  const result = Papa.parse(text, { skipEmptyLines: 'greedy' }) as {
    data: string[][];
    errors: Array<{ type: string; message: string; row?: number }>;
  };
  const fatal = result.errors.find(e => e.type === 'Quotes');
  if (fatal) throw new FileReadError(`The file could not be read near row ${(fatal.row ?? 0) + 1}: ${fatal.message}.`);
  return result.data;
}

export async function readImportFile(file: File, sheet?: string): Promise<ParsedFile> {
  const ext = extensionOf(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new FileReadError(ext === '.xls'
      ? 'Old-style .xls files cannot be read. Open the file in Excel and save it as .xlsx or .csv.'
      : 'Choose a CSV or Excel (.xlsx) file.');
  }
  if (file.size === 0) throw new FileReadError('The file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new FileReadError('The file is larger than 20 MB. Split it into smaller files.');

  const buffer = await file.arrayBuffer();
  const fileHash = await sha256(buffer);

  let matrix: unknown[][];
  let sheetName: string | null = null;
  let sheetNames: string[] = [];
  if (ext === '.xlsx') {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    let sheets;
    try {
      sheets = await readXlsxFile(file);
    } catch {
      throw new FileReadError('The Excel file could not be read. Check that it opens in Excel, then save it again as .xlsx.');
    }
    sheetNames = sheets.map(s => s.sheet);
    const chosen = (sheet && sheets.find(s => s.sheet === sheet)) ||
      sheets.find(s => s.data.some(r => r.some(c => c != null))) || sheets[0];
    if (!chosen) throw new FileReadError('The workbook has no sheets.');
    sheetName = chosen.sheet;
    matrix = chosen.data as unknown[][];
  } else {
    const text = new TextDecoder('utf-8').decode(buffer);
    matrix = await parseCsv(text.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : text);
  }

  const { headers, rows, lines } = toRecords(matrix);
  if (headers.length === 0 || rows.length === 0) {
    throw new FileReadError('No data rows were found. The first row should hold column names, followed by one row per record.');
  }
  return { fileName: file.name, fileSize: file.size, fileHash, headers, rows, lines, sheetName, sheetNames };
}
