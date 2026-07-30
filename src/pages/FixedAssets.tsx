import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  PlusCircle,
  MoreHorizontal,
  Terminal,
  Building2,
  Download,
  BookmarkPlus,
  X,
  ClipboardCheck,
  Layers,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import AssetForm from '../components/AssetForm';
import AssetDisposalForm from '../components/AssetDisposalForm';
import AssetBulkOperationsPanel from '../components/assets/AssetBulkOperationsPanel';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { assetRegisterFacetsQuery, assetRegisterQuery } from '../lib/queries';
import { formatCurrency } from '../lib/utils';
import { showSuccess } from '../utils/toast';
import { DEFAULT_REGISTER_PAGE_SIZE } from '../lib/assets/assetRegisterQuery';
import {
  AssetRegisterFilters,
  AssetSavedView,
  DEFAULT_ASSET_FILTERS,
  EnterpriseFixedAsset,
  loadSavedViews,
  persistSavedViews,
} from '../lib/assets/eamTypes';

function verificationBadgeVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (status) {
    case 'verified':
      return 'success';
    case 'overdue':
    case 'disputed':
      return 'destructive';
    case 'in_progress':
      return 'warning';
    default:
      return 'secondary';
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.trim().length > 0))].sort((a, b) => a.localeCompare(b));
}

