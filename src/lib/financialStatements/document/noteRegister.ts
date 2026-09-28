/**
 * The note register: which notes the financial statements print, and the
 * number each one carries.
 *
 * There used to be two numberings. The navigator numbered notes one way and
 * the printed document another, after the reporting engine had reordered them
 * and withheld the ones with nothing to say — so the statement said "Note 5"
 * for property, plant and equipment while the navigator called it Note 3.
 *
 * The number a note carries is the number it is printed with. That is decided
 * in exactly one place, when the document is composed, and this register is
 * how everything else reads it: the navigator, the properties panel, the
 * statements in the Editor, the Live Preview, the PDF and the Word document.
 * Nothing numbers a note on its own.
 */
import type { CompositionDocument } from '../composition/types';
import { disclosureCodeForLine } from '../composition/disclosureLinking';
import {
  produceReportingPackage,
  type ReportingIntelligenceOptions,
} from '../reportingIntelligence/orchestrator';
import type { ReportingPackage } from '../reportingIntelligence/types';
import type { DocumentModel } from './documentModel';
import type { DocOverrides } from './documentStore';
import { resolveNoteContent } from './noteContent';

export type RegisteredNote = {
  id: string;
  disclosureCode: string;
  noteNumber: number;
  title: string;
  heading: string;
};

export type NoteRegister = {
  /** The printed notes, in the order they print. */
  notes: RegisteredNote[];
  byId: Map<string, RegisteredNote>;
  /** Keyed by upper-case disclosure code. */
  byCode: Map<string, RegisteredNote>;
  /** The note a statement line refers to — only ever one that is printed. */
  forLine: (lineCode: string | null | undefined) => RegisteredNote | null;
  /**
   * Notes the reporting engine left out of the printed document, by note id,
   * with the engine's own reason. Notes the preparer hid are not listed here.
   */
  withheld: Map<string, string>;
};

/** Read the register off a composed document. */
export function registerFromComposition(
  composition: CompositionDocument,
  withheld: Map<string, string> = new Map(),
): NoteRegister {
  const notes: RegisteredNote[] = composition.numberedNotes
    .filter((n) => n.noteNumber != null)
    .map((n) => ({
      id: n.id,
      disclosureCode: String(n.disclosureCode || '').toUpperCase(),
      noteNumber: n.noteNumber as number,
      title: n.title,
      heading: n.heading || `Note ${n.noteNumber}. ${n.title}`,
    }));
  const byId = new Map(notes.map((n) => [n.id, n]));
  const byCode = new Map<string, RegisteredNote>();
  for (const n of notes) if (n.disclosureCode && !byCode.has(n.disclosureCode)) byCode.set(n.disclosureCode, n);

  const forLine = (lineCode: string | null | undefined): RegisteredNote | null => {
    if (!lineCode) return null;
    const code = disclosureCodeForLine(lineCode, byCode.keys());
    return code ? byCode.get(code.toUpperCase()) ?? null : null;
  };

  return { notes, byId, byCode, forLine, withheld };
}

/**
 * The register of a composed reporting package, with the engine's reasons for
 * any note it left out. Shared by the workspace, which prepares the document
 * once, and by `buildNoteRegister` below.
 */
export function registerFromPackage(
  model: DocumentModel,
  pkg: Pick<ReportingPackage, 'composition' | 'disclosureDecisions'>,
): NoteRegister {
  const printed = new Set(pkg.composition.numberedNotes.map((n) => n.id));
  const withheld = new Map<string, string>();
  for (const note of model.notes) {
    if (printed.has(note.id)) continue;
    const decision = pkg.disclosureDecisions.find(
      (d) => d.disclosureCode === note.disclosure_code && (d.shouldSuppress || !d.exists),
    );
    if (decision) withheld.set(note.id, decision.reason);
  }
  return registerFromComposition(pkg.composition, withheld);
}

/**
 * Compose the document exactly as the Live Preview and the PDF do, and return
 * its register. The same inputs give the same numbers everywhere.
 */
export function buildNoteRegister(
  model: DocumentModel,
  overrides: DocOverrides,
  options?: ReportingIntelligenceOptions,
): NoteRegister {
  const resolved: DocumentModel = {
    ...model,
    notes: model.notes.map((note) => resolveNoteContent(note, overrides)),
  };
  return registerFromPackage(model, produceReportingPackage(resolved, overrides, options));
}
