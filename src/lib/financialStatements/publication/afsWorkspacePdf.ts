/**
 * AFS Document Workspace — live PDF builder (V13.0 Professional Renderer).
 *
 * Consumes prepareCanonicalDocumentView — the SAME preparation used by Published
 * PDF and Published DOCX — and delegates rendering to the Professional Statutory
 * Renderer. Preview and download are byte-identical because both call
 * renderCanonicalPdf on the same view.
 *
 * Does NOT modify the canonical document model, framework content, trial balance
 * or accounting calculations. Presentation layer only.
 */
import type { DocumentModel } from '../document/documentModel';
import type { DocOverrides } from '../document/documentStore';
import { prepareCanonicalDocumentView, type CanonicalDocumentView } from './canonicalDocumentView';
import { renderStatutoryPdf } from './render/statutoryPdf';
import type { ReportingIntelligenceOptions } from '../reportingIntelligence/orchestrator';

/**
 * Render PDF from an already-prepared canonical view (no re-interpretation).
 * Single render path shared by Preview, Workspace PDF and Published PDF.
 */
export function renderCanonicalPdf(view: CanonicalDocumentView): string {
  return renderStatutoryPdf(view);
}

/** Generate the workspace / published AFS PDF from the canonical document model. */
export function generateWorkspaceAfsPdf(
  model: DocumentModel,
  overrides: DocOverrides,
  options?: ReportingIntelligenceOptions,
): string {
  return renderCanonicalPdf(prepareCanonicalDocumentView(model, overrides, options));
}

export function workspacePdfToBytes(pdf: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
