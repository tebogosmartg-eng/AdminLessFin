/**
 * One supplier credit: the document, and what can still be done with it --
 * set what is left against a bill, take a mistaken application back, or void it.
 *
 * Bills are named rather than linked: there is no bill detail page, and a link
 * that lands on a list is worse than plain text.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useVendorCreditDocument } from '../hooks/useVendorCreditDocument';
import VendorCreditDocumentView from '../components/vendorCredits/VendorCreditDocumentView';
import ApplyVendorCreditDialog from '../components/vendorCredits/ApplyVendorCreditDialog';
import VoidVendorCreditDialog from '../components/vendorCredits/VoidVendorCreditDialog';
import { downloadVendorCreditPdf, openVendorCreditPdf } from '../lib/vendorCredits/vendorCreditPdf';
import { refreshAfterVendorCreditChange } from '../lib/vendorCredits/vendorCreditQueries';
import { edgeErrorMessage } from '../lib/platform/edgeError';
import { formatCurrency } from '../lib/utils';
import { day } from '../lib/documents/paperTheme';
import { showError, showSuccess } from '../utils/toast';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { ArrowLeft, ArrowRightLeft, Ban, Download, FileText, Loader2, Printer, Undo2, X } from 'lucide-react';

const VendorCreditDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const { data: model, isLoading, isError, error } = useVendorCreditDocument(activeCompany?.id, id);
  useDocumentTitle(model ? `Supplier credit ${model.number}` : 'Supplier credit');

  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [exporting, setExporting] = useState<'download' | 'print' | null>(null);

  const unapply = useMutation({
    mutationFn: async (bill: { id: string; number: string }) => {
      const { error } = await supabase.functions.invoke('vendor-credits', {
        body: { method: 'UNAPPLY', company_id: activeCompany!.id, vendorCreditId: id, billId: bill.id },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The credit could not be taken off the bill.'));
      return bill;
    },
    onSuccess: (bill) => {
      refreshAfterVendorCreditChange(queryClient);
      showSuccess(`Credit taken off ${bill.number}. It is held on the supplier’s account again.`);
    },
    onError: (e: unknown) => showError(e instanceof Error ? e.message : 'The credit could not be taken off the bill.'),
  });

  const runExport = async (mode: 'download' | 'print') => {
    if (!model) return;
    setExporting(mode);
    try {
      if (mode === 'download') await downloadVendorCreditPdf(model);
      else await openVendorCreditPdf(model);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'The supplier credit PDF could not be produced.');
    } finally {
      setExporting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-[40rem] w-full" />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <X className="h-4 w-4" />
          <AlertTitle>This supplier credit could not be opened</AlertTitle>
          <AlertDescription>
            {isError && error instanceof Error ? error.message : 'No supplier credit was found with this link in the active company.'}
          </AlertDescription>
        </Alert>
        <Button variant="link" className="mt-2 px-0" asChild>
          <Link to="/vendor-credits">
            <ArrowLeft className="mr-1 h-4 w-4" /> All supplier credits
          </Link>
        </Button>
      </div>
    );
  }

  const canApply = !model.isVoid && model.remaining > 0;

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="print:hidden">
          <Button variant="link" className="mb-2 h-auto px-0 text-muted-foreground" asChild>
            <Link to="/vendor-credits">
              <ArrowLeft className="mr-1 h-4 w-4" /> All supplier credits
            </Link>
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Supplier credit {model.number}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant={model.isVoid ? 'destructive' : 'secondary'}>{model.statusLabel}</Badge>
                <span>{model.vendor.name}</span>
                <span aria-hidden>·</span>
                <span>{day(model.date)}</span>
                {model.originalBill && (
                  <>
                    <span aria-hidden>·</span>
                    <span>credits {model.originalBill.number}</span>
                  </>
                )}
                {model.journalNumber && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Posted as {model.journalNumber}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canApply && (
                <Button onClick={() => setIsApplyOpen(true)}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" /> Apply to bills
                </Button>
              )}
              {!model.isVoid && (
                <Button variant="outline" className="text-destructive" onClick={() => setIsVoidOpen(true)}>
                  <Ban className="mr-2 h-4 w-4" /> Void
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={exporting !== null}>
                    {exporting !== null ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…</>
                    ) : (
                      <><FileText className="mr-2 h-4 w-4" /> Supplier credit PDF</>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void runExport('download')}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void runExport('print')}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {model.isVoid && (
          <Alert variant="destructive" className="print:hidden">
            <Ban className="h-4 w-4" />
            <AlertTitle>Voided{model.voidedAt ? ` on ${day(model.voidedAt)}` : ''}</AlertTitle>
            <AlertDescription>
              {model.voidReason ? `${model.voidReason}. ` : ''}
              Its journal was reversed{model.reversalJournalNumber ? ` by ${model.reversalJournalNumber}` : ''} and it no longer
              reduces what is owed to the supplier.
            </AlertDescription>
          </Alert>
        )}

        {!model.isVoid && (
          <Card className="print:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Where this credit went</CardTitle>
              <CardDescription>
                {formatCurrency(model.applied)} of {formatCurrency(model.total)} set off against bills;{' '}
                {formatCurrency(model.remaining)} held on account.
              </CardDescription>
            </CardHeader>
            {model.applications.length > 0 && (
              <CardContent className="space-y-2">
                {model.applications.map((a) => (
                  <div key={a.billId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{a.billNumber}</span>
                      {a.billDate && <span className="ml-2 text-muted-foreground">{day(a.billDate)}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{formatCurrency(a.amount)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={unapply.isPending}
                        onClick={() => {
                          if (!window.confirm(`Take ${formatCurrency(a.amount)} of ${model.number} off ${a.billNumber}? The bill will be owed again and the credit held on account.`)) return;
                          unapply.mutate({ id: a.billId, number: a.billNumber });
                        }}
                      >
                        <Undo2 className="mr-1 h-4 w-4" /> Take off
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        <VendorCreditDocumentView model={model} />
      </div>

      {canApply && (
        <ApplyVendorCreditDialog
          isOpen={isApplyOpen}
          setIsOpen={setIsApplyOpen}
          vendorCredit={{
            id: model.vendorCreditId,
            number: model.number,
            vendorId: model.vendorId,
            vendorName: model.vendor.name,
            remaining: model.remaining,
          }}
        />
      )}
      <VoidVendorCreditDialog
        isOpen={isVoidOpen}
        setIsOpen={setIsVoidOpen}
        vendorCredit={{ id: model.vendorCreditId, number: model.number, total: model.total, applied: model.applied }}
      />
    </>
  );
};

export default VendorCreditDetail;
