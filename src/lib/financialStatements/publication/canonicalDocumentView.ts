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
  type NoteNumberer,
} from '../document/crossRefRewrite';
import { buildNoteRegister, registerFromComposition } from '../document/noteRegister';
import type { NumberedNote } from '../document/renumber';
import { includeChoice, isHidden, resolvedTitle, type DocOverrides } from '../document/documentStore';
import { resolveNoteContent } from '../document/noteContent';
import {
  displaySignatureField,
  SIGNATURE_PLACEHOLDERS,
  type DocSignatureNode,
} from '../document/signatureModel';
import { resolveBrandIdentity, type BrandIdentity } from './branding';
import type { CompositionDocument, CompositionPolicy } from '../composition/types';
import { statementLineLabel } from '../composition/compose';
import { provideCorporateInformation } from '../corporateInformation';
import { corporateDisplayFromModel } from '../corporateInformation/accessors';
import type { CorporateInformationModel } from '../corporateInformation';
import { produceReportingPackage, type ReportingIntelligenceOptions } from '../reportingIntelligence/orchestrator';
import type { ReportingPackage } from '../reportingIntelligence/types';
import {
  approvalIntro,
  auditorsReportParagraphs,
  directorsReportParagraphs,
  directorsResponsibilitiesParagraphs,
} from './statutoryFrontMatter';
import { enterpriseDisclosureToBlocks } from '../composition/enterpriseDisclosure';
import { tableRowKinds, tableToCompositionRows } from '../composition/disclosureComponents';
import { presentTableRows, reportingYears } from './statementPresentation';
import { applyLineChoices, type LineItem } from './lineItems';

export type CanonicalTextBlock =
  | { type: 'paragraph'; text: string; bold?: boolean }
  | {
      type: 'table';
      title: string;
      rows: string[][];
      /** Row kinds, index for index with `rows` (row 0 is the column header). */
      kinds?: string[];
    };

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
  /** What prints, after the preparer's line choices. */
  blocks: CanonicalTextBlock[];
  disclosureCode: string;
  /** Every table line, printed or not, with what was decided for it. */
  lineItems: LineItem[];
  /** The preparer asked for this note to start on a new page. */
  pageBreakBefore: boolean;
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
  /** A table the policy states, header row first. */
  table?: string[][];
  /** Wording that follows the table. */
  bodyAfter?: string;
};

/** One block of a narrative section: an optional run-in heading and its text. */
export type CanonicalNarrativeBlock = { heading?: string; body: string };

/**
 * A narrative front-matter section as it will print. The wording is the
 * practice's own where the preparer has written it, and the generated
 * statutory text otherwise — resolved HERE once, for every renderer and
 * for the editor alike.
 */
export type CanonicalFrontMatterSection = {
  /** Composition section id — also the key authored wording is stored under. */
  id: string;
  title: string;
  blocks: CanonicalNarrativeBlock[];
  /** True when the preparer's wording replaced the generated text. */
  authored: boolean;
  /** False where the preparer switched the section off; it does not print. */
  included: boolean;
};

