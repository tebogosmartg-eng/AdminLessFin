import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Skeleton } from './ui/skeleton';
import { format } from 'date-fns';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

type AuditLog = {
  id: string;
  created_at: string;
  table_name: string;
  record_id: string;
  operation: string;
  old_data: any;
  new_data: any;
  profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
};

const AuditLogViewer = () => {
  const { activeCompany } = useAuth();
  const [tableName, setTableName] = useState('all');

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit_logs', activeCompany?.id, tableName],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('audit-logs', {
        body: {
          company_id: activeCompany.id,
          table_name: tableName,
          limit: 100,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!activeCompany,
  });

  const getOperationColor = (op: string) => {
    switch (op) {
      case 'INSERT': return 'default';
      case 'UPDATE': return 'secondary';
      case 'DELETE': return 'destructive';
      default: return 'outline';
    }
  };

  const formatChanges = (log: AuditLog) => {
    if (log.operation === 'INSERT') {
      return <span className="text-xs text-muted-foreground">New Record ID: {log.new_data?.id || log.record_id}</span>;
    }
    if (log.operation === 'DELETE') {
      return <span className="text-xs text-muted-foreground">Deleted Record ID: {log.old_data?.id || log.record_id}</span>;
    }
    
    // For Updates, try to find what changed
    const changes: string[] = [];
    const oldD = log.old_data || {};
    const newD = log.new_data || {};
    
    Object.keys(newD).forEach(key => {
      if (key === 'updated_at' || key === 'created_at') return; // Ignore timestamps
      if (JSON.stringify(newD[key]) !== JSON.stringify(oldD[key])) {
        changes.push(key);
      }
    });

    if (changes.length === 0) return <span className="text-xs text-muted-foreground">No field changes detected</span>;
    
    return (
      <div className="text-xs">
        <span className="font-semibold">Changed: </span>
        {changes.slice(0, 3).join(', ')}
        {changes.length > 3 && ` +${changes.length - 3} more`}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Audit Trail</CardTitle>
            <CardDescription>View recent system activity and data changes.</CardDescription>
          </div>
          <Select value={tableName} onValueChange={setTableName}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              <SelectItem value="invoices">Invoices</SelectItem>
              <SelectItem value="bills">Bills</SelectItem>
              <SelectItem value="journal_entries">Journal Entries</SelectItem>
              <SelectItem value="customers">Customers</SelectItem>
              <SelectItem value="vendors">Vendors</SelectItem>
              <SelectItem value="products">Products</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs && logs.length > 0 ? (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(log.created_at), 'MMM d, h:mm a')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.profiles?.full_name || 'System'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getOperationColor(log.operation)} className="text-[10px]">
                          {log.operation}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize text-sm font-medium">
                        {log.table_name.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        {formatChanges(log)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No audit logs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default AuditLogViewer;