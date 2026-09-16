/**
 * The printable invoice, fetched in one edge call and shaped once.
 *
 * Every consumer -- the detail page, the PDF, the print view -- reads the same
 * model from the same cache entry, so there is no way for the document on
 * screen to disagree with the document that gets sent.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildInvoiceDocument,
  type InvoiceDocumentModel,
  type RawInvoiceDocument,
} from '@/lib/invoices/invoiceDocument';

export const invoiceDocumentKey = (companyId: string | undefined, invoiceId: string | undefined) =>
  ['invoice_document', companyId, invoiceId] as const;

export function useInvoiceDocument(companyId: string | undefined, invoiceId: string | undefined) {
  return useQuery<InvoiceDocumentModel>({
    queryKey: invoiceDocumentKey(companyId, invoiceId),
    enabled: !!companyId && !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('invoices', {
        body: { method: 'GET_DOCUMENT', company_id: companyId, invoiceId },
      });
      if (error) throw error;
      if (!data) throw new Error('The invoice document came back empty.');
      return buildInvoiceDocument(data as RawInvoiceDocument);
    },
  });
}
