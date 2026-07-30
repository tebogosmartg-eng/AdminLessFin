/**
 * Canonical Document View (V11.7 / Critical Gap 1 / V15.0).
 *
 * Single preparation step shared by Live Preview, Workspace PDF, Published PDF,
 * and Published DOCX. Visibility, numbering, cross-reference rewrite, ordering,
 * and signatures are resolved HERE once — renderers must not re-interpret rules.
 *
 * V15.0: preparation is driven by the Enterprise Accounts Production Composition
 * Engine. Renderers consume the composed hierarchy via `composition`.
 */
import {
  formatLongDate,
  professionalStatementTitle,
  statementPeriodCaption,
} from './afsProfessionalPdf';
import {
  reportingPeriodCoverTitle,
  reportingPeriodLabel,
} from './reportingPeriodFormatter';
import type { DocumentModel, DocNoteNode, DocStatementNode } from '../document/documentModel';
import {
  buildNoteNumberResolution,
  rewriteCrossReferenceText,
} from '../document/crossRefRewrite';
import { isHidden, resolvedTitle, type DocOverrides } from '../document/documentStore';
import {
  displaySignatureField,
  SIGNATURE_PLACEHOLDERS,
  type DocSignatureNode,
} from '../document/signatureModel';
import { resolveBrandIdentity, type BrandIdentity } from './branding';
import type { CompositionDocument, CompositionPolicy } from '../composition/types';
import { provideCorporateInformation } from '../corporateInformation';
import { corporateDisplayFromModel } from '../corporateInformation/accessors';
import type { CorporateInformationModel } from '../corporateInformation';
import { produceReportingPackage, type ReportingIntelligenceOptions } from '../reportingIntelligence/orchestrator';
import type { ReportingPackage } from '../reportingIntelligence/types';
import { enterpriseDisclosureToBlocks } from '../composition/enterpriseDisclosure';

export type CanonicalTextBlock =
  | { type: 'paragraph'; text: string; bold?: boolean }
  | { type: 'table'; title: string; rows: string[][] };

export type CanonicalStatement = {
  id: string;
  statement_type: string;
  title: string;
  periodCaption: string;
  lines: DocStatementNode['lines'];
  populated: boolean;
};

export type CanonicalNote = {
  id: string;
  noteNumber: number;
  title: string;
  heading: string;
  blocks: CanonicalTextBlock[];
};

export type CanonicalSignature = {
  id: string;
  label: string;
  nameDisplay: string;
  positionDisplay: string;
  dateDisplay: string;
  signatureDisplay: string;
};

export type CanonicalPolicy = {
  id: string;
  title: string;
  body: string;
  policyCode: string;
};

export type CanonicalDocumentView = {
  companyName: string;
  frameworkLabel: string;
  periodCaption: string;
  currencyLabel: string;
  period: DocumentModel['period'];
  statements: CanonicalStatement[];
  notes: CanonicalNote[];
  /**
   * V15.0 — Accounting policies (Phase 3), separate from numbered disclosure notes.
   * Policies appear once and are never duplicated into notes.
   */
  accountingPolicies: CanonicalPolicy[];
  /** Baseline note numbers that are hidden in this view (for fingerprint / tests). */
  hiddenNoteIds: string[];
  signatures: CanonicalSignature[];
  /** Stable structure fingerprint — identical across PDF/DOCX/Preview prepare. */
  structureFingerprint: string;
  /**
   * V13.0 presentation metadata — consumed by the Professional Rendering Engine
   * for headers, footers and cover typography. These fields are derived read-only
   * from existing model data and are intentionally EXCLUDED from the structure
   * fingerprint (they carry no document semantics, numbering or content).
   */
  presentation: CanonicalPresentationMeta;
  /**
   * V15.0 — Full composition hierarchy. Renderers should prefer this for
   * sequencing, phase breaks, contents, and publication typography hints.
   */
  composition: CompositionDocument;
  /**
   * V17.0 — Reporting Intelligence package. Renderers MUST consume
   * publicationContract; they MUST NOT make reporting decisions.
   */
  reportingPackage: ReportingPackage;
  /**
   * V16.1 — Canonical corporate information model.
   * Single object consumed by all renderers — renderers never query repositories.
   */
  corporateInformation: CorporateInformationModel;
};

