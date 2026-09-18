import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Printer, Send, Check, X, FileSignature, Download, Loader2, FileText } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { showError, showSuccess } from '../utils/toast';
import { useAuth } from '../contexts/AuthContext';
import CreateInvoiceFromQuoteDialog from '../components/CreateInvoiceFromQuoteDialog';
import SendQuoteDialog from '../components/SendQuoteDialog';
import BusinessLifecycleStepper from '../components/BusinessLifecycleStepper';
import LifecycleNextAction from '../components/LifecycleNextAction';
import LifecycleContextBadge from '../components/boe/LifecycleContextBadge';
import { buildChatUrl } from '../lib/boe/contextualChat';
import { resolveQuoteLifecycleStage, quoteNextAction } from '../lib/revenueWorkflow';
import QuoteDocumentView from '../components/quotes/QuoteDocumentView';
import { useQuoteDocument } from '../hooks/useQuoteDocument';
import { downloadQuotePdf, openQuotePdf } from '../lib/quotes/quotePdf';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const QuoteDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote_detail', id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('quotes', {
        body: { method: 'GET_ONE', company_id: activeCompany.id, quoteId: id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!activeCompany,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('quotes', {
        body: { method: 'PUT', company_id: activeCompany.id, quoteId: id, quoteData: { status } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote_detail', id] });
      queryClient.invalidateQueries({ queryKey: ['quotes', activeCompany?.id] });
      // Accepting or declining changes what the document says and stamps it.
      queryClient.invalidateQueries({ queryKey: ['quote_document'] });
      showSuccess('Quote status updated.');
    },
    onError: (error: any) => showError(error.message),
  });

  const { data: quoteDocument, isLoading: isLoadingQuoteDocument, isError: quoteDocumentFailed } =
    useQuoteDocument(activeCompany?.id, id);

  const [exporting, setExporting] = useState<'download' | 'print' | null>(null);

  /**
   * Both export routes render the same PDF. Printing opens it in the browser's
   * own viewer rather than printing the page, because the page carries the
   * app's chrome and the customer's copy must not.
   */
  const runExport = async (mode: 'download' | 'print') => {
    if (!quoteDocument) return;
    setExporting(mode);
    try {
      if (mode === 'download') await downloadQuotePdf(quoteDocument);
      else await openQuotePdf(quoteDocument);
    } catch (error: any) {
      showError(error?.message || 'The quotation PDF could not be produced.');
    } finally {
      setExporting(null);
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!quote) {
    return <div>Quote not found.</div>;
  }

  const lifecycleStage = resolveQuoteLifecycleStage(quote);
  const nextAction = quoteNextAction(quote);

  return (
    <>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-background print:max-w-none print:p-8 print:mx-0 print:bg-white">
        <div className="mb-6 print:hidden space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LifecycleContextBadge lifecycleId="revenue" stageId={lifecycleStage} />
            <Button variant="ghost" size="sm" asChild>
              <Link to={buildChatUrl({ type: 'quote', id: quote.id, label: quote.quote_number })}>
                Discuss
              </Link>
            </Button>
          </div>
          <BusinessLifecycleStepper lifecycleId="revenue" currentStageId={lifecycleStage} compact />
          {nextAction && (
            <LifecycleNextAction
              label={nextAction.label}
              description={nextAction.description}
              onAction={
                nextAction.action === 'send'
                  ? () => setIsSendDialogOpen(true)
                  : nextAction.action === 'invoice'
                    ? () => setIsCreateInvoiceOpen(true)
                    : undefined
              }
            />
          )}
        </div>
        <div className="flex justify-between items-start mb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-bold">Quote {quote.quote_number}</h1>
            <Badge className="mt-2 capitalize">{quote.status}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {(quote.status === 'draft' || quote.status === 'sent') && (
              <Button onClick={() => setIsSendDialogOpen(true)}>
                <Send className="mr-2 h-4 w-4" /> Send Quote
              </Button>
            )}
            {quote.status === 'draft' && (
              <Button
                variant="outline"
                onClick={() => updateStatusMutation.mutate('sent')}
                disabled={updateStatusMutation.isPending}
              >
                Mark as Sent
              </Button>
            )}
            {(quote.status === 'draft' || quote.status === 'sent') && (
              <>
                <Button
                  onClick={() => updateStatusMutation.mutate('accepted')}
                  disabled={updateStatusMutation.isPending}
                >
                  <Check className="mr-2 h-4 w-4" /> Mark as Accepted
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => updateStatusMutation.mutate('declined')}
                  disabled={updateStatusMutation.isPending}
                >
                  <X className="mr-2 h-4 w-4" /> Mark as Declined
                </Button>
              </>
            )}
            {quote.status === 'accepted' && (
              <Button onClick={() => setIsCreateInvoiceOpen(true)}>
                <FileSignature className="mr-2 h-4 w-4" /> Create Invoice
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!quoteDocument || exporting !== null}>
                  {exporting !== null ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…</>
                  ) : (
                    <><FileText className="mr-2 h-4 w-4" /> Quotation PDF</>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => runExport('download')}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => runExport('print')}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {isLoadingQuoteDocument ? (
          <Skeleton className="h-[40rem] w-full" />
        ) : quoteDocument ? (
          <QuoteDocumentView model={quoteDocument} />
        ) : (
          <Alert variant="destructive" className="print:hidden">
            <X className="h-4 w-4" />
            <AlertTitle>The quotation document could not be assembled</AlertTitle>
            <AlertDescription>
              {quoteDocumentFailed
                ? 'Reload the page to try again.'
                : 'No document was returned for this quotation.'}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <CreateInvoiceFromQuoteDialog
        isOpen={isCreateInvoiceOpen}
        setIsOpen={setIsCreateInvoiceOpen}
        quote={quote}
      />
      <SendQuoteDialog
        isOpen={isSendDialogOpen}
        setIsOpen={setIsSendDialogOpen}
        quote={{
          id: quote.id,
          quote_number: quote.quote_number,
          customer_email: quote.customers?.email || null,
        }}
      />
    </>
  );
};

export default QuoteDetail;