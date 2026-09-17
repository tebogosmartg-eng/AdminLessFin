import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, ArrowRightLeft, ReceiptText, Download, Eye, Ban, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { showError } from '../utils/toast';
import CreditNoteForm from '../components/CreditNoteForm';
import ApplyCreditNoteDialog, { type ApplyCreditNoteTarget } from '../components/creditNotes/ApplyCreditNoteDialog';
import VoidCreditNoteDialog from '../components/creditNotes/VoidCreditNoteDialog';
import { creditNotesQuery } from '../lib/queries';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { fetchCreditNoteDocument } from '../hooks/useCreditNoteDocument';
import { downloadCreditNotePdf } from '../lib/creditNotes/creditNotePdf';
import { creditNoteStatusLabel } from '../lib/creditNotes/creditNoteDocument';

type CreditNoteRow = {
  id: string;
  credit_note_number: string;
  credit_note_date: string;
  status: string;
  reason: string | null;
  customer_id: string;
  invoice_id: string | null;
  customers?: { name?: string | null } | null;
  invoices?: { invoice_number?: string | null } | null;
  total: number;
  applied: number;
  remaining: number;
};

function statusVariant(label: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (label === 'Void') return 'destructive';
  if (label === 'Applied in full') return 'secondary';
  if (label === 'Partly applied') return 'default';
  return 'outline';
}

const CreditNotes = () => {
  useDocumentTitle('Credit Notes');
  const navigate = useNavigate();
  const { activeCompany } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<ApplyCreditNoteTarget | null>(null);
  const [voidTarget, setVoidTarget] = useState<CreditNoteRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    ...creditNotesQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });
  const creditNotes = useMemo(() => (data ?? []) as CreditNoteRow[], [data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return creditNotes;
    return creditNotes.filter((cn) =>
      [cn.credit_note_number, cn.customers?.name, cn.invoices?.invoice_number, cn.reason]
        .some((v) => (v ?? '').toLowerCase().includes(term)),
    );
  }, [creditNotes, search]);

  const onAccount = creditNotes
    .filter((cn) => cn.status !== 'void')
    .reduce((t, cn) => t + (cn.remaining > 0 ? cn.remaining : 0), 0);

  const downloadPdf = async (cn: CreditNoteRow) => {
    if (!activeCompany) return;
    setDownloadingId(cn.id);
    try {
      const model = await fetchCreditNoteDocument(activeCompany.id, cn.id);
      await downloadCreditNotePdf(model);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The credit note PDF could not be produced.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Credit Notes</CardTitle>
              <CardDescription>
                Credits issued to customers for returns, overcharges and agreed discounts.
                {onAccount > 0 && ` ${formatCurrency(onAccount)} is held on customer accounts, not yet applied.`}
              </CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Credit Note
            </Button>
          </div>
          {creditNotes.length > 0 && (
            <div className="relative mt-3 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search number, customer, invoice or reason"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Credits invoice</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">On account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : visible.length > 0 ? (
                visible.map((cn) => {
                  const label = creditNoteStatusLabel(cn.status, cn.applied, cn.remaining);
                  const isVoid = cn.status === 'void';
                  return (
                    <TableRow
                      key={cn.id}
                      className={`cursor-pointer ${isVoid ? 'text-muted-foreground' : ''}`}
                      onClick={() => navigate(`/credit-notes/${cn.id}`)}
                    >
                      <TableCell className="font-medium">{cn.credit_note_number}</TableCell>
                      <TableCell>{cn.customers?.name ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(cn.credit_note_date + 'T00:00:00'), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>{cn.invoices?.invoice_number ?? '-'}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={cn.reason ?? ''}>{cn.reason ?? '-'}</TableCell>
                      <TableCell className={`text-right tabular-nums ${isVoid ? 'line-through' : ''}`}>
                        {formatCurrency(cn.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(cn.remaining)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(label)}>{label}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Actions for ${cn.credit_note_number}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => navigate(`/credit-notes/${cn.id}`)}>
                              <Eye className="mr-2 h-4 w-4" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={downloadingId === cn.id} onSelect={() => void downloadPdf(cn)}>
                              <Download className="mr-2 h-4 w-4" />
                              {downloadingId === cn.id ? 'Preparing…' : 'Download PDF'}
                            </DropdownMenuItem>
                            {!isVoid && cn.remaining > 0 && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setApplyTarget({
                                    id: cn.id,
                                    number: cn.credit_note_number,
                                    customerId: cn.customer_id,
                                    customerName: cn.customers?.name ?? 'the customer',
                                    remaining: cn.remaining,
                                  })
                                }
                              >
                                <ArrowRightLeft className="mr-2 h-4 w-4" /> Apply to invoices
                              </DropdownMenuItem>
                            )}
                            {!isVoid && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onSelect={() => setVoidTarget(cn)}>
                                  <Ban className="mr-2 h-4 w-4" /> Void
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : creditNotes.length > 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No credit notes match “{search}”.
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState
                      icon={ReceiptText}
                      title="No credit notes yet"
                      description="Issue a credit note when a customer returns goods, was overcharged, or is given an agreed discount."
                      action={
                        <Button onClick={() => setIsFormOpen(true)}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          New Credit Note
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CreditNoteForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
      {applyTarget && (
        <ApplyCreditNoteDialog
          isOpen={!!applyTarget}
          setIsOpen={(open) => { if (!open) setApplyTarget(null); }}
          creditNote={applyTarget}
        />
      )}
      {voidTarget && (
        <VoidCreditNoteDialog
          isOpen={!!voidTarget}
          setIsOpen={(open) => { if (!open) setVoidTarget(null); }}
          creditNote={{
            id: voidTarget.id,
            number: voidTarget.credit_note_number,
            total: voidTarget.total,
            applied: voidTarget.applied,
          }}
        />
      )}
    </>
  );
};

export default CreditNotes;
