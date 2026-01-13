import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, Play } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import RecurringBillForm from '../components/RecurringBillForm';
import { format } from 'date-fns';
import { showSuccess, showError } from '../utils/toast';

const RecurringBills = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: profiles, isLoading } = useQuery<any[]>({
    queryKey: ['recurring_bills', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase.functions.invoke('recurring-bills', {
        body: { method: 'GET_ALL', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('recurring-bills', {
        body: { method: 'DELETE', company_id: activeCompany!.id, id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_bills'] });
      showSuccess('Profile deleted.');
    },
    onError: (e: any) => showError(e.message),
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
        const { data, error } = await supabase.functions.invoke('recurring-bills', {
            body: { method: 'PROCESS_DUE', company_id: activeCompany!.id }
        });
        if(error) throw error;
        return data;
    },
    onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['recurring_bills'] });
        queryClient.invalidateQueries({ queryKey: ['bills'] });
        showSuccess(`Processed ${data.processed} bills.`);
    },
    onError: (e: any) => showError(e.message)
  });

  const handleEdit = (id: string) => {
    setSelectedId(id);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedId(undefined);
    setIsFormOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recurring Bills</CardTitle>
              <CardDescription>Automate bills for rent, subscriptions, and retainers.</CardDescription>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => runNowMutation.mutate()} disabled={runNowMutation.isPending}>
                    <Play className="mr-2 h-4 w-4" /> Run Due Now
                </Button>
                <Button onClick={handleAddNew}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Profile
                </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profile Name</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow>
              ) : profiles && profiles.length > 0 ? (
                profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">{profile.profile_name}</TableCell>
                    <TableCell>{profile.vendors?.name}</TableCell>
                    <TableCell className="capitalize">{profile.frequency}</TableCell>
                    <TableCell>{format(new Date(profile.next_run_date), 'PPP')}</TableCell>
                    <TableCell><Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>{profile.status}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(profile.id)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(profile.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={6} className="text-center">No recurring profiles.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <RecurringBillForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} billId={selectedId} />
    </>
  );
};

export default RecurringBills;