/**
 * Professional Annual Financial Statements PDF presentation (V6.10.3).
 * Presentation-only — never recalculates balances or reads live GL.
 */


const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_L = 54;
const MARGIN_R = 54;
const MARGIN_TOP = 62;
const MARGIN_BOTTOM = 52;
const CONTENT_RIGHT = PAGE_W - MARGIN_R;
const AMOUNT_COL = CONTENT_RIGHT;
const LABEL_MAX = 360;

const STATEMENT_ORDER = [
  "financial_position",
  "financial_performance",
  "changes_in_equity",
  "cash_flows",
];

const NOTE_ORDER = [
  "DISC.BASIS",
  "NOTE.BASIS",
  "DISC.POLICIES",
  "NOTE.POLICIES",
  "DISC.REVENUE",
  "DISC.PPE",
  "DISC.RELATED",
  "DISC.EVENTS",
  "DISC.CONTINGENT",
];

const NOTE_TITLES = {
  "DISC.BASIS": "Basis of Preparation",
  "NOTE.BASIS": "Basis of Preparation",
  "DISC.POLICIES": "Significant Accounting Policies",
  "NOTE.POLICIES": "Significant Accounting Policies",
  "DISC.REVENUE": "Revenue",
  "DISC.PPE": "Property, Plant and Equipment",
  "DISC.RELATED": "Related Parties",
  "DISC.EVENTS": "Events after the Reporting Period",
  "DISC.CONTINGENT": "Contingencies and Commitments",
};

const LINE_LABEL_OVERRIDES = {
  "Period result": "Profit / (Loss) for the period",
  "Period Result": "Profit / (Loss) for the period",
  "Opening equity": "Opening equity",
  "Closing equity": "Closing equity",
  "Net change in cash": "Net increase / (decrease) in cash and cash equivalents",
};

import { formatReportingEndDate } from "./reportingPeriodFormatter";

function escapePdfText(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function formatAmount(n) {
  const v = round2(n);
  const neg = v < 0;
  const abs = Math.abs(v);
  const [intPart, fracPart] = abs.toFixed(2).split(".");
  const withGroups = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = `${withGroups}.${fracPart}`;
  return neg ? `(${formatted})` : formatted;
}

export function formatLongDate(iso) {
  return formatReportingEndDate(iso);
}

export function humanFrameworkLabel(
  pack,
  meta: { framework_key?: string; framework_label?: string } = {},
) {
  const name = pack?.engagement?.framework?.name;
  if (name && !/^[A-Z0-9_.]+$/.test(name)) return name;
  const key =
    pack?.engagement?.framework?.framework_key ||
    meta.framework_key ||
    pack?.engagement?.framework?.label ||
    "";
  const map = {
    IFRS_SME: "IFRS for SMEs",
    IFRS: "IFRS",
    IFRS_FULL: "Full IFRS",
    GRAP: "GRAP",
  };
  if (map[key]) return map[key];
  if (meta.framework_label) return meta.framework_label;
  if (key && !/^[A-Z0-9_.]+$/.test(String(key))) return String(key);
  return "IFRS for SMEs";
}

export function professionalStatementTitle(statementType, fallback) {
  const map = {
    financial_position: "Statement of Financial Position",
    financial_performance: "Statement of Profit or Loss and Other Comprehensive Income",
    cash_flows: "Statement of Cash Flows",
    changes_in_equity: "Statement of Changes in Equity",
  };
  return map[statementType] || fallback || "Financial Statement";
}

export function statementPeriodCaption(statementType, period) {
  const end = formatLongDate(period?.end_date) || period?.label || "the reporting date";
  if (statementType === "financial_position") return `As at ${end}`;
  return `For the year ended ${end}`;
}

export function professionalLineLabel(label) {
  const raw = String(label || "").trim();
  return LINE_LABEL_OVERRIDES[raw] || raw;
}

export function professionalNoteTitle(disclosureCode, title) {
  const code = String(disclosureCode || "").toUpperCase();
  if (NOTE_TITLES[code]) return NOTE_TITLES[code];
  const cleaned = String(title || "")
    .replace(/^DISC\.[A-Z0-9_.]+\s*[:–—-]?\s*/i, "")
    .replace(/^NOTE\.[A-Z0-9_.]+\s*[:–—-]?\s*/i, "")
    .trim();
  if (cleaned) {
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, "and");
  }
  return "Disclosure";
}

