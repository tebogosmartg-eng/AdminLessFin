/**
 * The credit note document, fetched in one edge call and shaped once.
 *
 * The detail page, the PDF and the print view all read this one cache entry,
 * so the credit note on screen cannot disagree with the one that is sent.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildCreditNoteDocument,
  type CreditNoteDocumentModel,
  type RawCreditNoteDocument,
} from '@/lib/creditNotes/creditNoteDocument';

export const creditNoteDocumentKey = (companyId: string | undefined, creditNoteId: string | undefined) =>
  ['credit_note_document', companyId, creditNoteId] as const;

export async function fetchCreditNoteDocument(
  companyId: string,
  creditNoteId: string,
): Promise<CreditNoteDocumentModel> {
  const { data, error } = await supabase.functions.invoke('credit-notes', {
    body: { method: 'GET_DOCUMENT', company_id: companyId, creditNoteId },
  });
  if (error) throw error;
  if (!data) throw new Error('The credit note document came back empty.');
  return buildCreditNoteDocument(data as RawCreditNoteDocument);
}

export function useCreditNoteDocument(companyId: string | undefined, creditNoteId: string | undefined) {
  return useQuery<CreditNoteDocumentModel>({
    queryKey: creditNoteDocumentKey(companyId, creditNoteId),
    enabled: !!companyId && !!creditNoteId,
    queryFn: () => fetchCreditNoteDocument(companyId!, creditNoteId!),
  });
}