export type CanonicalPresentationMeta = {
  documentTitle: string;
  registrationNumber: string | null;
  tradingName: string | null;
  currencyCode: string;
  /** Backward-compatible period label retained for legacy consumers. */
  financialYearLabel: string;
  /** Canonical reporting-period heading for cover and section metadata. */
  coverTitle: string;
  /** Canonical reporting-period label for headers and cross-format display. */
  reportingPeriodLabel: string;
  reportingDateLong: string | null;
  issueDateLong: string;
  /** Configurable brand identity (presentation only — never statutory content). */
  branding: BrandIdentity;
  /** Entity particulars used to complete statutory front matter professionally. */
  natureOfBusiness: string | null;
  directors: string[];
  auditor: string | null;
  companySecretary: string | null;
  registeredOffice: string | null;
  businessAddress: string | null;
};

function stringifyCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return String(obj.label ?? obj.value ?? obj.text ?? JSON.stringify(obj));
  }
  return String(value);
}

function tableToRows(columns: unknown[], rows: unknown[]): string[][] {
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

function buildNoteBlocks(
  note: DocNoteNode,
  model: DocumentModel,
  overrides: DocOverrides,
  frameworkLabel: string,
): CanonicalTextBlock[] {
  const resolution = buildNoteNumberResolution(model.notes, overrides);
  const rewrite = (text: string) => rewriteCrossReferenceText(text, resolution, model.notes);
  const blocks: CanonicalTextBlock[] = [];

  for (const section of note.sections) {
    if (section.title && section.section_code !== 'body') {
      blocks.push({ type: 'paragraph', text: rewrite(section.title), bold: true });
    }
    if (section.body.trim()) blocks.push({ type: 'paragraph', text: rewrite(section.body) });
  }
  for (const paragraph of note.paragraphs) {
    if (paragraph.body.trim()) blocks.push({ type: 'paragraph', text: rewrite(paragraph.body) });
  }
  for (const table of note.tables) {
    const rows = tableToRows(table.columns_json, table.rows_json).map((row) =>
      row.map((cell) => rewrite(cell)),
    );
    if (rows.length) blocks.push({ type: 'table', title: rewrite(table.title), rows });
  }

  // V15.0: Accounting policies are composed in Phase 3 — never embedded into notes.

  if (!blocks.length) {
    blocks.push({
      type: 'paragraph',
      text: rewrite(
        `Disclosures relating to ${resolvedTitle(
          overrides,
          note.id,
          note.title,
        ).toLowerCase()} are presented in accordance with ${frameworkLabel}.`,
      ),
    });
  }

  return blocks;
}

function mapPolicies(policies: CompositionPolicy[], frameworkLabel: string): CanonicalPolicy[] {
  return policies.map((p) => ({
    id: p.id,
    title: p.title,
    policyCode: p.policyCode,
    body:
      p.body.trim() ||
      `The ${p.title.toLowerCase()} policy is applied in accordance with ${frameworkLabel}.`,
  }));
}

function fingerprintView(parts: {
  statements: CanonicalStatement[];
  notes: CanonicalNote[];
  policies: CanonicalPolicy[];
  hiddenNoteIds: string[];
  signatures: CanonicalSignature[];
  compositionFingerprint: string;
}): string {
  const lines: string[] = ['V16'];
  for (const s of parts.statements) {
    lines.push(`S|${s.id}|${s.title}|${s.lines.length}`);
  }
  for (const p of parts.policies) {
    lines.push(`POL|${p.policyCode}|${p.title}|${p.body}`);
  }
  for (const n of parts.notes) {
    const body = n.blocks
      .map((b) =>
        b.type === 'paragraph'
          ? `P:${b.bold ? 'B' : ''}:${b.text}`
          : `T:${b.title}:${b.rows.map((r) => r.join(',')).join(';')}`,
      )
      .join('||');
    lines.push(`N|${n.noteNumber}|${n.id}|${n.title}|${body}`);
  }
  lines.push(`H|${[...parts.hiddenNoteIds].sort().join(',')}`);
  for (const sig of parts.signatures) {
    lines.push(
      `SIG|${sig.id}|${sig.label}|${sig.nameDisplay}|${sig.positionDisplay}|${sig.dateDisplay}|${sig.signatureDisplay}`,
    );
  }
  lines.push(`COMP|${parts.compositionFingerprint}`);
  return lines.join('\n');
}

/**
 * Prepare the one canonical document view used by every output format.
 */
export function prepareCanonicalDocumentView(
  model: DocumentModel,
  overrides: DocOverrides,
  options?: ReportingIntelligenceOptions,
): CanonicalDocumentView {
  const reportingPackage = produceReportingPackage(model, overrides, options);
  const composition = reportingPackage.composition;

  const companyName = composition.companyName;
  const frameworkLabel = composition.frameworkLabel;
  const currencyLabel = composition.currencyLabel;
  const periodCaption = composition.periodCaption;
  const currency = composition.currencyLabel.includes('South African Rand')
    ? 'ZAR'
    : corporateDisplayFromModel(model).reportingCurrency;
  const endLong = formatLongDate(model.period?.end_date);

  const composedLineNoteRef = new Map<string, number | string>();
  for (const phase of composition.phases) {
    if (phase.id !== 'primary_statements') continue;
    for (const section of phase.sections) {
      for (const line of section.statement?.lines || []) {
        if (line.noteRef != null && line.lineCode) {
          composedLineNoteRef.set(line.lineCode.toLowerCase(), line.noteRef);
        }
      }
    }
  }

  const primarySections =
    composition.phases
      .find((p) => p.id === 'primary_statements')
      ?.sections.filter((s) => s.kind === 'statement' && s.statement) || [];

  const statements: CanonicalStatement[] =
    primarySections.length > 0
      ? primarySections.map((s) => {
          const cs = s.statement!;
          const source = model.statements.find((m) => m.id === cs.id);
          return {
            id: cs.id,
            statement_type: cs.statementType,
            title: cs.title,
            periodCaption: cs.periodCaption,
            lines: (source?.lines || []).map((line) => {
              if (line.note_ref != null && line.note_ref !== '') return line;
              const ref = composedLineNoteRef.get(String(line.line_code || '').toLowerCase());
              return ref != null ? { ...line, note_ref: ref } : line;
            }),
            populated: cs.populated,
          };
        })
      : model.statements
          .filter((s) => !isHidden(overrides, s.id))
          .map((s) => ({
            id: s.id,
            statement_type: s.statement_type,
            title: professionalStatementTitle(
              s.statement_type,
              resolvedTitle(overrides, s.id, s.title),
            ),
            periodCaption: statementPeriodCaption(s.statement_type, model.period || {}),
            lines: s.lines.map((line) => {
              if (line.note_ref != null && line.note_ref !== '') return line;
              const ref = composedLineNoteRef.get(String(line.line_code || '').toLowerCase());
              return ref != null ? { ...line, note_ref: ref } : line;
            }),
            populated: s.populated,
          }));

  const noteResolution = buildNoteNumberResolution(model.notes, overrides);
  const rewrite = (text: string) => rewriteCrossReferenceText(text, noteResolution, model.notes);

  const notes: CanonicalNote[] = composition.numberedNotes.map((n) => {
    const enterprise = composition.enterpriseDisclosures.find(
      (ed) => ed.id === n.id || ed.disclosureCode === n.disclosureCode,
    );
    if (enterprise) {
      const blocks = enterpriseDisclosureToBlocks(enterprise).map((b) =>
        b.type === 'paragraph'
          ? { type: 'paragraph' as const, text: rewrite(b.text), bold: b.bold }
          : {
              type: 'table' as const,
              title: b.title,
              rows: b.rows.map((row) => row.map((cell) => rewrite(cell))),
            },
      );
      return {
        id: n.id,
        noteNumber: n.noteNumber!,
        title: n.title,
        heading: n.heading || `Note ${n.noteNumber}. ${n.title}`,
        blocks: blocks.length ? blocks : buildNoteBlocks(
          model.notes.find((m) => m.id === n.id) || {
            id: n.id,
            kind: 'note',
            disclosure_code: n.disclosureCode,
            title: n.title,
            status: n.status,
            requirement_level: n.requirementLevel,
            sort_order: n.sortOrder,
            sections: [],
            paragraphs: [],
            tables: [],
          },
          model,
          overrides,
          frameworkLabel,
        ),
      };
    }
    const source = model.notes.find((m) => m.id === n.id);
    const emptyNote: DocNoteNode = {
      id: n.id,
      kind: 'note',
      disclosure_code: n.disclosureCode,
      title: n.title,
      status: n.status,
      requirement_level: n.requirementLevel,
      sort_order: n.sortOrder,
      sections: [],
      paragraphs: [],
      tables: [],
    };
    return {
      id: n.id,
      noteNumber: n.noteNumber!,
      title: n.title,
      heading: n.heading || `Note ${n.noteNumber}. ${n.title}`,
      blocks: buildNoteBlocks(source || emptyNote, model, overrides, frameworkLabel),
    };
  });

  const accountingPolicies = mapPolicies(composition.accountingPolicies, frameworkLabel);

  const signatures: CanonicalSignature[] = (model.signatures || []).map((sig: DocSignatureNode) => ({
    id: sig.id,
    label: sig.label,
    nameDisplay: displaySignatureField(sig.name, 'name'),
    positionDisplay: displaySignatureField(sig.position, 'position'),
    dateDisplay: displaySignatureField(sig.date, 'date'),
    signatureDisplay: SIGNATURE_PLACEHOLDERS.signature,
  }));

  const structureFingerprint = fingerprintView({
    statements,
    notes,
    policies: accountingPolicies,
    hiddenNoteIds: composition.numberedNotes.length
      ? model.notes.filter((n) => !composition.numberedNotes.some((x) => x.id === n.id)).map((n) => n.id)
      : [],
    signatures,
    compositionFingerprint: composition.compositionFingerprint,
  });

  const reportingLabel = reportingPeriodLabel(model.period?.end_date);
  const corporateInformation =
    composition.corporateInformation ?? provideCorporateInformation(model);
  const directors = corporateInformation.directors
    .filter((d) => d.active)
    .map((d) => d.name);
  const auditorEntry = corporateInformation.governance.find((g) => g.role === 'auditor');
  const secretaryEntry = corporateInformation.governance.find(
    (g) => g.role === 'company_secretary',
  );
  const registeredOffice = corporateInformation.addresses.find(
    (a) => a.kind === 'registered_office',
  );
  const businessAddress = corporateInformation.addresses.find(
    (a) => a.kind === 'business_address',
  );
  const presentation: CanonicalPresentationMeta = {
    documentTitle: composition.publicationHints.documentTitle,
    registrationNumber: corporateInformation.entityIdentity.registrationNumber.formatted,
    tradingName: corporateInformation.entityIdentity.tradingName.formatted,
    currencyCode: currency,
    financialYearLabel:
      model.period?.period_key || model.period?.label || reportingLabel,
    coverTitle: reportingPeriodCoverTitle(model.period?.end_date),
    reportingPeriodLabel: reportingLabel,
    reportingDateLong: endLong,
    issueDateLong:
      corporateInformation.engagement.issueDate.formatted ||
      formatLongDate(new Date().toISOString()) ||
      '',
    branding: resolveBrandIdentity(),
    natureOfBusiness: corporateInformation.entityIdentity.natureOfBusiness.formatted,
    directors,
    auditor: auditorEntry?.name ?? null,
    companySecretary: secretaryEntry?.name ?? null,
    registeredOffice: registeredOffice?.value ?? null,
    businessAddress: businessAddress?.value ?? null,
  };

  return {
    companyName,
    frameworkLabel,
    periodCaption,
    currencyLabel,
    period: model.period,
    statements,
    notes,
    accountingPolicies,
    hiddenNoteIds: model.notes
      .filter((n) => !composition.numberedNotes.some((x) => x.id === n.id))
      .map((n) => n.id),
    signatures,
    structureFingerprint,
    presentation,
    composition,
    reportingPackage,
    corporateInformation,
  };
}
