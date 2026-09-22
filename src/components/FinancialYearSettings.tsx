import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { useEffect, useMemo, useState } from 'react';
import { format, getYear, set, isAfter, addDays } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { financialCalendarService } from '@/governance/domains/financialCalendar/service';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/productAnalytics';
import { useReportingPeriod } from '@/contexts/ReportingPeriodContext';
import { parseIsoDateSafe } from '@/lib/reportingPeriod/presets';
import { formatYearRange } from '@/lib/reportingPeriod/selection';
import { STATUS_TONE_CLASSES, yearStatusMeta } from '@/lib/reportingPeriod/status';
import { cn } from '@/lib/utils';

/**
 * Settings → Financials — sole Financial Calendar configuration surface.
 *
 * Writes:
 *   1) Legacy profile signals (compatibility for settings edge / older clients)
 *   2) Materialises `financial_years` via financialCalendarService.ensureFinancialYear
 *
 * Reporting authority after save:
 *   financial_years → ReportingPeriodContext (invalidateQueries financial_years)
 *
 * Profile financial_year_* fields are NEVER a reporting source of truth, and
 * no longer the source of what this screen calls the current year either:
 * that is the company's current year (financial_year_current()), shown from
 * ReportingPeriodContext. Which year a user is LOOKING at is the header
 * switcher's job; this screen configures and adds years.
 *
 * Only owners and admins may change the calendar (enforced by the
 * financial_years row policy; the controls are disabled for members).
 */

const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, name: new Date(0, i).toLocaleString('default', { month: 'long' }) }));
const days = Array.from({ length: 31 }, (_, i) => i + 1);

const financialYearSchema = z.object({
  financial_year_end_month: z.coerce.number(),
  financial_year_end_day: z.coerce.number(),
});
type FinancialYearFormValues = z.infer<typeof financialYearSchema>;

