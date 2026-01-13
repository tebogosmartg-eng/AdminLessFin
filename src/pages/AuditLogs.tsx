import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { ChevronLeft, ChevronRight, Activity, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { ScrollArea } from '../components/ui/scroll-area';

type AuditLog = {
  id: string;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  created_at: string;
  old_data: any;
  new_data: any;
  profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
};

const AuditLogs = () => {
  const { activeCompany } = useAuth();
  const [page, setPage] = useState(0);
  const limit = 20;
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit_logs', activeCompany?.id, page],
    queryFn: async () => {
      if (!activeCompany) return { logs: [], count: 0 };
      const { data, error } = await supabase.functions.invoke('audit-logs', {
        body: { company_id: activeCompany.id, page, limit },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
    placeholderData: (prev) => prev,
  });

  const logs = data?.logs || [];
  const count = data?.count || 0;
  const totalPages = Math.ceil(count / limit);

  const getOperationColor = (op: string) => {
    switch (op) {
      case 'INSERT': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'UPDATE': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'DELETE': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getChanges = (log: AuditLog) => {
    if (log.operation === 'INSERT') return "Record Created";
    if (log.operation === 'DELETE') return "Record Deleted";
    
    if (!log.old_data || !log.new_data) return "Details unavailable";

    const changes: string[] = [];
    Object.keys(log.new_data).forEach(key => {
      if (JSON.stringify(log.old_data[key]) !== JSON.stringify(log.new_data[key])) {
        // Skip timestamp fields unless critical
        if (!['updated_at', 'created_at'].includes(key)) {
            changes.push(key);
        }
      }
    });
    
    return changes.length > 0 ? `Changed: ${changes.join(', ')}` : "No material changes";
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-muted-foreground" />
            <div>
              <CardTitle>System Activity</CardTitle>
              <CardDescription>Audit logs for tracking changes to critical data.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : logs.length > 0 ? (
                logs.map((log: AuditLog) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(log.created_at), 'PP p')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{log.profiles?.full_name || 'System'}</span>
                        <span className="text-xs text-muted-foreground">{log.profiles?.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getOperationColor(log.operation)}>
                        {log.operation}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.table_name}</TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]" title={getChanges(log)}>
                      {getChanges(log)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No activity recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-end space-x-2 py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages || 1}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1 || isLoading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log Details</DialogTitle>
            <DialogDescription>
              {selectedLog?.operation} on {selectedLog?.table_name} by {selectedLog?.profiles?.full_name || 'System'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <h4 className="font-semibold mb-2">Previous Data</h4>
              <ScrollArea className="h-64 w-full rounded-md border p-2">
                <pre className="text-xs">{JSON.stringify(selectedLog?.old_data, null, 2)}</pre>
              </ScrollArea>
            </div>
            <div>
              <h4 className="font-semibold mb-2">New Data</h4>
              <ScrollArea className="h-64 w-full rounded-md border p-2">
                <pre className="text-xs">{JSON.stringify(selectedLog?.new_data, null, 2)}</pre>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AuditLogs;