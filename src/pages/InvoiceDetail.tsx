import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';
import { Printer, Send, HandCoins, Ban, MessageSquare, Download, Loader2, FileText, ReceiptText, Users, ChevronDown } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { showError, showSuccess } from '../utils/toast';
import InvoicePaymentForm from '../components/InvoicePaymentForm';
import CreditNoteForm from '../components/CreditNoteForm';
import { useAuth } from '../contexts/AuthContext';
import SendInvoiceDialog from '../components/SendInvoiceDialog';
import JournalEntryDetail from '../components/JournalEntryDetail';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import BusinessLifecycleStepper from '../components/BusinessLifecycleStepper';
import LifecycleNextAction from '../components/LifecycleNextAction';
import LifecycleContextBadge from '../components/boe/LifecycleContextBadge';
import { buildChatUrl } from '../lib/boe/contextualChat';
import { edgeErrorMessage } from '../lib/platform/edgeError';
import {
  resolveInvoiceLifecycleStage,
  invoiceNextAction,
  invoiceReceivableStatusLabel,
  INVOICE_RECEIVABLE_STAGE_IDS,
} from '../lib/revenueWorkflow';
import { statusBadgeVariant } from '../lib/utils';
import { invoiceJournalItems } from '../lib/invoiceJournal';
import InvoiceDocumentView from '../components/invoices/InvoiceDocumentView';
import { useInvoiceDocument } from '../hooks/useInvoiceDocument';
import { downloadInvoicePdf, openInvoicePdf } from '../lib/invoices/invoicePdf';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

type InvoiceDetailData = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void';
  customers: {
    id?: string;
    name: string;
    address: string | null;
    email: string | null;
  } | null;
  journal_entries: {
    journal_entry_items: {
      id: string;
      amount: number;
      type: 'debit' | 'credit';
      chart_of_accounts: {
        name: string;
      } | null;
      journal_entry_item_tax_rates: {
        tax_rates: {
          rate: number;
        } | null;
      }[];
    }[];
  }[] | null;
};

