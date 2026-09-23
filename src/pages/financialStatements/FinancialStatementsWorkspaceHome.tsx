import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useReportingPeriod } from '../../contexts/ReportingPeriodContext';
import {
  ensureWorkspaceForFinancialYear,
  invokeFinancialStatements,
  type EfsWorkspaceListItem,
} from '../../lib/financialStatements/api';
import { workspaceStatusLabel } from '../../lib/financialStatements/presentation';
import {
  formatCalendarYearDisplay,
  resolveCalendarYearForWorkspace,
  resolveEngagementReportingPeriod,
} from '../../lib/financialStatements/calendarYearBinding';
import { yearStatusMeta } from '../../lib/reportingPeriod/status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { showError } from '../../utils/toast';
import { FileSignature, ArrowRight, Loader2 } from 'lucide-react';

/**
 * Financial Statements module landing — engagement list.
 *
 * Financial Year labels come from ReportingPeriodContext (Settings calendar only),
 * and the year this page acts on is the SELECTED year from that same context —
 * the one shown in the header — so Financial Statements can never act on a
 * different year from the rest of Accounting.
 *
 * An engagement is created by one explicit first-use action, not automatically:
 * opening one binds a reporting framework and seals a trial balance, which is a
 * decision, not a side effect of navigation. The action is idempotent
 * (ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR) and the database carries a unique index
 * per (company, entity, financial year), so it cannot produce a second
 * engagement for a year that already has one.
 */