export type CanonicalFrontMatter = {
  responsibilities: CanonicalFrontMatterSection;
  directorsReport: CanonicalFrontMatterSection;
  practitionerReport: CanonicalFrontMatterSection;
  approval: CanonicalFrontMatterSection;
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
  /**
   * The narrative front matter as it will print: the directors'
   * responsibilities statement, the directors' report, the practitioner's
   * report and the approval wording — authored text where the preparer has
   * written it, generated statutory wording otherwise.
   */
  frontMatter: CanonicalFrontMatter;
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

/**
 * One flattener, shared with the composition engine.
 *
 * There were two copies of this, character for character, and the PDF happened
 * to go through the other one — so fixing this file alone left the printed
 * statements blank. Keeping a single implementation is what stops the editor
 * and the page disagreeing again.
 */
const tableToRows = tableToCompositionRows;

function buildNoteBlocks(
  note: DocNoteNode,
  overrides: DocOverrides,
  frameworkLabel: string,
  rewrite: (text: string) => string,
): CanonicalTextBlock[] {
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
    const kinds = tableRowKinds(table.columns_json, table.rows_json);
    if (rows.length) {
      blocks.push({
        type: 'table',
        title: rewrite(table.title),
        rows,
        kinds: kinds.length === rows.length ? kinds : undefined,
      });
    }
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
    table: p.table,
    bodyAfter: p.bodyAfter,
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
  rawModel: DocumentModel,
  overrides: DocOverrides,
  options?: ReportingIntelligenceOptions,
): CanonicalDocumentView {
  // What the preparer ordered and what they withheld is settled once, here,
  // before anything downstream reads a note. The composition engine, the PDF,
  // the DOCX and the preview then all print the note the Editor shows.
  const model: DocumentModel = {
    ...rawModel,
    notes: rawModel.notes.map((note) => resolveNoteContent(note, overrides)),
  };
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

  // Every note number on every statement comes from the one register, which
  // holds only the notes this document prints.
  const register = registerFromComposition(composition);
  // Each line carries its printed note number and the caption the preparer
  // gave it, where they renamed it; the figures are the ledger's.
  const withNoteRef = (statementType: string) => (line: DocStatementNode['lines'][number]) => ({
    ...line,
    label: statementLineLabel(overrides, statementType, line),
    note_ref: register.forLine(line.line_code)?.noteNumber ?? null,
  });

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
            lines: (source?.lines || []).map(withNoteRef(cs.statementType)),
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
            lines: s.lines.map(withNoteRef(s.statement_type)),
            populated: s.populated,
          }));

  // "Note N" written in the notes is translated between the numbering the
  // document has with no presentation choices applied and the numbering it is
  // printed with — both read from the register, so prose, statements and
  // headings all quote the same number.
  const numberer: NoteNumberer = (o) => {
    const reg = o === overrides ? register : buildNoteRegister(rawModel, o, options);
    const visible: NumberedNote[] = [];
    for (const entry of reg.notes) {
      const note = model.notes.find((n) => n.id === entry.id);
      if (note) visible.push({ note, noteNumber: entry.noteNumber, title: entry.title, heading: entry.heading });
    }
    return { visible };
  };
  const noteResolution = buildNoteNumberResolution(model.notes, overrides, numberer);
  const rewrite = (text: string) => rewriteCrossReferenceText(text, noteResolution, model.notes);
  // Every note table prints its years and figures the way the statements do.
  const years = reportingYears(model.period);
  const present = (block: CanonicalTextBlock): CanonicalTextBlock =>
    block.type === 'table' ? { ...block, rows: presentTableRows(block.rows, years) } : block;

  type ComposedNote = Omit<CanonicalNote, 'lineItems' | 'disclosureCode' | 'pageBreakBefore'>;
  const composedNotes: ComposedNote[] = composition.numberedNotes.map((n) => {
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
              kinds: b.kinds && b.kinds.length === b.rows.length ? b.kinds : undefined,
            },
      );
      return {
        id: n.id,
        noteNumber: n.noteNumber!,
        title: n.title,
        heading: n.heading || `${n.noteNumber}. ${n.title}`,
        blocks: (blocks.length ? blocks : buildNoteBlocks(
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
          overrides,
          frameworkLabel,
          rewrite,
        )).map(present),
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
      heading: n.heading || `${n.noteNumber}. ${n.title}`,
      blocks: buildNoteBlocks(source || emptyNote, overrides, frameworkLabel, rewrite).map(present),
    };
  });

  // Which table lines print: the preparer's choice, or the default that holds
  // back a line of nothing but placeholders.
  const notes: CanonicalNote[] = composedNotes.map((n) => {
    const disclosureCode = String(
      composition.numberedNotes.find((x) => x.id === n.id)?.disclosureCode || '',
    ).toUpperCase();
    const chosen = applyLineChoices(disclosureCode, n.blocks, overrides.lines);
    const blocks: CanonicalTextBlock[] = chosen.blocks.length
      ? chosen.blocks
      : [
          {
            type: 'paragraph',
            text: `Disclosures relating to ${n.title.toLowerCase()} are presented in accordance with ${frameworkLabel}.`,
          },
        ];
    return {
      ...n,
      blocks,
      disclosureCode,
      lineItems: chosen.items,
      pageBreakBefore: !!overrides.pageBreaks?.[n.id],
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

  const viewSansFront = {
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
  return {
    ...viewSansFront,
    frontMatter: resolveFrontMatter(viewSansFront as CanonicalDocumentView, overrides),
  };
}

/** The report title the level of assurance calls for. */
export function practitionerReportTitle(assurance: string): string {
  if (/review/i.test(assurance)) return "Independent Reviewer's Report";
  if (/compil/i.test(assurance)) return "Practitioner's Compilation Report";
  return "Independent Auditor's Report";
}

/** Authored wording where the preparer wrote it, the generated text otherwise. */
function resolveFrontSection(
  overrides: DocOverrides,
  id: string,
  defaultTitle: string,
  generated: CanonicalNarrativeBlock[],
): CanonicalFrontMatterSection {
  const authored = overrides.narratives?.[id];
  const authoredBlocks = Array.isArray(authored)
    ? authored
        .map((b) => ({
          heading: String(b?.heading ?? '').trim() || undefined,
          body: String(b?.body ?? '').trim(),
        }))
        .filter((b) => b.body || b.heading)
    : [];
  const blocks = authoredBlocks.length ? authoredBlocks : generated;
  return {
    id,
    title: resolvedTitle(overrides, id, defaultTitle),
    blocks,
    authored: authoredBlocks.length > 0,
    included: includeChoice(overrides, 'section', id) !== false,
  };
}

function resolveFrontMatter(
  view: CanonicalDocumentView,
  overrides: DocOverrides,
): CanonicalFrontMatter {
  const assurance = view.corporateInformation.levelOfAssurance.formatted || '';
  return {
    responsibilities: resolveFrontSection(
      overrides,
      'front:directors_responsibilities',
      "Directors' Responsibilities and Approval",
      directorsResponsibilitiesParagraphs(view).map((body) => ({ body })),
    ),
    directorsReport: resolveFrontSection(
      overrides,
      'front:directors_report',
      "Directors' Report",
      directorsReportParagraphs(view),
    ),
    practitionerReport: resolveFrontSection(
      overrides,
      'front:independent_auditor',
      practitionerReportTitle(assurance),
      auditorsReportParagraphs(view).map((body) => ({ body })),
    ),
    approval: resolveFrontSection(
      overrides,
      'front:approval',
      'Approval of Annual Financial Statements',
      [{ body: approvalIntro(view) }],
    ),
  };
}
