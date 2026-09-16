/**
 * The printable quotation, fetched in one edge call and shaped once.
 *
 * Every consumer -- the detail page, the PDF, the print view -- reads the same
 * model from the same cache entry, so there is no way for the quotation on
 * screen to disagree with the one that gets sent. That disagreement is exactly
 * what the VAT defect was.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { todayIso } from '@/lib/documents/paperTheme';
import {
  buildQuoteDocument,
  type QuoteDocumentModel,
  type RawQuoteDocument,
} from '@/lib/quotes/quoteDocument';

export const quoteDocumentKey = (companyId: string | undefined, quoteId: string | undefined) =>
  ['quote_document', companyId, quoteId] as const;

export async function fetchQuoteDocument(
  companyId: string,
  quoteId: string,
): Promise<QuoteDocumentModel> {
  const { data, error } = await supabase.functions.invoke('quotes', {
    body: { method: 'GET_DOCUMENT', company_id: companyId, quoteId },
  });
  if (error) throw error;
  if (!data) throw new Error('The quotation document came back empty.');
  return buildQuoteDocument(data as RawQuoteDocument, { today: todayIso() });
}

export function useQuoteDocument(companyId: string | undefined, quoteId: string | undefined) {
  return useQuery<QuoteDocumentModel>({
    queryKey: quoteDocumentKey(companyId, quoteId),
    enabled: !!companyId && !!quoteId,
    queryFn: () => fetchQuoteDocument(companyId!, quoteId!),
  });
}
