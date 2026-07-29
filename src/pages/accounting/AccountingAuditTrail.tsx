import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingAuditQuery } from '../../lib/accountingQueries';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';

const TABLES = [
  'all',
  'journal_entries',
  'journal_entry_items',
  'posting_requests',
  'chart_of_accounts',
  'financial_years',
  'accounting_periods',
];

const AccountingAuditTrail = () => {
  useDocumentTitle('Accounting Audit Trail');
  const { activeCompany } = useAuth();
  const [page, setPage] = useState(1);
  const [tableName, setTableName] = useState('all');
  const [selected, setSelected] = useState<any | null>(null);
  const pageSize = 50;

  const { data, isLoading } = useQuery({
    ...accountingAuditQuery(activeCompany!.id, page, pageSize, tableName),
    enabled: !!activeCompany,
  });

  const rows = (data as any)?.rows || [];
  const total = (data as any)?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-7 w-7" /> Audit Trail
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          No hidden accounting activity — created/modified events for books entities.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Accounting Audit Log</CardTitle>
              <CardDescription>Created by · created date · operation · posting source entities</CardDescription>
            </div>
            <Select value={tableName} onValueChange={(v) => { setTableName(v); setPage(1); }}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TABLES.map((t) => <SelectItem key={t} value={t}>{t === 'all' ? 'All accounting tables' : t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-80 w-full" /> : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Posting Source</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{log.changed_by?.slice(0, 8) || '—'}</TableCell>
                      <TableCell>{log.table_name}</TableCell>
                      <TableCell className="font-mono text-xs">{log.record_id?.slice(0, 8) || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={log.operation === 'INSERT' ? 'outline' : log.operation === 'DELETE' ? 'destructive' : 'secondary'}>
                          {log.operation}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.table_name === 'posting_requests' ? 'Posting Engine' : log.table_name}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(log)}>View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between mt-3">
                <div className="text-xs text-muted-foreground">{total.toLocaleString()} events · page {page}/{totalPages}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit Log</DialogTitle>
            <DialogDescription>{selected?.table_name} · {selected?.operation}</DialogDescription>
          </DialogHeader>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-80">
            {JSON.stringify({ old: selected?.old_data, new: selected?.new_data }, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountingAuditTrail;
