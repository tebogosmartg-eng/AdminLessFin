/**
 * Canonical document publication (V11.7 / Critical Gap 1).
 *
 * Single entry point: DocumentModel + presentation overrides → Preview / PDF / DOCX
 * that share one prepared view. Edge publication APIs remain unchanged for archive;
 * accountant-facing published PDF/DOCX are produced here so
 * "what I see is what is published."
 */
import type { DocumentModel } from '../document/documentModel';
import type { DocOverrides } from '../document/documentStore';
import {
  prepareCanonicalDocumentView,
  type CanonicalDocumentView,
} from './canonicalDocumentView';
import { renderCanonicalPdf, workspacePdfToBytes } from './afsWorkspacePdf';
import { renderCanonicalDocx } from './afsWorkspaceDocx';
import { mimeForFormat } from './canonical';
import type { ReportingIntelligenceOptions } from '../reportingIntelligence/orchestrator';

export type CanonicalPublishPackage = {
  view: CanonicalDocumentView;
  pdfString: string;
  pdfBytes: Uint8Array<ArrayBuffer>;
  docxBytes: Uint8Array<ArrayBuffer>;
  structureFingerprint: string;
};

/** Build the complete publish package from the workspace document model. */
export function buildCanonicalPublishPackage(
  model: DocumentModel,
  overrides: DocOverrides,
  options?: ReportingIntelligenceOptions,
): CanonicalPublishPackage {
  const view = prepareCanonicalDocumentView(model, overrides, options);
  const pdfString = renderCanonicalPdf(view);
  const pdfBytes = workspacePdfToBytes(pdfString);
  const docxBytes = renderCanonicalDocx(view);
  return {
    view,
    pdfString,
    pdfBytes,
    docxBytes,
    structureFingerprint: view.structureFingerprint,
  };
}

export function downloadBytes(
  bytes: Uint8Array<ArrayBuffer>,
  format: 'pdf' | 'docx',
  filenameBase: string,
): void {
  const blob = new Blob([bytes], { type: mimeForFormat(format) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Extract plain text from DOCX bytes for structure identity tests. */
export function extractDocxPlainText(docxBytes: Uint8Array): string {
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(docxBytes);
  const matches = [...raw.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)];
  return matches
    .map((m) =>
      m[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"'),
    )
    .join('\n');
}