const InvoiceDetail = () => {
  const { id } = useParams();
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isCreditNoteOpen, setIsCreditNoteOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const fetchInvoiceDetail = async () => {
    if (!activeCompany) return null;
    const { data, error } = await supabase.functions.invoke('invoices', {
      body: {
        method: 'GET_ONE',
        company_id: activeCompany.id,
        invoiceId: id,
      },
    });
    if (error) throw new Error(error.message);
    return data as InvoiceDetailData;
  };

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice_detail', id],
    queryFn: fetchInvoiceDetail,
    enabled: !!id && !!activeCompany,
  });

  const { data: relatedEntries, isLoading: isLoadingRelatedEntries } = useQuery({
    queryKey: ['related_journal_entries', id, activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany || !id) return [];
      const { data, error } = await supabase.functions.invoke('journal-entries', {
        body: {
          method: 'GET_RELATED_TO_INVOICE',
          company_id: activeCompany.id,
          invoiceId: id,
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!activeCompany,
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('invoices', {
        body: {
          method: 'VOID',
          company_id: activeCompany.id,
          invoiceId: id,
        },
      });
      // Voiding is refused for good reasons now -- the invoice has a receipt or
      // a credit note against it, or it is already void. supabase-js collapses
      // every non-2xx into "returned a non-2xx status code", so without this the
      // user is told nothing at all.
      if (error) throw new Error(await edgeErrorMessage(error, 'The invoice could not be voided.'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice_detail', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      // Voiding changes what the document says and stamps it VOID.
      queryClient.invalidateQueries({ queryKey: ['invoice_document'] });
      showSuccess('Invoice voided successfully.');
    },
    onError: (error: any) => showError(error.message),
  });

  const { data: invoiceDocument, isLoading: isLoadingInvoiceDocument, isError: invoiceDocumentFailed } =
    useInvoiceDocument(activeCompany?.id, id);

  const [exporting, setExporting] = useState<'download' | 'print' | null>(null);

  /**
   * Both export routes render the same PDF. Printing opens it in the browser's
   * own viewer rather than printing the page, because the page carries the
   * app's chrome and the customer's copy must not.
   */
  const runExport = async (mode: 'download' | 'print') => {
    if (!invoiceDocument) return;
    setExporting(mode);
    try {
      if (mode === 'download') await downloadInvoicePdf(invoiceDocument);
      else await openInvoicePdf(invoiceDocument);
    } catch (error: any) {
      showError(error?.message || 'The invoice PDF could not be produced.');
    } finally {
      setExporting(null);
    }
  };

  // The totals below drive the payment dialog, not the document. The document's
  // own total comes from the receivable per the ledger, which is the figure the
  // allocation engine settles against.
  const jeItems = invoiceJournalItems<any>(invoice?.journal_entries);
  const totalAmount = invoiceDocument?.total
    ?? jeItems.filter(item => item.type === 'debit').reduce((sum, item) => sum + item.amount, 0);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!invoice) {
    return <div>Invoice not found.</div>;
  }

  const lifecycleStage = resolveInvoiceLifecycleStage(invoice);
  const nextAction = invoiceNextAction(invoice);
  const statusLabel = invoiceReceivableStatusLabel(invoice);

  return (
    <>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 bg-background print:max-w-none print:p-8 print:mx-0 print:bg-white">
        {invoice.status !== 'void' && (
          <div className="mb-6 print:hidden space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LifecycleContextBadge lifecycleId="revenue" stageId={lifecycleStage} />
              <Button variant="ghost" size="sm" asChild>
                <Link to={buildChatUrl({ type: 'invoice', id: invoice.id, label: invoice.invoice_number })}>
                  <MessageSquare className="mr-1 h-3.5 w-3.5" /> Discuss
                </Link>
              </Button>
            </div>
            <BusinessLifecycleStepper
              lifecycleId="revenue"
              currentStageId={lifecycleStage}
              visibleStageIds={INVOICE_RECEIVABLE_STAGE_IDS}
              compact
            />
            {nextAction && (
              <LifecycleNextAction
                label={nextAction.label}
                description={nextAction.description}
                route={nextAction.route}
                onAction={
                  nextAction.action === 'send'
                    ? () => setIsSendDialogOpen(true)
                    : nextAction.action === 'payment'
                      ? () => setIsPaymentFormOpen(true)
                      : undefined
                }
              />
            )}
          </div>
        )}
        {invoice.status === 'void' && (
          <Alert variant="destructive" className="mb-6 print:hidden">
            <Ban className="h-4 w-4" />
            <AlertTitle>Voided</AlertTitle>
            <AlertDescription>
              This invoice has been voided. All associated financial transactions have been reversed.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-between items-start mb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-bold">Invoice {invoice.invoice_number}</h1>
            <Badge
              className="mt-2"
              variant={statusBadgeVariant(statusLabel.toLowerCase().includes('overdue') ? 'overdue' : invoice.status)}
            >
              {statusLabel}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {invoice.status === 'draft' && (
              <Button onClick={() => setIsSendDialogOpen(true)}>
                <Send className="mr-2 h-4 w-4" /> Send Invoice
              </Button>
            )}
            {(invoice.status === 'sent' || invoice.status === 'partially_paid') && (
              <Button onClick={() => setIsPaymentFormOpen(true)}>
                <HandCoins className="mr-2 h-4 w-4" />
                {invoice.status === 'partially_paid' ? 'Receive Balance' : 'Receive Payment'}
              </Button>
            )}
            {invoice.status === 'sent' && (
              <Button variant="destructive" onClick={() => voidMutation.mutate()} disabled={voidMutation.isPending}>
                <Ban className="mr-2 h-4 w-4" /> Void
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  {exporting !== null ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…</>
                  ) : (
                    <><FileText className="mr-2 h-4 w-4" /> Documents</>
                  )}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Invoice PDF</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={!invoiceDocument || exporting !== null}
                  onSelect={() => void runExport('download')}
                >
                  <Download className="mr-2 h-4 w-4" /> Download
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!invoiceDocument || exporting !== null}
                  onSelect={() => void runExport('print')}
                >
                  <Printer className="mr-2 h-4 w-4" /> Print
                </DropdownMenuItem>
                {(invoice.status === 'sent' || invoice.status === 'partially_paid' || invoice.status === 'paid') && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setIsCreditNoteOpen(true)}>
                      <ReceiptText className="mr-2 h-4 w-4" /> Issue Credit Note
                    </DropdownMenuItem>
                  </>
                )}
                {invoice.customers?.id && invoice.status !== 'draft' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to={`/customers/${invoice.customers.id}`}>
                        <Users className="mr-2 h-4 w-4" /> View Customer Statement
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {isLoadingInvoiceDocument ? (
          <Skeleton className="h-[40rem] w-full" />
        ) : invoiceDocument ? (
          <InvoiceDocumentView model={invoiceDocument} />
        ) : (
          <Alert variant="destructive" className="print:hidden">
            <Ban className="h-4 w-4" />
            <AlertTitle>The invoice document could not be assembled</AlertTitle>
            <AlertDescription>
              {invoiceDocumentFailed
                ? "Reload the page to try again. If it keeps failing, the invoice may be missing its journal entry."
                : "No document was returned for this invoice."}
            </AlertDescription>
          </Alert>
        )}

        <Card className="mt-6 print:hidden">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>All journal entries related to this invoice.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRelatedEntries ? (
              <Skeleton className="h-24 w-full" />
            ) : relatedEntries && relatedEntries.length > 0 ? (
              <ul className="space-y-2">
                {relatedEntries.map((entry: any) => (
                  <li key={entry.id} className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(entry.entry_date).toLocaleDateString()}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedEntryId(entry.id)}>
                      View Details
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No related transactions found.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <SendInvoiceDialog
        isOpen={isSendDialogOpen}
        setIsOpen={setIsSendDialogOpen}
        invoice={{
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_email: invoice.customers?.email || null,
        }}
      />
      <InvoicePaymentForm 
        isOpen={isPaymentFormOpen}
        setIsOpen={setIsPaymentFormOpen}
        invoice={{
          id: invoice.id,
          totalAmount: totalAmount,
          customerName: invoice.customers?.name || 'Customer'
        }}
      />
      <CreditNoteForm
        isOpen={isCreditNoteOpen}
        setIsOpen={setIsCreditNoteOpen}
        initialCustomerId={invoice.customers?.id}
        initialInvoiceId={invoice.id}
      />
      <JournalEntryDetail
        isOpen={!!selectedEntryId}
        setIsOpen={() => setSelectedEntryId(null)}
        entryId={selectedEntryId}
      />
    </>
  );
};

export default InvoiceDetail;