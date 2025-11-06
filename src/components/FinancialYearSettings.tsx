import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { useEffect, useMemo, useState } from 'react';
import { format, getYear, set, subDays } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';

const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, name: new Date(0, i).toLocaleString('default', { month: 'long' }) }));
const days = Array.from({ length: 31 }, (_, i) => i + 1);

const financialYearSchema = z.object({
  financial_year_end_month: z.coerce.number(),
  financial_year_end_day: z.coerce.number(),
});
type FinancialYearFormValues = z.infer<typeof financialYearSchema>;

const FinancialYearSettings = () => {
  const { user, profile, refreshProfile, activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [isClosing, setIsClosing] = useState(false);

  const form = useForm<FinancialYearFormValues>({
    resolver: zodResolver(financialYearSchema),
    defaultValues: {
      financial_year_end_month: 12,
      financial_year_end_day: 31,
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        financial_year_end_month: profile.financial_year_end_month || 12,
        financial_year_end_day: profile.financial_year_end_day || 31,
      });
    }
  }, [profile, form]);

  const { data: closedYears, isLoading: isLoadingClosedYears } = useQuery({
    queryKey: ['closed_financial_years', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      const { data, error } = await supabase
        .from('closed_financial_years')
        .select('*')
        .eq('company_id', activeCompany.id)
        .order('end_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const settingsMutation = useMutation({
    mutationFn: async (values: FinancialYearFormValues) => {
      if (!user) throw new Error('User not authenticated');
      const { error } = await supabase.from('profiles').update(values).eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      showSuccess('Financial year settings updated.');
    },
    onError: (error: any) => showError(error.message),
  });

  const closeYearMutation = useMutation({
    mutationFn: async (endDate: Date) => {
      const { error } = await supabase.rpc('close_financial_year', { p_end_date: format(endDate, 'yyyy-MM-dd') });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries(); // Invalidate all queries to refresh data across the app
      showSuccess('Financial year closed successfully!');
    },
    onError: (error: any) => showError(error.message),
    onSettled: () => setIsClosing(false),
  });

  const reopenYearMutation = useMutation({
    mutationFn: async (closedYearId: string) => {
      const { error } = await supabase.rpc('reopen_financial_year', { p_closed_year_id: closedYearId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['closed_financial_years'] });
      showSuccess('Financial year has been re-opened.');
    },
    onError: (error: any) => showError(error.message),
  });

  const { currentYearStartDate, currentYearEndDate } = useMemo(() => {
    if (!profile?.current_financial_year_start) {
      return { currentYearStartDate: null, currentYearEndDate: null };
    }
    const startDate = new Date(profile.current_financial_year_start);
    const endDate = subDays(set(startDate, { year: getYear(startDate) + 1 }), 1);
    return { currentYearStartDate: startDate, currentYearEndDate: endDate };
  }, [profile]);

  const handleCloseYear = () => {
    if (currentYearEndDate) {
      setIsClosing(true);
      closeYearMutation.mutate(currentYearEndDate);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Year</CardTitle>
        <CardDescription>Manage your financial year settings and close your books.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => settingsMutation.mutate(v))} className="space-y-4 max-w-md">
            <div className="flex gap-4">
              <FormField control={form.control} name="financial_year_end_month" render={({ field }) => (
                <FormItem className="flex-1"><FormLabel>Year End Month</FormLabel><Select onValueChange={field.onChange} value={String(field.value)}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="financial_year_end_day" render={({ field }) => (
                <FormItem className="w-24"><FormLabel>Day</FormLabel><Select onValueChange={field.onChange} value={String(field.value)}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{days.map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
            </div>
            <Button type="submit" disabled={settingsMutation.isPending}>
              {settingsMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </form>
        </Form>

        <div className="border-t pt-6">
          <h3 className="font-semibold">Year-End Closing</h3>
          {currentYearStartDate && currentYearEndDate ? (
            <div className="mt-2 text-sm">
              <p>Your current financial year runs from <span className="font-medium">{format(currentYearStartDate, 'PPP')}</span> to <span className="font-medium">{format(currentYearEndDate, 'PPP')}</span>.</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="mt-4">Close Financial Year</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action will close your books for the financial year ending on <span className="font-bold">{format(currentYearEndDate, 'PPP')}</span>. It will zero out all income and expense accounts and transfer the net income to Retained Earnings. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCloseYear} disabled={isClosing}>
                      {isClosing ? 'Closing...' : 'Yes, Close the Year'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">Your current financial year is not set.</p>
          )}
        </div>

        <div className="border-t pt-6">
          <h3 className="font-semibold">Closed Financial Years</h3>
          <CardDescription>You can re-open a past year to make adjustments. This will reverse the closing entry.</CardDescription>
          {isLoadingClosedYears ? (
            <Skeleton className="h-20 w-full mt-2" />
          ) : closedYears && closedYears.length > 0 ? (
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Financial Year</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedYears.map((year) => (
                  <TableRow key={year.id}>
                    <TableCell>
                      {format(new Date(year.start_date), 'PPP')} - {format(new Date(year.end_date), 'PPP')}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">Re-open</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Re-open Financial Year?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will delete the closing journal entry for this period and set it as your active financial year. You will need to close it again after making your changes. Are you sure?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => reopenYearMutation.mutate(year.id)} disabled={reopenYearMutation.isPending}>
                              {reopenYearMutation.isPending ? 'Re-opening...' : 'Yes, Re-open Year'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">No financial years have been closed yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FinancialYearSettings;