export function numberDisclosures(disclosures) {
  const list = [...(disclosures || [])].filter((d) => d.status !== "superseded");
  list.sort((a, b) => {
    const ia = NOTE_ORDER.indexOf(String(a.disclosure_code || "").toUpperCase());
    const ib = NOTE_ORDER.indexOf(String(b.disclosure_code || "").toUpperCase());
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
  return list.map((d, i) => ({
    noteNumber: i + 1,
    disclosure_code: d.disclosure_code,
    title: professionalNoteTitle(d.disclosure_code, d.title),
    heading: `Note ${i + 1}. ${professionalNoteTitle(d.disclosure_code, d.title)}`,
  }));
}

function approxWidth(text, size) {
  // Helvetica average glyph width ≈ 0.5em; slightly conservative for layout.
  return String(text || "").length * size * 0.48;
}

function truncateToWidth(text, size, maxWidth) {
  const s = String(text || "");
  if (approxWidth(s, size) <= maxWidth) return s;
  let out = s;
  while (out.length > 3 && approxWidth(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawText(ops, x, y, size, text, bold = false, align = "left") {
  const t = String(text || "");
  let tx = x;
  if (align === "right") tx = x - approxWidth(t, size);
  if (align === "center") tx = x - approxWidth(t, size) / 2;
  ops.push({ type: "text", x: tx, y, size, text: t, bold });
}

function drawRule(ops, x1, y, x2, width = 0.6) {
  ops.push({ type: "line", x1, y, x2, y2: y, width });
}

function newPage() {
  return { ops: [], cursor: PAGE_H - MARGIN_TOP } as {
    ops: any[];
    cursor: number;
    isCover?: boolean;
  };
}

function ensureSpace(pages, page, need) {
  if (page.cursor - need < MARGIN_BOTTOM + 28) {
    pages.push(page);
    const next = newPage();
    return next;
  }
  return page;
}

function addHeaderFooterHints(page, meta) {
  page.headerLeft = meta.companyName;
  page.headerRight = meta.periodLabel;
  page.footerLeft = "Annual Financial Statements";
  page.footerCenter = meta.frameworkLabel;
}

function renderHeaderFooter(ops, pageIndex, pageCount, page) {
  const yTop = PAGE_H - 28;
  const yBot = 28;
  if (page.headerLeft) {
    drawText(ops, MARGIN_L, yTop, 8, truncateToWidth(page.headerLeft, 8, 220), false, "left");
  }
  if (page.headerRight) {
    drawText(ops, CONTENT_RIGHT, yTop, 8, truncateToWidth(page.headerRight, 8, 220), false, "right");
  }
  drawRule(ops, MARGIN_L, yTop - 6, CONTENT_RIGHT, 0.4);
  drawRule(ops, MARGIN_L, yBot + 12, CONTENT_RIGHT, 0.4);
  drawText(ops, MARGIN_L, yBot, 8, page.footerLeft || "Annual Financial Statements", false, "left");
  drawText(
    ops,
    PAGE_W / 2,
    yBot,
    8,
    truncateToWidth(page.footerCenter || "", 8, 180),
    false,
    "center",
  );
  drawText(ops, CONTENT_RIGHT, yBot, 8, `Page ${pageIndex} of ${pageCount}`, false, "right");
}

function buildCoverPage(meta) {
  const page = newPage();
  const ops = page.ops;
  page.isCover = true;
  page.cursor = PAGE_H - 160;

  drawRule(ops, MARGIN_L, page.cursor + 40, CONTENT_RIGHT, 1.1);
  drawText(ops, PAGE_W / 2, page.cursor, 22, meta.companyName, true, "center");
  page.cursor -= 36;
  drawText(ops, PAGE_W / 2, page.cursor, 16, "Annual Financial Statements", true, "center");
  page.cursor -= 28;
  drawText(ops, PAGE_W / 2, page.cursor, 11, meta.periodCaptionCover, false, "center");
  page.cursor -= 22;
  drawText(ops, PAGE_W / 2, page.cursor, 11, meta.frameworkLabel, false, "center");
  if (meta.currencyLabel) {
    page.cursor -= 18;
    drawText(ops, PAGE_W / 2, page.cursor, 9, meta.currencyLabel, false, "center");
  }
  page.cursor -= 36;
  drawRule(ops, MARGIN_L + 80, page.cursor, CONTENT_RIGHT - 80, 0.7);
  page.cursor -= 40;
  drawText(
    ops,
    PAGE_W / 2,
    page.cursor,
    9,
    "Prepared in accordance with the applicable financial reporting framework",
    false,
    "center",
  );
  return page;
}

function buildTocPage(entries, meta) {
  const page = newPage();
  addHeaderFooterHints(page, meta);
  page.ops = [];
  let y = page.cursor;
  drawText(page.ops, MARGIN_L, y, 14, "Contents", true, "left");
  y -= 28;
  for (const e of entries) {
    const left = e.title;
    const right = String(e.page);
    const dotsWidth = CONTENT_RIGHT - MARGIN_L - approxWidth(left, 10) - approxWidth(right, 10) - 12;
    const dotCount = Math.max(3, Math.floor(dotsWidth / approxWidth(".", 10)));
    const line = `${left} ${".".repeat(dotCount)} ${right}`;
    drawText(page.ops, MARGIN_L, y, 10, truncateToWidth(line, 10, CONTENT_RIGHT - MARGIN_L), false, "left");
    y -= 16;
  }
  page.cursor = y;
  return page;
}

function writeStatementRows(pages, page, rows, meta) {
  addHeaderFooterHints(page, meta);
  let current = page;
  let lastSection = null;

  for (const row of rows) {
    const section = row.section || "";
    if (section && section !== lastSection && lastSection !== null) {
      current = ensureSpace(pages, current, 14);
      current.cursor -= 8;
    }
    lastSection = section || lastSection;

    current = ensureSpace(pages, current, 16);
    const label = truncateToWidth(
      professionalLineLabel(row.label),
      row.is_total ? 10 : 10,
      LABEL_MAX,
    );
    const amount = formatAmount(row.amount);
    const y = current.cursor;
    drawText(current.ops, MARGIN_L + (row.is_total ? 0 : 8), y, 10, label, !!row.is_total, "left");
    drawText(current.ops, AMOUNT_COL, y, 10, amount, !!row.is_total, "right");
    if (row.is_total) {
      drawRule(current.ops, AMOUNT_COL - 88, y - 3, AMOUNT_COL, 0.6);
    }
    current.cursor -= row.is_total ? 16 : 14;
  }
  return current;
}

function buildStatementPages(table, meta) {
  const pages = [];
  let page = newPage();
  addHeaderFooterHints(page, meta);

  drawText(page.ops, MARGIN_L, page.cursor, 13, professionalStatementTitle(table.statement_type, table.title), true);
  page.cursor -= 16;
  drawText(page.ops, MARGIN_L, page.cursor, 10, statementPeriodCaption(table.statement_type, meta.period), false);
  page.cursor -= 14;
  if (meta.currencyLabel) {
    drawText(page.ops, MARGIN_L, page.cursor, 9, meta.currencyLabel, false);
    page.cursor -= 12;
  }
  drawRule(page.ops, MARGIN_L, page.cursor, CONTENT_RIGHT, 0.7);
  page.cursor -= 18;

  // Column heading
  drawText(page.ops, AMOUNT_COL, page.cursor, 8, meta.amountHeading || "R", true, "right");
  page.cursor -= 14;
  drawRule(page.ops, MARGIN_L, page.cursor + 6, CONTENT_RIGHT, 0.4);
  page.cursor -= 4;

  page = writeStatementRows(pages, page, table.rows || [], meta);
  pages.push(page);
  return pages;
}

function buildNotesPages(notes, meta) {
  const pages = [];
  let page = newPage();
  addHeaderFooterHints(page, meta);

  drawText(page.ops, MARGIN_L, page.cursor, 13, "Notes to the Annual Financial Statements", true);
  page.cursor -= 16;
  drawText(page.ops, MARGIN_L, page.cursor, 10, statementPeriodCaption("notes", meta.period), false);
  page.cursor -= 14;
  drawRule(page.ops, MARGIN_L, page.cursor, CONTENT_RIGHT, 0.7);
  page.cursor -= 20;

  if (!notes.length) {
    drawText(page.ops, MARGIN_L, page.cursor, 10, "No notes are included in this publication pack.", false);
    pages.push(page);
    return pages;
  }

  for (const note of notes) {
    page = ensureSpace(pages, page, 48);
    if (page.cursor < PAGE_H - MARGIN_TOP - 20) {
      page.cursor -= 8;
    }
    drawText(page.ops, MARGIN_L, page.cursor, 11, note.heading, true);
    page.cursor -= 16;
    const body =
      note.title === "Basis of Preparation"
        ? `These annual financial statements have been prepared in accordance with ${meta.frameworkLabel}.`
        : note.title === "Significant Accounting Policies"
          ? `The principal accounting policies applied in the preparation of these annual financial statements are set out below and are consistent with those applied in the prior period, except where otherwise indicated.`
          : `Disclosures relating to ${note.title.toLowerCase()} are presented in accordance with ${meta.frameworkLabel}.`;
    const wrapped = wrapText(body, 10, CONTENT_RIGHT - MARGIN_L);
    for (const line of wrapped) {
      page = ensureSpace(pages, page, 14);
      drawText(page.ops, MARGIN_L, page.cursor, 10, line, false);
      page.cursor -= 13;
    }
    page.cursor -= 6;
  }

  pages.push(page);
  return pages;
}

function wrapText(text, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const w of words) {
    const trial = current ? `${current} ${w}` : w;
    if (approxWidth(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function opsToStream(ops) {
  const parts = [];
  for (const op of ops) {
    if (op.type === "text") {
      const font = op.bold ? "/F2" : "/F1";
      parts.push("BT");
      parts.push(`${font} ${op.size} Tf`);
      parts.push(`1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm`);
      parts.push(`(${escapePdfText(op.text)}) Tj`);
      parts.push("ET");
    } else if (op.type === "line") {
      parts.push(`${(op.width || 0.6).toFixed(2)} w`);
      parts.push(`${op.x1.toFixed(2)} ${op.y.toFixed(2)} m`);
      parts.push(`${op.x2.toFixed(2)} ${(op.y2 ?? op.y).toFixed(2)} l`);
      parts.push("S");
    }
  }
  return parts.join("\n");
}

function assemblePdf(pages) {
  const objects = new Map();
  objects.set(1, "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj");
  objects.set(3, "3 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj");
  objects.set(4, "4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj");

  const pageRefs = [];
  let objNum = 5;
  const pageCount = pages.length;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const ops = [...page.ops];
    if (!page.isCover) {
      renderHeaderFooter(ops, i + 1, pageCount, page);
    } else {
      // Cover: page number only, discreet
      drawText(ops, CONTENT_RIGHT, 28, 8, `Page ${i + 1} of ${pageCount}`, false, "right");
    }
    const stream = opsToStream(ops);
    const streamLen = new TextEncoder().encode(stream).length;
    const contentObj = objNum++;
    const pageObj = objNum++;
    pageRefs.push(pageObj);
    objects.set(
      contentObj,
      `${contentObj} 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj`,
    );
    objects.set(
      pageObj,
      `${pageObj} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>endobj`,
    );
  }

  objects.set(
    2,
    `2 0 obj<< /Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageRefs.length} >>endobj`,
  );

  const maxObj = Math.max(...objects.keys());
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i <= maxObj; i++) {
    offsets.push(pdf.length);
    pdf += (objects.get(i) || `${i} 0 obj<<>>endobj`) + "\n";
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${maxObj + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= maxObj; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function sortTables(tables) {
  return [...(tables || [])].sort((a, b) => {
    const ia = STATEMENT_ORDER.indexOf(a.statement_type);
    const ib = STATEMENT_ORDER.indexOf(b.statement_type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/**
 * Build a publication-quality Annual Financial Statements PDF from a sealed pack.
 */
export function generateProfessionalAfsPdf(pack, extractCanonicalTables) {
  const metaIn = pack.metadata || {};
  const { tables, disclosures } = extractCanonicalTables(pack);
  const companyName =
    metaIn.company_name ||
    pack.engagement?.company_name ||
    pack.engagement?.workspace_name ||
    "Reporting Entity";
  const period = pack.engagement?.reporting_period || {};
  const periodLabel = metaIn.period_label || period.label || period.period_key || "";
  const frameworkLabel = humanFrameworkLabel(pack, metaIn);
  const endLong = formatLongDate(period.end_date);
  const periodCaptionCover = endLong
    ? `For the year ended ${endLong}`
    : periodLabel
      ? periodLabel
      : "For the reporting period";
  const currency =
    metaIn.reporting_currency ||
    pack.engagement?.reporting_currency ||
    "ZAR";
  const currencyLabel =
    currency === "ZAR" || currency === "R"
      ? "Figures are stated in South African Rand (R)"
      : `Figures are stated in ${currency}`;

  const meta = {
    companyName,
    periodLabel,
    period,
    frameworkLabel,
    periodCaptionCover,
    currencyLabel,
    amountHeading: currency === "ZAR" || currency === "R" ? "R" : currency,
  };

  const orderedTables = sortTables(tables);
  const notes = numberDisclosures(disclosures);

  // First pass: statement + notes pages (TOC filled after page numbers known)
  const cover = buildCoverPage(meta);
  const bodyStartPage = 3; // cover + TOC
  const tocEntries = [];
  const bodyPages = [];

  let pageNo = bodyStartPage;
  for (const table of orderedTables) {
    const title = professionalStatementTitle(table.statement_type, table.title);
    tocEntries.push({ title, page: pageNo });
    const stmtPages = buildStatementPages(table, meta);
    bodyPages.push(...stmtPages);
    pageNo += stmtPages.length;
  }

  tocEntries.push({ title: "Notes to the Annual Financial Statements", page: pageNo });
  const notesPages = buildNotesPages(notes, meta);
  bodyPages.push(...notesPages);

  const toc = buildTocPage(tocEntries, meta);
  const allPages = [cover, toc, ...bodyPages];
  return assemblePdf(allPages);
}

/** Layout / content quality checks for certification (presentation only). */
export function validateProfessionalLayout(pdfText) {
  const t = String(pdfText || "");
  const lower = t.toLowerCase();
  const checks = {
    hasCoverEntity: /annual financial statements/i.test(t),
    hasContents: /\bcontents\b/i.test(t),
    hasSfpTitle: /statement of financial position/i.test(t),
    hasPlTitle: /statement of profit or loss/i.test(t),
    hasEquityTitle: /statement of changes in equity/i.test(t),
    hasCfTitle: /statement of cash flows/i.test(t),
    hasNumberedNotes: /note\s+1\s*[.]\s*basis of preparation/i.test(t),
    hasPoliciesNote: /note\s+2\s*[.]\s*significant accounting policies/i.test(t),
    hasPageNumbers: /page\s+\d+\s+of\s+\d+/i.test(t),
    noDebugMarkers: !/===\s*statement/i.test(t) && !/>>\s/.test(t),
    noDiscCodes: !/\bdisc\.[a-z0-9_.]+/i.test(t),
    noFingerprint: !/publication fingerprint/i.test(lower),
    noSnapshotTerms: !/\bsnapshot\b/i.test(lower) && !/\blineage\b/i.test(lower),
    noFrameworkKeyDump: !/\bifrs_sme\b/i.test(t),
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
  };
}
