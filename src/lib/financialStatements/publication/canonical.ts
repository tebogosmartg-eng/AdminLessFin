/**
 * Canonical publication pack helpers — mirrored for client-side tests.
 * Server source of truth: supabase/functions/_shared/efsPublicationPlatform/index.ts
 */

export type CanonicalRow = {
  statement_type: string;
  line_code: string;
  label: string;
  section: string;
  amount: number;
  is_total: boolean;
};

export type CanonicalTable = {
  statement_type: string;
  title: string;
  rows: CanonicalRow[];
};

function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function extractCanonicalTables(pack: {
  statements?: Array<{
    statement_type: string;
    title?: string;
    lines?: Array<{
      line_code: string;
      label: string;
      section?: string;
      amount: number;
      is_total?: boolean;
    }>;
  }>;
  disclosures?: Array<{ disclosure_code: string; title: string; status: string }>;
  working_papers?: Array<{ id: string; title: string; status: string; reference_code?: string | null }>;
}) {
  const statements = pack.statements || [];
  const tables: CanonicalTable[] = [];

  for (const stmt of statements) {
    const rows = (stmt.lines || []).map((ln) => ({
      statement_type: stmt.statement_type,
      line_code: ln.line_code,
      label: ln.label,
      section: ln.section || '',
      amount: round2(ln.amount),
      is_total: !!ln.is_total,
    }));
    tables.push({
      statement_type: stmt.statement_type,
      title: stmt.title || stmt.statement_type,
      rows,
    });
  }

  const disclosures = (pack.disclosures || [])
    .filter((d) => d.status !== 'superseded')
    .map((d) => ({
      disclosure_code: d.disclosure_code,
      title: d.title,
      status: d.status,
    }));

  const working_papers = (pack.working_papers || []).map((w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    reference_code: w.reference_code || null,
  }));

  return { tables, disclosures, working_papers };
}

export function buildCanonicalAmountSignature(pack: Parameters<typeof extractCanonicalTables>[0]) {
  const { tables } = extractCanonicalTables(pack);
  return tables
    .flatMap((t) => t.rows.map((r) => `${r.statement_type}|${r.line_code}|${r.amount}`))
    .sort()
    .join('\n');
}

export function mimeForFormat(format: string): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default:
      return 'application/octet-stream';
  }
}

export function extensionForFormat(format: string): string {
  return format;
}

export function downloadBase64Artifact(
  contentBase64: string,
  format: string,
  filenameBase: string,
) {
  const bytes = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeForFormat(format) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}.${extensionForFormat(format)}`;
  a.click();
  URL.revokeObjectURL(url);
}
