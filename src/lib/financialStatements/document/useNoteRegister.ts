import { useMemo } from 'react';
import { useEnterpriseMateriality } from '../../../hooks/useEnterpriseMateriality';
import type { DocumentModel } from './documentModel';
import type { DocOverrides } from './documentStore';
import { registerFromPackage, type NoteRegister } from './noteRegister';
import {
  prepareCanonicalDocumentView,
  type CanonicalDocumentView,
} from '../publication/canonicalDocumentView';

export type PreparedDocument = { view: CanonicalDocumentView; register: NoteRegister };

/**
 * The document as it will print, prepared once for the whole workspace.
 *
 * The navigator's note numbers, the Editor's statement references, the list of
 * which table lines print and the Live Preview all read this one preparation —
 * the same model, the same presentation choices and the same materiality
 * setting — so none of them can describe a different document from the PDF.
 */
export function usePreparedDocument(
  model: DocumentModel | null | undefined,
  overrides: DocOverrides,
): PreparedDocument | null {
  const { options } = useEnterpriseMateriality(model?.companyId);
  return useMemo(() => {
    if (!model) return null;
    try {
      const view = prepareCanonicalDocumentView(model, overrides, options);
      return { view, register: registerFromPackage(model, view.reportingPackage) };
    } catch (e) {
      if (import.meta.env.DEV) console.error('[efs] the document could not be prepared', e);
      return null;
    }
  }, [model, overrides, options]);
}
