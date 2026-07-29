import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { bankAccountsQuery, bankStatementLinesQuery } from '../lib/queries';
import { BankStatementLine } from '../lib/banking/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Progress } from '../components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { FileCheck2, Upload, CheckCircle2, History, Wrench } from 'lucide-react';
import StatementImportDialog from '../components/StatementImportDialog';
import StatementLineMatchDialog from '../components/StatementLineMatchDialog';
import StatementLineAdjustmentDialog from '../components/StatementLineAdjustmentDialog';

const LineRow = ({ line, onMatch, onAdjust }: { line: BankStatementLine; onMatch?: () => void; onAdjust?: () => void }) => (
  <TableRow>
    <TableCell>{format(new Date(line.line_date), 'dd MMM yyyy')}</TableCell>
    <TableCell className="max-w-[240px] truncate">{line.description || '—'}</TableCell>
    <TableCell className="text-right font-mono">{formatCurrency(line.amount)}</TableCell>
    <TableCell><Badge variant={line.match_status === 'unmatched' ? 'warning' : 'success'} className="capitalize">{line.match_status.replace('_', ' ')}</Badge></TableCell>
    <TableCell className="text-right space-x-2">
      {onMatch && <Button size="sm" variant="outline" onClick={onMatch}>Match</Button>}
      {onAdjust && <Button size="sm" variant="outline" onClick={onAdjust}>Adjust</Button>}
    </TableCell>
  </TableRow>
);