const FinancialYearSettings = () => {
  const { user, profile, refreshProfile, activeCompany, role } = useAuth();
  const { financialYears, currentFinancialYear, setFinancialYear } = useReportingPeriod();
  const canEditCalendar = role === 'owner' || role === 'admin';
  const queryClient = useQueryClient();
  const [isClosing, setIsClosing] = useState(false);

  const form = useForm<FinancialYearFormValues>({
    resolver: zodResolver(financialYearSchema),
    defaultValues: {
      financial_year_end_month: 12,
      financial_year_end_day: 31,
    },
  });

  const watchedMonth = form.watch('financial_year_end_month');
  const displayMonthName = months[(watchedMonth || profile?.financial_year_end_month || 1) - 1]?.name;

  // The year end shown is the company's (its current financial year), not a
  // value saved on whoever happens to be signed in.
  const currentYearEnd = parseIsoDateSafe(currentFinancialYear?.endDate);
  useEffect(() => {
    if (currentYearEnd) {
      form.reset({
        financial_year_end_month: currentYearEnd.getMonth() + 1,
        financial_year_end_day: currentYearEnd.getDate(),
      });
    } else if (profile) {
      form.reset({
        financial_year_end_month: profile.financial_year_end_month || 12,
        financial_year_end_day: profile.financial_year_end_day || 31,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFinancialYear?.endDate, profile, form]);

  // The calendar-config writes below only persist the legacy profile signals.
  // The posting engine binds journal entries to `financial_years`, so the
  // first-class year for the chosen range has to be materialised alongside them
  // or entries posted into that range stay unbound to any year and period.
  const ensureCalendarMaterialised = async (startDate: Date) => {
    if (!activeCompany) return;
    const endDate = addDays(set(startDate, { year: getYear(startDate) + 1 }), -1);
    const result = await financialCalendarService.ensureFinancialYear(
      activeCompany.id,
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd')
    );
    if (!result.success) throw new Error(result.error || 'Failed to create the financial year.');
  };

  const { data: closedYears, isLoading: isLoadingClosedYears } = useQuery({
    queryKey: ['closed_financial_years', activeCompany?.id],
    // Phase G3.5 — closed years resolve through Governance Financial Calendar Service.
    queryFn: async () => {
      if (!activeCompany) return [];
      return financialCalendarService.getClosedYears(activeCompany.id);
    },
    enabled: !!activeCompany,
  });

  const settingsMutation = useMutation({
    // Phase G3.5 — FY end settings write through Governance (same UPDATE_PROFILE payload).
    mutationFn: async (values: FinancialYearFormValues) => {
      if (!user) throw new Error('User not authenticated');
      const newEndMonth = values.financial_year_end_month - 1;
      const newEndDay = values.financial_year_end_day;
      const today = new Date();
      const currentCalendarYear = getYear(today);
      let lastYearEnd = set(new Date(), { year: currentCalendarYear, month: newEndMonth, date: newEndDay });
      if (isAfter(lastYearEnd, today)) {
        lastYearEnd = set(lastYearEnd, { year: currentCalendarYear - 1 });
      }
      const newStartDate = addDays(lastYearEnd, 1);
      const result = await financialCalendarService.updateFinancialYearEndSettings({
        financial_year_end_month: values.financial_year_end_month,
        financial_year_end_day: values.financial_year_end_day,
        current_financial_year_start: format(newStartDate, 'yyyy-MM-dd'),
      });
      if (!result.success) throw new Error(result.error || 'Failed to update financial year settings.');
      await ensureCalendarMaterialised(newStartDate);
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['financial_years'] });
      queryClient.invalidateQueries({ queryKey: ['financial-periods'] });
      queryClient.invalidateQueries({ queryKey: ['accountingReadiness'] });
      queryClient.invalidateQueries({ queryKey: ['efs_dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['efs_workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['efs_doc_model'] });
      if (activeCompany) {
        trackEvent({
          eventName: AnalyticsEvents.SETUP_FINANCIAL_YEAR_CONFIGURED,
          companyId: activeCompany.id,
          properties: {
            month: form.getValues('financial_year_end_month'),
            day: form.getValues('financial_year_end_day'),
          },
        });
      }
      showSuccess('Financial year settings updated.');
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  const closeYearMutation = useMutation({
    // Phase G3.2 — repointed onto Governance's FinancialCalendarService
    // instead of invoking the `financial-year` edge function directly. The
    // underlying CLOSE call is unchanged; this is the same network request
    // made through the governed access point instead of inline.
    mutationFn: async (endDate: Date) => {
      if (!activeCompany) throw new Error("No active company");
      const result = await financialCalendarService.closeFinancialYear(
        activeCompany.id,
        format(endDate, 'yyyy-MM-dd')
      );
      if (!result.success) throw new Error(result.error || 'Failed to close financial year.');
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries();
      showSuccess('Financial year closed successfully!');
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
    onSettled: () => setIsClosing(false),
  });

  const reopenYearMutation = useMutation({
    // Phase G3.2 — same migration as closeYearMutation above: repointed onto
    // Governance's FinancialCalendarService, underlying REOPEN call unchanged.
    mutationFn: async (closedYearId: string) => {
      if (!activeCompany) throw new Error("No active company");
      const result = await financialCalendarService.reopenFinancialYear(activeCompany.id, closedYearId);
      if (!result.success) throw new Error(result.error || 'Failed to reopen financial year.');
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['closed_financial_years'] });
      showSuccess('Financial year has been re-opened.');
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  // The company's current year, decided in the database — not worked out from
  // the signed-in user's profile, which is per user and could disagree with
  // every other screen.
  const currentYearStartDate = parseIsoDateSafe(currentFinancialYear?.startDate);
  const currentYearEndDate = currentYearEnd;

  const endMonthIndex = (form.watch('financial_year_end_month') || 12) - 1;
  const endDay = form.watch('financial_year_end_day') || 31;
  const existingEndYears = new Set(financialYears.map((y) => y.endDate.slice(0, 4)));
  const availableYears = Array.from({ length: 11 }, (_, i) => getYear(new Date()) - 5 + i)
    .filter((y) => !existingEndYears.has(String(y)));

  const addYearMutation = useMutation({
    // Adds (materialises) a financial year for the company. It does not change
    // which year anyone is looking at beyond selecting the new year in this tab.
    mutationFn: async (year: number) => {
      if (!user) throw new Error('User not authenticated');
      const endDate = set(new Date(0), { year, month: endMonthIndex, date: endDay });
      const newStartDate = addDays(endDate, 1);
      newStartDate.setFullYear(newStartDate.getFullYear() - 1);
      await ensureCalendarMaterialised(newStartDate);
      return year;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['financial_years'] });
      queryClient.invalidateQueries({ queryKey: ['financial-periods'] });
      queryClient.invalidateQueries({ queryKey: ['accountingReadiness'] });
      queryClient.invalidateQueries({ queryKey: ['efs_dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['efs_workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['efs_doc_model'] });
      showSuccess('Financial year added.');
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  const handleYearChange = (yearString: string) => {
    const year = parseInt(yearString, 10);
    if (!isNaN(year)) {
      addYearMutation.mutate(year);
    }
  };

  const handleCloseYear = () => {
    if (currentYearEndDate) {
      setIsClosing(true);
      closeYearMutation.mutate(currentYearEndDate);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Financial Year End</CardTitle>
          <CardDescription>Set the month and day your financial year ends. This affects reporting periods.</CardDescription>
        </CardHeader>
        <CardContent>
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
              <Button type="submit" disabled={settingsMutation.isPending || !canEditCalendar}>
                {settingsMutation.isPending ? 'Saving...' : 'Save Settings'}
              </Button>
              {!canEditCalendar && (
                <p className="text-xs text-muted-foreground">Only an owner or admin can change the company's financial calendar.</p>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financial Years</CardTitle>
          <CardDescription>
            {activeCompany?.name ?? 'This company'}'s financial years. Which year you are looking at is chosen in the
            header, for every screen at once; this is where years are added.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {financialYears.length === 0 ? (
            <p className="text-sm text-muted-foreground">No financial years yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {financialYears.map((y) => {
                  const meta = yearStatusMeta(y.status);
                  return (
                    <TableRow key={y.id}>
                      <TableCell className="font-medium">
                        {y.yearCode}
                        {y.isCurrent && <span className="ml-2 rounded bg-primary/10 px-1 text-[10px] font-semibold uppercase text-primary">Current</span>}
                      </TableCell>
                      <TableCell>{formatYearRange(y)}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex rounded-full border px-2 text-xs font-medium', STATUS_TONE_CLASSES[meta.tone])}>{meta.label}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setFinancialYear(y.id)}>View this year</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <div className="max-w-md space-y-1">
            <p className="text-sm font-medium">Add a financial year</p>
            <Select onValueChange={handleYearChange} value="" disabled={addYearMutation.isPending || !canEditCalendar}>
              <SelectTrigger>
                <SelectValue placeholder={canEditCalendar ? 'Choose the year to add…' : 'Owners and admins can add years'} />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={String(year)}>
                    Year ending {displayMonthName} {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Year-End Closing</CardTitle>
          <CardDescription>Close your books for the current active financial year.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            {currentYearStartDate && currentYearEndDate ? (
              <div className="mt-2 text-sm">
                <p>The company's current financial year{currentFinancialYear ? ` (${currentFinancialYear.yearCode})` : ''} runs from <span className="font-medium">{format(currentYearStartDate, 'PPP')}</span> to <span className="font-medium">{format(currentYearEndDate, 'PPP')}</span>.</p>
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
              <p className="text-sm text-muted-foreground mt-2">This company has no current financial year.</p>
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
    </div>
  );
};

export default FinancialYearSettings;
