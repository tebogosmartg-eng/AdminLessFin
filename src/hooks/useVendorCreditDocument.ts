/**
 * The supplier credit document, fetched in one edge call and shaped once.
 *
 * The detail page, the PDF and the print view all read this one cache entry,
 * so the credit on screen cannot disagree with the one that is printed.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildVendorCreditDocument,
  type VendorCreditDocumentModel,
  type RawVendorCreditDocument,
} from '@/lib/vendorCredits/vendorCreditDocument';

export const vendorCreditDocumentKey = (companyId: string | undefined, vendorCreditId: string | undefined) =>
  ['vendor_credit_document', companyId, vendorCreditId] as const;

export async function fetchVendorCreditDocument(
  companyId: string,
  vendorCreditId: string,
): Promise<VendorCreditDocumentModel> {
  const { data, error } = await supabase.functions.invoke('vendor-credits', {
    body: { method: 'GET_DOCUMENT', company_id: companyId, vendorCreditId },
  });
  if (error) throw error;
  if (!data) throw new Error('The supplier credit document came back empty.');
  return buildVendorCreditDocument(data as RawVendorCreditDocument);
}

export function useVendorCreditDocument(companyId: string | undefined, vendorCreditId: string | undefined) {
  return useQuery<VendorCreditDocumentModel>({
    queryKey: vendorCreditDocumentKey(companyId, vendorCreditId),
    enabled: !!companyId && !!vendorCreditId,
    queryFn: () => fetchVendorCreditDocument(companyId!, vendorCreditId!),
  });
}