function exportAssetsCsv(rows: EnterpriseFixedAsset[], filename: string) {
  const headers = [
    'Code',
    'Description',
    'Category',
    'Purchase Date',
    'Cost',
    'NBV',
    'Status',
    'Verification',
    'Location',
    'Department',
    'Custodian',
  ];
  const lines = rows.map((a) =>
    [
      a.asset_code,
      a.description,
      a.asset_categories?.name ?? '',
      a.purchase_date,
      a.purchase_cost,
      a.net_book_value,
      a.status,
      a.verification_status ?? 'unverified',
      a.location ?? '',
      a.department ?? a.employees?.department ?? '',
      a.custodian_name ??
        [a.employees?.first_name, a.employees?.last_name].filter(Boolean).join(' '),
    ]
      .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const FixedAssets = () => {
  useDocumentTitle('Asset Register');
  const navigate = useNavigate();
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const {
    yearCode,
    financialYearStart,
    financialYearEnd,
  } = useReportingPeriod();
  const fyStart = financialYearStart ? financialYearStart.toISOString().slice(0, 10) : null;
  const fyEnd = financialYearEnd ? financialYearEnd.toISOString().slice(0, 10) : null;

  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [isDisposalFormOpen, setIsDisposalFormOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<EnterpriseFixedAsset | undefined>();
  const [panelAssetId, setPanelAssetId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<AssetRegisterFilters>(DEFAULT_ASSET_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<AssetRegisterFilters>(DEFAULT_ASSET_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = DEFAULT_REGISTER_PAGE_SIZE;
  const [savedViews, setSavedViews] = useState<AssetSavedView[]>(() =>
    companyId ? loadSavedViews(companyId) : []
  );
  const [viewName, setViewName] = useState('');
  const [verificationNote, setVerificationNote] = useState('');
  const [showVerificationPanel, setShowVerificationPanel] = useState(false);
  const [showBulkOps, setShowBulkOps] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (companyId) setSavedViews(loadSavedViews(companyId));
  }, [companyId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedFilters(filters), 300);
    return () => window.clearTimeout(t);
  }, [filters]);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilters]);

  const { data: facets } = useQuery({
    ...assetRegisterFacetsQuery(companyId!),
    enabled: !!companyId,
  });

  const { data: registerPage, isLoading, isFetching } = useQuery({
    ...assetRegisterQuery(companyId!, { page, pageSize, filters: debouncedFilters }),
    enabled: !!companyId,
    placeholderData: (prev) => prev,
  });

  const filtered = (registerPage?.rows ?? []) as EnterpriseFixedAsset[];
  const totalCount = registerPage?.totalCount ?? 0;
  const kpis = registerPage?.kpis ?? {
    totalAssets: 0,
    netBookValue: 0,
    acquisitionCost: 0,
    depreciationYtd: 0,
    impairments: 0,
    awaitingVerification: 0,
  };

  const categories = facets?.categories ?? [];
  const departments = uniqueSorted(facets?.departments ?? []);
  const custodians = uniqueSorted(facets?.custodians ?? []);
  const locations = uniqueSorted(facets?.locations ?? []);
  const statuses = uniqueSorted(facets?.statuses ?? []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const panelAsset = panelAssetId
    ? filtered.find((a) => a.id === panelAssetId) ?? null
    : null;

  const setFilter = <K extends keyof AssetRegisterFilters>(key: K, value: AssetRegisterFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map((a) => a.id)));
  };

  const handleSaveView = () => {
    if (!companyId || !viewName.trim()) return;
    const next: AssetSavedView[] = [
      ...savedViews,
      { id: crypto.randomUUID(), name: viewName.trim(), filters: { ...filters } },
    ];
    setSavedViews(next);
    persistSavedViews(companyId, next);
    setViewName('');
    showSuccess('Saved view stored on this device.');
  };

  const handleApplyView = (view: AssetSavedView) => {
    setFilters({ ...view.filters });
  };

  const handleDeleteView = (id: string) => {
    if (!companyId) return;
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    persistSavedViews(companyId, next);
  };

  /** Operational worklist only — does not post journals or change verification status. */
  const handleMarkForVerificationNote = () => {
    const rows = filtered.filter((a) => selectedIds.has(a.id));
    if (rows.length === 0) return;
    const note = verificationNote.trim() || 'Marked for physical verification';
    exportAssetsCsv(rows, `verification-worklist-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    showSuccess(
      `${rows.length} asset(s) noted for verification. Note: "${note}". No journals posted.`
    );
    setShowVerificationPanel(false);
    setVerificationNote('');
  };

  const handleAddNew = () => {
    setSelectedAsset(undefined);
    setIsAssetFormOpen(true);
  };

  const handleDispose = (asset: EnterpriseFixedAsset) => {
    setSelectedAsset(asset);
    setIsDisposalFormOpen(true);
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-4">
      <Alert className="border-muted bg-muted/30">
        <Terminal className="h-4 w-4" />
        <AlertTitle className="text-sm">Depreciation schedule</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Automate monthly depreciation via a Supabase cron on the <code>run-depreciation</code> Edge Function.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Asset Register</h1>
          <p className="text-sm text-muted-foreground">
            Enterprise fixed asset register with verification and NBV tracking.
            {yearCode && (
              <> · <Badge variant="outline" className="ml-1 align-middle">Current Financial Year</Badge>
                {fyStart && fyEnd ? ` (${fyStart} → ${fyEnd})` : ''}
              </>
            )}
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Asset
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total Assets', value: String(kpis.totalAssets) },
          { label: 'Net Book Value', value: formatCurrency(kpis.netBookValue) },
          { label: 'Acquisition Cost', value: formatCurrency(kpis.acquisitionCost) },
          { label: 'Depreciation YTD', value: formatCurrency(kpis.depreciationYtd) },
          { label: 'Impairments', value: formatCurrency(kpis.impairments) },
          { label: 'Awaiting Verification', value: String(kpis.awaitingVerification) },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-xl font-semibold tabular-nums">{kpi.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters &amp; views</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <Input
                ref={searchInputRef}
                placeholder="Code, tag, location… (/)"
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={filters.categoryId} onValueChange={(v) => setFilter('categoryId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilter('status', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Select value={filters.department} onValueChange={(v) => setFilter('department', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Custodian</Label>
              <Select value={filters.custodian} onValueChange={(v) => setFilter('custodian', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {custodians.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Location</Label>
              <Select value={filters.location} onValueChange={(v) => setFilter('location', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sort</Label>
              <div className="flex gap-1">
                <Select
                  value={filters.sortBy}
                  onValueChange={(v) => setFilter('sortBy', v as AssetRegisterFilters['sortBy'])}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase_date">Purchase date</SelectItem>
                    <SelectItem value="asset_code">Code</SelectItem>
                    <SelectItem value="description">Description</SelectItem>
                    <SelectItem value="purchase_cost">Cost</SelectItem>
                    <SelectItem value="net_book_value">NBV</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filters.sortDir}
                  onValueChange={(v) => setFilter('sortDir', v as 'asc' | 'desc')}
                >
                  <SelectTrigger className="w-[88px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Asc</SelectItem>
                    <SelectItem value="desc">Desc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Save current view</Label>
              <div className="flex gap-2">
                <Input
                  className="w-48"
                  placeholder="View name"
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleSaveView}>
                  <BookmarkPlus className="mr-1 h-4 w-4" />
                  Save
                </Button>
              </div>
            </div>
            {savedViews.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground">Saved:</span>
                {savedViews.map((view) => (
                  <div key={view.id} className="flex items-center gap-1">
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleApplyView(view)}>
                      {view.name}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDeleteView(view.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilters(DEFAULT_ASSET_FILTERS)}
            >
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedCount > 0 && (
        <div className="space-y-3">
          <Card className="border-primary/30 bg-muted/20">
            <CardContent className="flex flex-wrap items-center gap-3 py-3">
              <span className="text-sm font-medium">{selectedCount} selected</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  exportAssetsCsv(
                    filtered.filter((a) => selectedIds.has(a.id)),
                    `asset-register-selected-${format(new Date(), 'yyyy-MM-dd')}.csv`
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowVerificationPanel((v) => !v)}
              >
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Mark for verification note
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showBulkOps ? 'default' : 'outline'}
                onClick={() => setShowBulkOps((v) => !v)}
              >
                <Layers className="mr-2 h-4 w-4" />
                Bulk operations
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
              {showVerificationPanel && (
                <div className="w-full flex flex-col sm:flex-row gap-2 items-end">
                  <div className="flex-1 space-y-1 w-full">
                    <Label className="text-xs">Verification note (no journal posting)</Label>
                    <Textarea
                      rows={2}
                      value={verificationNote}
                      onChange={(e) => setVerificationNote(e.target.value)}
                      placeholder="e.g. Q3 physical count — warehouse A"
                    />
                  </div>
                  <Button type="button" size="sm" onClick={handleMarkForVerificationNote}>
                    Export worklist
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          {showBulkOps && (
            <AssetBulkOperationsPanel
              assetIds={[...selectedIds]}
              onComplete={() => {
                /* keep selection; register refetches via panel */
              }}
            />
          )}
        </div>
      )}

      <div className={`grid gap-4 ${panelAsset ? 'lg:grid-cols-[1fr_320px]' : ''}`}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Register</CardTitle>
            <CardDescription>
              {isLoading
                ? 'Loading…'
                : `${filtered.length} on page · ${totalCount} matching${isFetching ? ' · updating…' : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id))}
                      onCheckedChange={(v) => toggleSelectAll(!!v)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Purchase Date</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">NBV</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={10}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length > 0 ? (
                  filtered.map((asset) => (
                    <TableRow
                      key={asset.id}
                      className={`cursor-pointer ${panelAssetId === asset.id ? 'bg-muted/50' : ''}`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.altKey) {
                          setPanelAssetId(asset.id);
                          return;
                        }
                        navigate(`/fixed-assets/${asset.id}`);
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(asset.id)}
                          onCheckedChange={(v) => toggleSelect(asset.id, !!v)}
                          aria-label={`Select ${asset.asset_code}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{asset.asset_code}</TableCell>
                      <TableCell className="font-medium">{asset.description}</TableCell>
                      <TableCell>{asset.asset_categories?.name || 'N/A'}</TableCell>
                      <TableCell>
                        {asset.purchase_date
                          ? format(new Date(asset.purchase_date), 'PPP')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(asset.purchase_cost)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(asset.net_book_value)}
                      </TableCell>
                      <TableCell className="capitalize">{asset.status}</TableCell>
                      <TableCell>
                        <Badge variant={verificationBadgeVariant(asset.verification_status)}>
                          {asset.verification_status || 'unverified'}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setPanelAssetId(asset.id);
                              }}
                            >
                              Summary panel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/fixed-assets/${asset.id}`)}>
                              Open workspace
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDispose(asset)}
                              className="text-red-600"
                              disabled={asset.status === 'disposed'}
                            >
                              Dispose
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="p-0">
                      <EmptyState
                        icon={Building2}
                        title="No fixed assets yet"
                        description="Register an asset to track its value and let depreciation post automatically each period."
                        action={
                          <Button onClick={handleAddNew}>
                            <PlusCircle className="mr-2 h-4 w-4" /> New Asset
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalCount > pageSize && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || isLoading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {panelAsset && (
          <Card className="h-fit sticky top-4">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{panelAsset.description}</CardTitle>
                  <CardDescription className="font-mono">{panelAsset.asset_code}</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPanelAssetId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="capitalize">
                  {panelAsset.status}
                </Badge>
                <Badge variant={verificationBadgeVariant(panelAsset.verification_status)}>
                  {panelAsset.verification_status || 'unverified'}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium">{panelAsset.asset_categories?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cost / NBV</p>
                <p className="font-mono">
                  {formatCurrency(panelAsset.purchase_cost)} / {formatCurrency(panelAsset.net_book_value)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Location</p>
                <p className="font-medium">{panelAsset.location || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Custodian</p>
                <p className="font-medium">
                  {panelAsset.custodian_name ||
                    [panelAsset.employees?.first_name, panelAsset.employees?.last_name]
                      .filter(Boolean)
                      .join(' ') ||
                    '—'}
                </p>
              </div>
              <Button
                className="w-full"
                onClick={() => navigate(`/fixed-assets/${panelAsset.id}`)}
              >
                Open workspace
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AssetForm
        isOpen={isAssetFormOpen}
        setIsOpen={setIsAssetFormOpen}
        assetId={selectedAsset?.id}
      />
      {selectedAsset && (
        <AssetDisposalForm
          isOpen={isDisposalFormOpen}
          setIsOpen={setIsDisposalFormOpen}
          asset={selectedAsset}
        />
      )}
    </div>
  );
};

export default FixedAssets;
