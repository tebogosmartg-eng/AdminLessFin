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
import { safeFormatDate } from '../lib/dates';
import { showError } from '../utils/toast';
import VendorCreditForm from '../components/VendorCreditForm';
import ApplyVendorCreditDialog, { type ApplyVendorCreditTarget } from '../components/vendorCredits/ApplyVendorCreditDialog';
import VoidVendorCreditDialog from '../components/vendorCredits/VoidVendorCreditDialog';
import { vendorCreditsQuery } from '../lib/queries';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { fetchVendorCreditDocument } from '../hooks/useVendorCreditDocument';
import { downloadVendorCreditPdf } from '../lib/vendorCredits/vendorCreditPdf';
import { vendorCreditStatusLabel } from '../lib/vendorCredits/vendorCreditDocument';

type VendorCreditRow = {
  id: string;
  credit_number: string;
  credit_date: string;
  status: string;
  reason: string | null;
  vendor_id: string;
  bill_id: string | null;
  vendors?: { name?: string | null } | null;
  bills?: { bill_number?: string | null } | null;
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

const VendorCredits = () => {
  useDocumentTitle('Supplier Credits');
  const navigate = useNavigate();
  const { activeCompany } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<ApplyVendorCreditTarget | null>(null);
  const [voidTarget, setVoidTarget] = useState<VendorCreditRow | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    ...vendorCreditsQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany,
  });
  const vendorCredits = useMemo(() => (data ?? []) as VendorCreditRow[], [data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vendorCredits;
    return vendorCredits.filter((vc) =>
      [vc.credit_number, vc.vendors?.name, vc.bills?.bill_number, vc.reason]
        .some((v) => (v ?? '').toLowerCase().includes(term)),
    );
  }, [vendorCredits, search]);

  const onAccount = vendorCredits
    .filter((vc) => vc.status !== 'void')
    .reduce((t, vc) => t + (vc.remaining > 0 ? vc.remaining : 0), 0);

  const downloadPdf = async (vc: VendorCreditRow) => {
    if (!activeCompany) return;
    setDownloadingId(vc.id);
    try {
      const model = await fetchVendorCreditDocument(activeCompany.id, vc.id);
      await downloadVendorCreditPdf(model);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'The supplier credit PDF could not be produced.');
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
              <CardTitle>Supplier Credits</CardTitle>
              <CardDescription>
                Credits received from suppliers for returns, overcharges and agreed discounts.
                {onAccount > 0 && ` ${formatCurrency(onAccount)} is held on supplier accounts, not yet applied.`}
              </CardDescription>
            </div>
            <Button onClick={() => setIsFormOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Supplier Credit
            </Button>
          </div>
          {vendorCredits.length > 0 && (
            <div className="relative mt-3 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search number, supplier, bill or reason"
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
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Credits bill</TableHead>
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
                visible.map((vc) => {
                  const label = vendorCreditStatusLabel(vc.status, vc.applied, vc.remaining);
                  const isVoid = vc.status === 'void';
                  return (
                    <TableRow
                      key={vc.id}
                      className={`cursor-pointer ${isVoid ? 'text-muted-foreground' : ''}`}
                      onClick={() => navigate(`/vendor-credits/${vc.id}`)}
                    >
                      <TableCell className="font-medium">{vc.credit_number}</TableCell>
                      <TableCell>{vc.vendors?.name ?? '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {safeFormatDate(vc.credit_date, 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>{vc.bills?.bill_number ?? '-'}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={vc.reason ?? ''}>{vc.reason ?? '-'}</TableCell>
                      <TableCell className={`text-right tabular-nums ${isVoid ? 'line-through' : ''}`}>
                        {formatCurrency(vc.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(vc.remaining)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(label)}>{label}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Actions for ${vc.credit_number}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => navigate(`/vendor-credits/${vc.id}`)}>
                              <Eye className="mr-2 h-4 w-4" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={downloadingId === vc.id} onSelect={() => void downloadPdf(vc)}>
                              <Download className="mr-2 h-4 w-4" />
                              {downloadingId === vc.id ? 'Preparing…' : 'Download PDF'}
                            </DropdownMenuItem>
                            {!isVoid && vc.remaining > 0 && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setApplyTarget({
                                    id: vc.id,
                                    number: vc.credit_number,
                                    vendorId: vc.vendor_id,
                                    vendorName: vc.vendors?.name ?? 'the supplier',
                                    remaining: vc.remaining,
                                  })
                                }
                              >
                                <ArrowRightLeft className="mr-2 h-4 w-4" /> Apply to bills
                              </DropdownMenuItem>
                            )}
                            {!isVoid && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onSelect={() => setVoidTarget(vc)}>
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
              ) : vendorCredits.length > 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No supplier credits match “{search}”.
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState
                      icon={ReceiptText}
                      title="No supplier credits yet"
                      description="Record a supplier credit when goods are returned to a supplier, a bill was overcharged, or a discount is agreed."
                      action={
                        <Button onClick={() => setIsFormOpen(true)}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          New Supplier Credit
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
      <VendorCreditForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} />
      {applyTarget && (
        <ApplyVendorCreditDialog
          isOpen={!!applyTarget}
          setIsOpen={(open) => { if (!open) setApplyTarget(null); }}
          vendorCredit={applyTarget}
        />
      )}
      {voidTarget && (
        <VoidVendorCreditDialog
          isOpen={!!voidTarget}
          setIsOpen={(open) => { if (!open) setVoidTarget(null); }}
          vendorCredit={{
            id: voidTarget.id,
            number: voidTarget.credit_number,
            total: voidTarget.total,
            applied: voidTarget.applied,
          }}
        />
      )}
    </>
  );
};

export default VendorCredits;