const BankReconciliation = () => {
  useDocumentTitle('Bank Reconciliation');
  const { activeCompany } = useAuth();
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [matchLine, setMatchLine] = useState<BankStatementLine | null>(null);
  const [adjustLine, setAdjustLine] = useState<BankStatementLine | null>(null);

  const { data: bankAccounts, isLoading: loadingAccounts } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: lines, isLoading: loadingLines } = useQuery({
    ...bankStatementLinesQuery(activeCompany!.id, selectedAccountId === 'all' ? undefined : selectedAccountId),
    enabled: !!activeCompany,
  });

  const isLoading = loadingAccounts || loadingLines;
  const activeAccount = (bankAccounts ?? []).find((a) => a.id === selectedAccountId);

  const matched = (lines ?? []).filter((l) => l.match_status !== 'unmatched');
  const unmatched = (lines ?? []).filter((l) => l.match_status === 'unmatched');
  const adjustments = (lines ?? []).filter((l) => l.match_status === 'manual_adjustment');
  const total = (lines ?? []).length;
  const progress = total > 0 ? Math.round((matched.length / total) * 100) : 100;

  const importedStatements = useMemo(() => {
    const map = new Map<string, { id: string; bankAccountId: string; count: number; matched: number; minDate: string; maxDate: string }>();
    (lines ?? []).forEach((l) => {
      const existing = map.get(l.statement_import_id);
      if (existing) {
        existing.count += 1;
        if (l.match_status !== 'unmatched') existing.matched += 1;
        if (l.line_date < existing.minDate) existing.minDate = l.line_date;
        if (l.line_date > existing.maxDate) existing.maxDate = l.line_date;
      } else {
        map.set(l.statement_import_id, { id: l.statement_import_id, bankAccountId: l.bank_account_id, count: 1, matched: l.match_status !== 'unmatched' ? 1 : 0, minDate: l.line_date, maxDate: l.line_date });
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.maxDate < b.maxDate ? 1 : -1));
  }, [lines]);

  const history = matched.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div className="section-stack">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Bank Reconciliation</h1>
          <p className="text-muted-foreground">Match imported statement lines against your books.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="All Accounts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {(bankAccounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setIsImportOpen(true)} disabled={selectedAccountId === 'all'}><Upload className="mr-2 h-4 w-4" />Import Statement</Button>
        </div>
      </header>
      {selectedAccountId === 'all' && <p className="text-xs text-muted-foreground -mt-2">Select a specific account to import a new statement.</p>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Reconciliation Progress</CardTitle><CardDescription>{matched.length} of {total} statement lines matched{activeAccount ? ` for ${activeAccount.name}` : ' across all accounts'}.</CardDescription></CardHeader>
        <CardContent><Progress value={progress} /></CardContent>
      </Card>

      <Tabs defaultValue="unmatched" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="imports">Imported Statements</TabsTrigger>
          <TabsTrigger value="all-lines">Statement Lines</TabsTrigger>
          <TabsTrigger value="matched">Matched</TabsTrigger>
          <TabsTrigger value="unmatched">Unmatched</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="imports">
          <Card><CardContent className="pt-6">
            {isLoading ? <Skeleton className="h-48 w-full" /> : importedStatements.length === 0 ? (
              <EmptyState icon={Upload} title="No statements imported yet" action={<Button onClick={() => setIsImportOpen(true)} disabled={selectedAccountId === 'all'}><Upload className="mr-2 h-4 w-4" />Import Statement</Button>} />
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Line Date Range</TableHead><TableHead className="text-right">Lines</TableHead><TableHead className="text-right">Matched</TableHead></TableRow></TableHeader>
                <TableBody>
                  {importedStatements.map((imp) => (
                    <TableRow key={imp.id}>
                      <TableCell>{(bankAccounts ?? []).find((a) => a.id === imp.bankAccountId)?.name ?? '—'}</TableCell>
                      <TableCell>{format(new Date(imp.minDate), 'dd MMM yyyy')} – {format(new Date(imp.maxDate), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="text-right">{imp.count}</TableCell>
                      <TableCell className="text-right">{imp.matched}/{imp.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="all-lines">
          <Card><CardContent className="pt-6">
            {isLoading ? <Skeleton className="h-64 w-full" /> : total === 0 ? <EmptyState icon={FileCheck2} title="No statement lines" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>{(lines ?? []).map((l) => <LineRow key={l.id} line={l} onMatch={l.match_status === 'unmatched' ? () => setMatchLine(l) : undefined} onAdjust={l.match_status === 'unmatched' ? () => setAdjustLine(l) : undefined} />)}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="matched">
          <Card><CardContent className="pt-6">
            {matched.length === 0 ? <EmptyState icon={CheckCircle2} title="Nothing matched yet" /> : (
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>{matched.map((l) => <LineRow key={l.id} line={l} />)}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="unmatched">
          <Card><CardContent className="pt-6">
            {unmatched.length === 0 ? <EmptyState icon={CheckCircle2} title="All caught up" description="No unmatched statement lines." /> : (
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>{unmatched.map((l) => <LineRow key={l.id} line={l} onMatch={() => setMatchLine(l)} onAdjust={() => setAdjustLine(l)} />)}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="adjustments">
          <Card><CardContent className="pt-6">
            {adjustments.length === 0 ? <EmptyState icon={Wrench} title="No adjustments posted" /> : (
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>{adjustments.map((l) => <LineRow key={l.id} line={l} />)}</TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="history">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Reconciliation History</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? <EmptyState icon={History} title="No reconciliation history yet" /> : (
                <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{history.map((l) => <LineRow key={l.id} line={l} />)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedAccountId !== 'all' && <StatementImportDialog isOpen={isImportOpen} setIsOpen={setIsImportOpen} bankAccountId={selectedAccountId} />}
      <StatementLineMatchDialog isOpen={!!matchLine} setIsOpen={() => setMatchLine(null)} line={matchLine} chartOfAccountId={(bankAccounts ?? []).find((a) => a.id === matchLine?.bank_account_id)?.chart_of_account_id ?? ''} />
      <StatementLineAdjustmentDialog isOpen={!!adjustLine} setIsOpen={() => setAdjustLine(null)} line={adjustLine} />
    </div>
  );
};

export default BankReconciliation;
