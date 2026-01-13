import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { format } from 'date-fns';
import { Skeleton } from './ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Eye } from 'lucide-react';

const AuditLogViewer = () => {
  const { activeCompany } = useAuth();
  const [filterTable, setFilterTable] = useState('all');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit_logs', activeCompany?.id, filterTable],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('settings', {
        body: { method: 'GET_AUDIT_LOGS', company_id: activeCompany.id, table_name: filterTable },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT': return <Badge className="bg-green-600">Created</Badge>;
      case 'UPDATE': return <Badge className="bg-blue-600">Updated</Badge>;
      case 'DELETE': return <Badge className="bg-red-600">Deleted</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
    }
  };

  const tables = [
    'invoices', 'bills', 'journal_entries', 'products', 'customers', 'vendors', 'expense_claims'
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Audit Log</CardTitle>
            <CardDescription>Track changes to your data for security and compliance.</CardDescription>
          </div>
          <div className="w-[200px]">
            <Select value={filterTable} onValueChange={setFilterTable}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                {tables.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
            ) : logs && logs.length > 0 ? (
              logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{format(new Date(log.changed_at), 'PP p')}</TableCell>
                  <TableCell className="text-xs">{log.user?.email || 'System/User'}</TableCell>
                  <TableCell className="capitalize">{log.table_name.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{getActionBadge(log.action)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                      <Eye className="h-4 w-4 mr-1" /> View Changes
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No recent activity found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Details</DialogTitle>
            <DialogDescription>
              {selectedLog && `${selectedLog.action} on ${selectedLog.table_name} at ${format(new Date(selectedLog.changed_at), 'PP p')}`}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Old Data</h4>
                <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-[400px]">
                  {selectedLog.old_data ? JSON.stringify(selectedLog.old_data, null, 2) : 'None'}
                </pre>
              </div>
              <div>
                <h4 className="font-semibold mb-2">New Data</h4>
                <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-[400px]">
                  {selectedLog.new_data ? JSON.stringify(selectedLog.new_data, null, 2) : 'None'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AuditLogViewer;