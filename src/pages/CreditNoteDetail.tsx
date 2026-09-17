/**
 * One credit note: the document the customer receives, and what can still be
 * done with it -- apply what is left, take a mistaken application back, or
 * void it.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCreditNoteDocument } from '../hooks/useCreditNoteDocument';
import CreditNoteDocumentView from '../components/creditNotes/CreditNoteDocumentView';
import ApplyCreditNoteDialog from '../components/creditNotes/ApplyCreditNoteDialog';
import VoidCreditNoteDialog from '../components/creditNotes/VoidCreditNoteDialog';
import { downloadCreditNotePdf, openCreditNotePdf } from '../lib/creditNotes/creditNotePdf';
import { refreshAfterCreditNoteChange } from '../lib/creditNotes/creditNoteQueries';
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

const CreditNoteDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const { data: model, isLoading, isError, error } = useCreditNoteDocument(activeCompany?.id, id);
  useDocumentTitle(model ? `Credit note ${model.number}` : 'Credit note');

  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [exporting, setExporting] = useState<'download' | 'print' | null>(null);

  const unapply = useMutation({
    mutationFn: async (invoice: { id: string; number: string }) => {
      const { error } = await supabase.functions.invoke('credit-notes', {
        body: { method: 'UNAPPLY', company_id: activeCompany!.id, creditNoteId: id, invoiceId: invoice.id },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The credit could not be taken off the invoice.'));
      return invoice;
    },
    onSuccess: (invoice) => {
      refreshAfterCreditNoteChange(queryClient);
      showSuccess(`Credit taken off ${invoice.number}. It is held on the customer’s account again.`);
    },
    onError: (e: unknown) => showError(e instanceof Error ? e.message : 'The credit could not be taken off the invoice.'),
  });

  const runExport = async (mode: 'download' | 'print') => {
    if (!model) return;
    setExporting(mode);
    try {
      if (mode === 'download') await downloadCreditNotePdf(model);
      else await openCreditNotePdf(model);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'The credit note PDF could not be produced.');
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
          <AlertTitle>This credit note could not be opened</AlertTitle>
          <AlertDescription>
            {isError && error instanceof Error ? error.message : 'No credit note was found with this link in the active company.'}
          </AlertDescription>
        </Alert>
        <Button variant="link" className="mt-2 px-0" asChild>
          <Link to="/credit-notes">
            <ArrowLeft className="mr-1 h-4 w-4" /> All credit notes
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
            <Link to="/credit-notes">
              <ArrowLeft className="mr-1 h-4 w-4" /> All credit notes
            </Link>
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Credit note {model.number}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant={model.isVoid ? 'destructive' : 'secondary'}>{model.statusLabel}</Badge>
                <span>{model.customer.name}</span>
                <span aria-hidden>·</span>
                <span>{day(model.date)}</span>
                {model.originalInvoice && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      credits{' '}
                      <Link className="font-medium text-primary underline-offset-4 hover:underline" to={`/invoices/${model.originalInvoice.id}`}>
                        {model.originalInvoice.number}
                      </Link>
                    </span>
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
                  <ArrowRightLeft className="mr-2 h-4 w-4" /> Apply to invoices
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
                      <><FileText className="mr-2 h-4 w-4" /> Credit note PDF</>
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
              reduces the customer&rsquo;s balance.
            </AlertDescription>
          </Alert>
        )}

        {!model.isVoid && (
          <Card className="print:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Where this credit went</CardTitle>
              <CardDescription>
                {formatCurrency(model.applied)} of {formatCurrency(model.total)} applied to invoices;{' '}
                {formatCurrency(model.remaining)} held on account.
              </CardDescription>
            </CardHeader>
            {model.applications.length > 0 && (
              <CardContent className="space-y-2">
                {model.applications.map((a) => (
                  <div key={a.invoiceId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <div>
                      <Link className="font-medium text-primary underline-offset-4 hover:underline" to={`/invoices/${a.invoiceId}`}>
                        {a.invoiceNumber}
                      </Link>
                      {a.invoiceDate && <span className="ml-2 text-muted-foreground">{day(a.invoiceDate)}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{formatCurrency(a.amount)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={unapply.isPending}
                        onClick={() => {
                          if (!window.confirm(`Take ${formatCurrency(a.amount)} of ${model.number} off ${a.invoiceNumber}? The invoice will be owed again and the credit held on account.`)) return;
                          unapply.mutate({ id: a.invoiceId, number: a.invoiceNumber });
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

        <CreditNoteDocumentView model={model} />
      </div>

      {canApply && (
        <ApplyCreditNoteDialog
          isOpen={isApplyOpen}
          setIsOpen={setIsApplyOpen}
          creditNote={{
            id: model.creditNoteId,
            number: model.number,
            customerId: model.customerId,
            customerName: model.customer.name,
            remaining: model.remaining,
          }}
        />
      )}
      <VoidCreditNoteDialog
        isOpen={isVoidOpen}
        setIsOpen={setIsVoidOpen}
        creditNote={{ id: model.creditNoteId, number: model.number, total: model.total, applied: model.applied }}
      />
    </>
  );
};

export default CreditNoteDetail;
