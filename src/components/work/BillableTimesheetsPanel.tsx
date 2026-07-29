import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../integrations/supabase/client';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { showError, showSuccess } from '../../utils/toast';
import TimesheetForm from '../TimesheetForm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import type { Timesheet } from '../../pages/TimeTracking';

/**
 * Billable engagement timesheets — migrated from legacy Log Time into Work Time.
 * Preserves timesheets edge + TimesheetForm business logic unchanged.
 */
export default function BillableTimesheetsPanel() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: timesheets, isLoading } = useQuery<Timesheet[]>({
    queryKey: ['timesheets', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('timesheets', {
        body: { method: 'GET', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('timesheets', {
        body: { method: 'DELETE', company_id: activeCompany.id, timesheetId: id },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheets', activeCompany?.id] });
      showSuccess('Time entry deleted successfully.');
    },
    onError: (error: Error) => showError(`Error deleting entry: ${error.message}`),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Billable timesheets</CardTitle>
              <CardDescription>
                Engagement-level hours for invoicing. Operational allocation lives under Work allocation.
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setSelectedTimesheet(undefined);
                setIsFormOpen(true);
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Log billable time
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Engagement</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    Loading time entries…
                  </TableCell>
                </TableRow>
              ) : timesheets && timesheets.length > 0 ? (
                timesheets.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(new Date(entry.date), 'PPP')}</TableCell>
                    <TableCell className="font-medium">{entry.projects?.name || 'N/A'}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-xs">{entry.notes}</TableCell>
                    <TableCell className="text-right font-mono">{Number(entry.hours).toFixed(2)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedTimesheet(entry);
                              setIsFormOpen(true);
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this time entry?')) {
                                deleteMutation.mutate(entry.id);
                              }
                            }}
                            className="text-red-600"
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    No billable timesheets yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <TimesheetForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} timesheet={selectedTimesheet} />
    </>
  );
}