export default function FinancialStatementsWorkspaceHome() {
  const { activeCompany } = useAuth();
  const {
    financialYears,
    activeFinancialYear,
    isCurrentFinancialYear,
    isLoading: calendarLoading,
  } = useReportingPeriod();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = activeCompany?.id;

  const workspacesQuery = useQuery({
    queryKey: ['efs_workspaces', companyId],
    queryFn: () => invokeFinancialStatements<EfsWorkspaceListItem[]>(companyId!, 'LIST_WORKSPACES'),
    enabled: !!companyId,
  });

  const rows = useMemo(() => {
    const years = financialYears;
    const workspaces = workspacesQuery.data || [];
    return workspaces.map((ws) => {
      const calendarYear = resolveCalendarYearForWorkspace(ws, years);
      const resolved = resolveEngagementReportingPeriod(
        ws.efs_reporting_periods,
        years,
        activeFinancialYear,
      );
      const framework =
        ws.efs_framework_bindings?.efs_framework_packs?.efs_frameworks?.name ||
        ws.efs_framework_bindings?.efs_framework_packs?.label ||
        '—';
      // Never fall back to frozen efs_reporting_periods.label (e.g. "Financial Year 2025/26").
      const yearLabel = calendarYear
        ? formatCalendarYearDisplay(calendarYear)
        : resolved.displayLabel;
      return {
        workspace: ws,
        financialYearId: calendarYear?.id ?? ws.efs_reporting_periods?.financial_year_id ?? null,
        financialYear: yearLabel,
        isHistorical: resolved.isHistorical,
        isLegacyUnbound: resolved.isLegacyUnbound,
        framework,
        status: workspaceStatusLabel(ws.status),
        progress: Number(ws.progress_pct || 0),
        updatedAt: ws.updated_at,
      };
    });
  }, [workspacesQuery.data, financialYears, activeFinancialYear]);

  /** The engagement for the year the user is currently in, if it exists. */
  const selectedYearRow = useMemo(
    () =>
      activeFinancialYear
        ? rows.find((row) => row.financialYearId === activeFinancialYear.id) ?? null
        : null,
    [rows, activeFinancialYear],
  );

  const setUpMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('No active company.');
      if (!activeFinancialYear) {
        throw new Error(
          'Select a Financial Year first. Annual Financial Statements are prepared for a year in the Financial Calendar.',
        );
      }
      return ensureWorkspaceForFinancialYear(companyId, activeFinancialYear.id);
    },
    onSuccess: async (ensured) => {
      await queryClient.invalidateQueries({ queryKey: ['efs_workspaces', companyId] });
      // Land in the engagement itself — setting one up and then being returned
      // to an empty list is the behaviour this action exists to remove.
      navigate(`/financial-statements-workspace/${ensured.workspace.id}`);
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  const yearStatus = activeFinancialYear ? yearStatusMeta(activeFinancialYear.status) : null;
  const listLoading = workspacesQuery.isLoading || calendarLoading;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileSignature className="h-6 w-6" />
            Financial Statements
          </h1>
          <p className="text-sm text-muted-foreground">
            Prepare Annual Financial Statements engagements. Live operational reports remain under
            Reports.
          </p>
        </div>
      </div>

      {/* The selected year, and the one action available for it. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {activeCompany?.name ?? 'Company'}
            {activeFinancialYear ? ` · ${activeFinancialYear.yearCode}` : ''}
          </CardTitle>
          <CardDescription>
            {calendarLoading && 'Loading the Financial Calendar…'}
            {!calendarLoading && activeFinancialYear && (
              <>
                {formatCalendarYearDisplay(activeFinancialYear)}
                {yearStatus ? ` · ${yearStatus.label}` : ''}
                {!isCurrentFinancialYear && ' · not the current Financial Year'}
              </>
            )}
            {!calendarLoading && !activeFinancialYear && financialYears.length === 0 && (
              <>
                This company has no Financial Year yet. Annual Financial Statements are prepared for
                a year in the Financial Calendar.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listLoading && <Skeleton className="h-10 w-64" />}

          {!listLoading && !activeFinancialYear && (
            <Button asChild variant="outline">
              <Link to="/settings?tab=accounting">Set up the Financial Year</Link>
            </Button>
          )}

          {!listLoading && activeFinancialYear && selectedYearRow && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() =>
                  navigate(`/financial-statements-workspace/${selectedYearRow.workspace.id}`)
                }
              >
                Open {activeFinancialYear.yearCode} engagement
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedYearRow.status} · {selectedYearRow.progress.toFixed(0)}% complete
              </span>
            </div>
          )}

          {!listLoading && activeFinancialYear && !selectedYearRow && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => setUpMutation.mutate()}
                disabled={setUpMutation.isPending}
                data-testid="afs-set-up"
              >
                {setUpMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Set up Annual Financial Statements
              </Button>
              <span className="text-sm text-muted-foreground">
                Opens the {activeFinancialYear.yearCode} engagement for{' '}
                {activeCompany?.name ?? 'this company'}. Nothing is posted to the ledger.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Engagements</CardTitle>
          <CardDescription>
            One engagement per Enterprise Financial Calendar year. Selecting a row opens the
            existing engagement.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {workspacesQuery.isLoading && (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {workspacesQuery.isError && (
            <p className="p-4 text-sm text-destructive">
              {(workspacesQuery.error as Error).message}
            </p>
          )}
          {!workspacesQuery.isLoading && rows.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No engagements yet. Use the action above to set up Annual Financial Statements for the
              Financial Year you are in.
            </p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Financial Year</th>
                    <th className="px-4 py-3 font-medium">Reporting Framework</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Progress</th>
                    <th className="px-4 py-3 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.workspace.id}
                      className={`cursor-pointer border-b transition-colors hover:bg-muted/40${
                        row.financialYearId && row.financialYearId === activeFinancialYear?.id
                          ? ' bg-muted/30'
                          : ''
                      }`}
                      onClick={() =>
                        navigate(`/financial-statements-workspace/${row.workspace.id}`)
                      }
                    >
                      <td className="px-4 py-3 font-medium">
                        {row.isLegacyUnbound ? (
                          <>
                            Legacy Financial Statement Engagement
                            <span className="mt-0.5 block text-xs font-normal text-amber-800 dark:text-amber-300">
                              {row.financialYear.includes('·')
                                ? row.financialYear.split('·').slice(1).join('·').trim()
                                : 'Not linked to Enterprise Financial Calendar'}
                              {' · open to migrate'}
                            </span>
                          </>
                        ) : (
                          <>
                            {row.financialYear}
                            {row.isHistorical ? (
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                Not current Financial Year
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">{row.framework}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{row.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.progress.toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.updatedAt
                          ? format(new Date(row.updatedAt), 'dd MMM yyyy HH:mm')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
